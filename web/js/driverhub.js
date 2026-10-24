// Driver Hub tab: the Driver Station app. Top bar, Autonomous / TeleOp lists, the INIT -> START -> STOP button,
// the 30 s autonomous timer, telemetry, and Configure Robot (port names and types, saved into the robot).
import { HUBS, PORTS, key, CONFIG_TYPES, autoWire } from './wiring.js';
import { readGamepads } from './input.js';
import { setRobot, stopOpMode } from './main.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUPS = [['motor', 'Motors'], ['servo', 'Servos'], ['i2c', 'I2C buses'], ['digital', 'Digital devices'], ['analog', 'Analog input devices'], ['usb', 'USB devices']];

export function initDriverHub(app, $, openWiring) {
  let kind = null, ping = 6;
  // ---- Autonomous / TeleOp lists: the real app keeps them apart
  const filter = (k) => {
    kind = kind === k ? null : k;
    $('dhAuto').classList.toggle('on', kind === 'Autonomous'); $('dhTele').classList.toggle('on', kind === 'TeleOp');
    const sel = $('opmode');
    for (const og of sel.querySelectorAll('optgroup')) for (const o of og.children) o.hidden = !!kind && og.label !== kind;
    const cur = sel.selectedOptions[0];
    if (kind && cur?.hidden) { const first = [...sel.options].find(o => !o.hidden && o.value); if (first) { sel.value = first.value; sel.dispatchEvent(new Event('change')); } }
  };
  $('dhAuto').onclick = () => filter('Autonomous');
  $('dhTele').onclick = () => filter('TeleOp');

  // ---- top bar, timer and the 30 s auto stop
  setInterval(() => {
    const sim = app.sim; if (!sim) return;
    ping = Math.max(3, Math.min(14, ping + (Math.random() - 0.5) * 2));
    $('dhPing').textContent = `${ping.toFixed(0)} ms`;
    $('dhBatt').textContent = `${sim.battery.v.toFixed(2)} V`;
    $('dhBatt').classList.toggle('low', sim.battery.v < 11.5);
    const pads = readGamepads();
    const live = (g) => g.connected && (Math.abs(g.left_stick_x) + Math.abs(g.left_stick_y) + Math.abs(g.right_stick_x) + Math.abs(g.right_stick_y) > 0.05 || ['a', 'b', 'x', 'y', 'left_bumper', 'right_bumper', 'start'].some(b => g[b]));
    $('dhU1').classList.toggle('on', live(pads[0])); $('dhU2').classList.toggle('on', live(pads[1]));
    const run = app.op.state === 'running', t = run ? sim.t - (app.op.t0 ?? sim.t) : 0;
    const shown = run && app.op.kind === 'Autonomous' && $('dhAuto30').checked ? Math.max(0, 30 - t) : t;
    $('dhTimer').textContent = `${Math.floor(shown / 60)}:${String(Math.floor(shown % 60)).padStart(2, '0')}`;
    if (run && app.op.kind === 'Autonomous' && $('dhAuto30').checked && app.match.mode !== 'match' && t >= 30) stopOpMode();
  }, 200);

  // ---- ⋮ menu: Configure Robot
  const cfgBox = $('dhConfig'), main = $('dhMain');
  const open = (on) => { cfgBox.classList.toggle('hidden', !on); main.classList.toggle('hidden', on); $('dhMenu').setAttribute('aria-expanded', String(on)); if (on) renderConfig(); };
  $('dhMenu').onclick = () => open(cfgBox.classList.contains('hidden'));

  function renderConfig() {
    const cfg = app.robotCfg, W = cfg.wiring;
    if (!W) {
      cfgBox.innerHTML = `<div class="dh-cfg-head"><button id="dhBack">‹</button><b>Configure Robot</b></div>
        <p class="hint">No hubs found. Wire the robot first.</p><div class="row"><button id="dhWire">Wiring</button><button id="dhQuick" class="primary" title="Wire and name everything automatically">Auto-wire</button></div>`;
      cfgBox.querySelector('#dhBack').onclick = () => open(false);
      cfgBox.querySelector('#dhWire').onclick = () => { open(false); openWiring(); };
      cfgBox.querySelector('#dhQuick').onclick = () => { setRobot({ ...JSON.parse(JSON.stringify(cfg)), ...autoWire(cfg) }, app.robotModel); renderConfig(); };
      return;
    }
    const C = cfg.hubConfig || {}, hubs = HUBS.filter(h => h.id === 'CH' || W.expansion);
    cfgBox.innerHTML = `<div class="dh-cfg-head"><button id="dhBack" aria-label="Back">‹</button><b>Configure Robot</b><button id="dhSave" class="primary">Save</button></div>
      ${hubs.map(h => `<details class="dh-hub" open><summary>${h.name}</summary>${GROUPS.filter(([k]) => !(h.id === 'EH' && k === 'usb')).map(([k, label]) => `
        <details class="dh-grp"><summary>${label}</summary><table class="t">${Array.from({ length: PORTS[k] }, (_, n) => {
          const kk = key(h.id, k, n), c = C[kk] || {}, fixed = kk === 'CH:i2c:0';
          return `<tr><td>${n}</td><td><select data-k="${kk}" data-f="type" ${fixed ? 'disabled' : ''}><option value="">Nothing</option>${(CONFIG_TYPES[k] || []).map(t => `<option ${t === c.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
            <td><input type="text" data-k="${kk}" data-f="name" value="${esc(c.name || '')}" placeholder="name" spellcheck="false"></td></tr>`;
        }).join('')}</table></details>`).join('')}</details>`).join('')}`;
    cfgBox.querySelector('#dhBack').onclick = () => open(false);
    cfgBox.querySelector('#dhSave').onclick = () => {
      const next = {};
      cfgBox.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k; next[k] ||= { ...(C[k] || {}) }; next[k][i.dataset.f] = i.value.trim(); });
      for (const [k, v] of Object.entries(next)) if (!v.type || !v.name) delete next[k];
      if (C['CH:i2c:0']) next['CH:i2c:0'] = C['CH:i2c:0'];
      setRobot({ ...JSON.parse(JSON.stringify(cfg)), hubConfig: next }, app.robotModel);
      open(false);
    };
  }
  return { renderConfig, open };
}

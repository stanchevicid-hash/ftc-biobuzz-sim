// Robot > Wiring: plug every device into a hub port by hand (click a device, then a port), with real-world mistakes.
import { HUBS, PORTS, key, parseKey, physicalDevices, fits, autoWire, doctor, wiredPorts } from './wiring.js';
import { codeDeviceNames } from './names.js';
import { setRobot } from './main.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND_COLOR = { motor: '#e0a526', servo: '#4f8fe0', i2c: '#57b36a', digital: '#57b36a', analog: '#57b36a', usb: '#9a8fe0' };
const ROWS = [['motor', 'MOTOR'], ['servo', 'SERVO'], ['i2c', 'I2C'], ['digital', 'DIGITAL'], ['analog', 'ANALOG'], ['usb', 'USB']];

export function initLab(app, el) {
  let selected = null;                 // device id waiting for a port
  let menuFor = null;                  // port key with its small menu open
  const cfgCopy = () => JSON.parse(JSON.stringify(app.robotCfg));
  const commit = (cfg) => { setRobot(cfg, app.robotModel); render(); };
  const ensure = (cfg) => { if (!cfg.wiring) { cfg.wiring = { expansion: false, ports: {}, swapped: {} }; cfg.hubConfig = { 'CH:i2c:0': { name: 'imu', type: 'REV internal IMU (BHI260AP)' } }; } return cfg; };

  function hubSvg(hub, cfg) {
    const W = cfg.wiring, on = hub === 'CH' || W?.expansion, devs = Object.fromEntries(physicalDevices(cfg).map(d => [d.id, d]));
    let y = 34, body = '';
    for (const [kind, label] of ROWS) {
      if (hub === 'EH' && kind === 'usb') continue;
      const n = PORTS[kind], w = Math.min(84, (352 - 64) / n - 4);
      body += `<text x="10" y="${y + 17}" class="hub-lbl">${label}</text>`;
      for (let i = 0; i < n; i++) {
        const k = key(hub, kind, i), id = W?.ports?.[k], d = devs[id], x = 64 + i * (w + 4);
        const internal = k === 'CH:i2c:0', wrong = d && d.port !== kind, sw = id && W.swapped?.[id];
        const cls = ['port', id ? 'used' : '', wrong ? 'wrong' : '', selected && devs[selected] && fits(devs[selected], kind) ? 'target' : '', menuFor === k ? 'open' : ''].join(' ');
        body += `<g class="${cls}" data-k="${k}" tabindex="0" role="button" aria-label="${label} ${i}${id ? ', ' + esc(id) : ''}">
          <rect x="${x}" y="${y}" width="${w}" height="24" rx="2"/>${id ? `<rect x="${x}" y="${y}" width="3" height="24" fill="${KIND_COLOR[d?.port] || '#888'}"/>` : ''}
          <text x="${x + w / 2}" y="${y + 16}" text-anchor="middle">${id ? esc(id.length > w / 7 ? id.slice(0, Math.floor(w / 7) - 1) + '…' : id) : (internal ? 'IMU' : i)}${sw ? ' ±' : ''}</text></g>`;
      }
      y += 34;
    }
    return `<svg class="hub ${on ? '' : 'off'}" viewBox="0 0 360 ${y + 4}" role="group" aria-label="${hub === 'CH' ? 'Control Hub' : 'Expansion Hub'}">
      <rect x="1" y="1" width="358" height="${y + 2}" rx="6" class="hub-body"/><text x="10" y="20" class="hub-name">${hub === 'CH' ? 'Control Hub' : 'Expansion Hub'}</text>${body}</svg>`;
  }

  function render() {
    const cfg = app.robotCfg, W = cfg.wiring, devs = physicalDevices(cfg), where = Object.fromEntries(wiredPorts(W).map(([k, id]) => [id, k]));
    const issues = W ? doctor(cfg, codeDeviceNames(app.files || [])) : [];
    el.innerHTML = `
      <div class="row"><button id="lbAuto" class="primary" title="Plug everything into sensible ports and name it like the robot's devices">Auto-wire</button>
        <button id="lbClear">Unplug all</button>
        <label class="chk" title="RS-485 cable between Control Hub and Expansion Hub"><input type="checkbox" id="lbExp" ${W?.expansion ? 'checked' : ''}> Expansion Hub</label></div>
      <div class="lab-devs">${devs.map(d => `<button class="dev ${where[d.id] ? 'in' : ''} ${selected === d.id ? 'sel' : ''}" data-id="${esc(d.id)}" style="--k:${KIND_COLOR[d.port]}" title="${esc(d.type)}${where[d.id] ? ' in ' + esc(where[d.id]) : ''}">${esc(d.id)}</button>`).join('')}</div>
      <div class="lab-hubs">${hubSvg('CH', cfg)}${hubSvg('EH', cfg)}</div>
      <div id="lbMenu" class="lab-menu hidden"></div>
      <h3 class="lab-h">Robot Doctor</h3>
      <ul class="insp lab-doc">${!W ? '<li class="insp-info" title="Until something is plugged in, the code reaches every device by its own name"><span class="insp-dot"></span><div><b>Not wired</b></div></li>'
        : issues.map(r => `<li class="insp-${r.level}" title="${esc(r.fix)}"><span class="insp-dot"></span><div><b>${esc(r.title)}</b>${r.fix ? `<span>${esc(r.fix)}</span>` : ''}</div></li>`).join('')}</ul>`;
    const $ = (s) => el.querySelector(s);
    $('#lbAuto').onclick = () => commit({ ...cfgCopy(), ...autoWire(app.robotCfg) });
    $('#lbClear').onclick = () => { const c = ensure(cfgCopy()); c.wiring.ports = {}; c.wiring.swapped = {}; commit(c); };
    $('#lbExp').onchange = () => { const c = ensure(cfgCopy()); c.wiring.expansion = $('#lbExp').checked; commit(c); };
    el.querySelectorAll('.dev').forEach(b => b.onclick = () => { selected = selected === b.dataset.id ? null : b.dataset.id; menuFor = null; render(); });
    el.querySelectorAll('.lab-doc li').forEach(li => li.onclick = () => li.classList.toggle('open'));
    el.querySelectorAll('g.port').forEach(g => { g.onclick = () => portClick(g.dataset.k); g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); portClick(g.dataset.k); } }; });
    if (menuFor) showMenu(menuFor);
  }

  function portClick(k) {
    const cfg = app.robotCfg, p = parseKey(k);
    if (k === 'CH:i2c:0') return;                                // the IMU lives inside the hub
    if (selected) {
      const d = physicalDevices(cfg).find(x => x.id === selected);
      if (!d || !fits(d, p.kind)) { flash(`${selected} has a ${d?.port === 'motor' ? 'motor' : d?.port === 'servo' ? '3-pin servo' : d?.port === 'usb' ? 'USB' : '4-pin'} plug, it does not fit here`); return; }
      const c = ensure(cfgCopy());
      for (const [kk, id] of Object.entries(c.wiring.ports)) if (id === selected) delete c.wiring.ports[kk];   // one cable, one port
      c.wiring.ports[k] = selected;
      if (p.hub === 'EH') c.wiring.expansion = true;
      selected = null; menuFor = null; commit(c);
      return;
    }
    menuFor = cfg.wiring?.ports?.[k] ? (menuFor === k ? null : k) : null;
    render();
  }

  function showMenu(k) {
    const cfg = app.robotCfg, id = cfg.wiring.ports[k], m = el.querySelector('#lbMenu'), isMotor = parseKey(k).kind === 'motor';
    m.classList.remove('hidden');
    m.innerHTML = `<b>${esc(id)}</b> <span class="small">${esc(k.replace(/:/g, ' '))}</span>
      <button data-a="unplug">Unplug</button>${isMotor ? `<button data-a="swap" title="Swap the red and black leads">${cfg.wiring.swapped?.[id] ? 'Fix leads' : 'Swap leads'}</button>` : ''}`;
    m.querySelectorAll('button').forEach(b => b.onclick = () => {
      const c = cfgCopy();
      if (b.dataset.a === 'unplug') delete c.wiring.ports[k];
      if (b.dataset.a === 'swap') { c.wiring.swapped ||= {}; if (c.wiring.swapped[id]) delete c.wiring.swapped[id]; else c.wiring.swapped[id] = true; }
      menuFor = null; commit(c);
    });
  }
  function flash(msg) { const m = el.querySelector('#lbMenu'); m.classList.remove('hidden'); m.textContent = msg; setTimeout(() => render(), 1800); }

  render();
  return { render };
}

import RAPIER from '../vendor/rapier/rapier.es.js';
import { Renderer } from './render.js';
import { Simulation, TICK } from './sim.js';
import { DEMO_ROBOT } from './robots/demo.js';
import { START_POSES, IN } from './field.js';
import { highlightJava, TeleGraph, fieldPointFromClick } from './extras.js';
import { Recorder } from './recorder.js';
import { bridge } from './bridge.js';
import { readGamepads, assignment, padNames, rumble, KEY_HELP } from './input.js';
import { AUTO_S, TRANSITION_S, TELEOP_S, POINTS } from './scoring.js';
import { initRobotTab } from './setup.js';
import { initCalibTab, initRandomTab } from './calib.js';
import { HELP_HTML } from './help.js';
import { initBenchTab } from './benchui.js';
import { initLab } from './lab.js';
import { initDriverHub } from './driverhub.js';
import { initGame } from './game.js';
import { initMenu } from './menu.js';
import { iconizeToolbar, setPauseIcon } from './icons.js';
import { mechCommands, mechStatus, predictArc } from './manual.js';
import { DEFAULT_NOISE } from './sensors.js';
import { missingNames, suggest } from './names.js';
import { cue, setMuted, isMuted } from './sounds.js';

const $ = (id) => document.getElementById(id);
const LS = { get: (k, d) => { try { const v = localStorage.getItem('ftcsim.' + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('ftcsim.' + k, JSON.stringify(v)); } catch { } } };

await RAPIER.init();
export const app = {
  R: RAPIER, sim: null, renderer: new Renderer($('c'), $('ov')),
  robotCfg: LS.get('robot', null) || DEMO_ROBOT, robotModel: null,
  calib: LS.get('calib', {}), noise: LS.get('noise', {}),
  running: true, speed: 1, op: { state: 'idle', cls: null, name: '', kind: '' }, opmodes: [],
  match: { mode: 'free', phase: 'free', t0: 0, tAutoEnd: 0, tTeleStart: 0 },
  tagView: null, files: LS.get('files', null), active: 0, serverOk: false, ticking: false, retired: [],
};
app.rec = new Recorder();
window.ftcsim = app; // handy for debugging from the console

// ------------------------------------------------------------------ simulation lifecycle
export function startPoseValue() {
  const sel = $('startPose').value;
  if (sel === 'custom') { const c = LS.get('customPose', { x: 0, y: 0, heading: 90 }); return { x: c.x * IN, y: c.y * IN, heading: c.heading }; }
  return START_POSES[sel] || Object.values(START_POSES)[0];
}
// worlds are destroyed only between ticks (a tick may be waiting for the Java bridge)
export function retire(sim) { if (sim) app.retired.push(sim); }
function flushRetired() { if (app.ticking) return; for (const s of app.retired.splice(0)) { try { s.destroy(); } catch { } } }
export function resetSim(extra = {}) {
  if (app.batch) return;                 // a randomized batch owns the simulation; it resets when it finishes
  retire(app.sim);
  const robotCfg = app.robotCfg;
  app.replay = null; $('replayBar').classList.add('hidden');
  app.sim = new Simulation(RAPIER, {
    robotCfg, pose: extra.pose ?? startPoseValue(), alliance: extra.alliance ?? $('alliance').value, others: extra.others ?? otherRobots(),
    params: { ...(app.calib.params || {}), ...(extra.params || {}) }, noise: { ...app.noise, ...(extra.noise || {}) }, seed: extra.seed ?? 1, preload: extra.preload,
  });
  app.sim.hp.auto = $('hpAuto').checked;
  app.renderer.setSim(app.sim, app.robotModel);
  app.match.phase = app.match.mode === 'free' ? 'free' : 'pre';
  app.sim.scorer.reset();
  if (app.files) renderNameCheck();
}
export function setRobot(cfg, model = null) {
  app.robotCfg = cfg; app.robotModel = model;
  try { LS.set('robot', cfg === DEMO_ROBOT ? null : cfg); } catch { }
  stopOpMode().finally(() => resetSim());
}

/** the second robot: alliance partner (other start position) or opponent (other alliance), always the demo robot */
function otherRobots() {
  const mode = $('otherRobot').value; if (mode === 'none') return [];
  const a = $('alliance').value, sp = $('startPose').value;
  const pick = (al, preferFar) => Object.keys(START_POSES).find(k => k.toLowerCase().startsWith(al) && (k.includes('far') === preferFar));
  const key = mode === 'partner' ? pick(a, !sp.includes('far')) : pick(a === 'red' ? 'blue' : 'red', false);
  return [{ cfg: DEMO_ROBOT, pose: START_POSES[key], alliance: mode === 'partner' ? a : (a === 'red' ? 'blue' : 'red') }];
}

// ------------------------------------------------------------------ physics loop (independent from rendering)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function physicsLoop() {
  let last = performance.now(), acc = 0;
  for (;;) {
    const now = performance.now();
    if (app.running && !app.batch) {
      acc = Math.min(acc + (now - last) / 1000 * app.speed, 0.25);
      while (acc >= TICK && !app.batch) {
        app.ticking = true;
        try { await doTick(); } catch (e) { console.error(e); acc = 0; } finally { app.ticking = false; }
        acc -= TICK; flushRetired();
      }
    } else acc = 0;
    flushRetired();
    last = now;
    await sleep(3);
  }
}

function manualCommands(gp, robot = app.sim.robot) {
  // drive any drivetrain from the stick: required wheel surface speed for the requested chassis motion
  const sim = { robot }, vx = gp.left_stick_x, vy = -gp.left_stick_y, w = -gp.right_stick_x * 2.2;
  const out = { motors: {} };
  const ws = sim.robot.wheels.map(wh => {
    const v = [vx - w * wh.pos[1], vy + w * wh.pos[0]];
    const c = wh.fwd[0] * wh.d[0] + wh.fwd[1] * wh.d[1];
    return (wh.d[0] * v[0] + wh.d[1] * v[1]) / (c || 1);
  });
  const mx = Math.max(1, ...ws.map(Math.abs));
  sim.robot.wheels.forEach((wh, i) => { out.motors[wh.motor] = { mode: 'power', p: ws[i] / mx * (wh.motorDir ?? 1), brake: true }; });
  const m = mechCommands(gp, robot);                    // intake, flywheel, hood, feeder without code
  return { motors: { ...m.motors, ...out.motors }, servos: m.servos };
}

async function doTick() {
  const sim = app.sim; if (!sim) return;
  const snap = sim.readSensors();
  app.tagView = snap.apriltag;
  const opActive = app.op.state === 'init' || app.op.state === 'running';
  if (opActive) {
    try {
      const r = await bridge.sync(sim.t, snap, readGamepads(), 40);
      if (sim !== app.sim) return;            // the simulation was reset while waiting
      sim.setCodeCommands(r.out);
      handleStatus(r);
    } catch (e) { setServer(false); app.op.state = 'idle'; showError({ type: 'bridge', message: String(e) }); }
  } else if ($('manualDrive').checked && app.match.phase !== 'auto' && !app.menuOpen) {   // menu keys must not drive the robot
    sim.setCommands(manualCommands(readGamepads()[0]));
  } else sim.setCommands({});
  if (sim.others.length) { const g2 = readGamepads()[1]; for (const o of sim.others) o.applyCommands(o.bot ? o.bot.step(sim, o) : manualCommands(g2, o)); }
  sim.tick();
  app.onTick?.(sim);
  app.rec.capture(sim, { phase: app.match.phase, op: app.op.state, tele: app.lastTele });
  matchStep();
}

function handleStatus(r) {
  if (r.tele) { $('tele').textContent = r.tele.join('\n'); graph.push(app.sim.t, r.tele); app.lastTele = r.tele; }
  if (r.log && r.log.length) { const l = $('log'); l.textContent += r.log.join('\n') + '\n'; if (l.textContent.length > 20000) l.textContent = l.textContent.slice(-15000); l.scrollTop = 1e9; }
  if (r.fb) r.fb.forEach((f, i) => { if (f && f.startsWith('rumble')) rumble(i, +f.split(' ')[3] || 300); });
  if (r.state !== app.op.state) {
    app.op.state = r.state;
    if (r.state === 'error') { showError(r.error); }
    updateDsButtons();
  }
}

// ------------------------------------------------------------------ match timing (section 10.4)
function matchStep() {
  const m = app.match, t = app.sim.t, before = m.phase;
  if (m.mode === 'free') return;
  if (m.phase === 'auto' && t - m.t0 >= AUTO_S) {
    app.sim.scorer.endAuto(); m.phase = 'transition'; m.tAutoEnd = t;
    stopOpMode(); cue('buzzer'); setTimeout(() => cue('pickUp'), 1400);
    const pre = app.opmodes.find(o => o.name === app.op.preselect && o.kind === 'TeleOp');
    if (pre) $('opmode').value = pre.cls;
  } else if (m.phase === 'transition' && t - m.tAutoEnd >= TRANSITION_S) {
    m.phase = 'teleopWait';
  } else if (m.phase === 'teleop' && t - m.tTeleStart >= TELEOP_S) {
    app.sim.scorer.endMatch(); m.phase = 'post'; stopOpMode(); cue('buzzer', 3);
    $('scoreTable').classList.remove('hidden');           // show how the points came together
  }
  if (m.phase === 'teleop') {                      // 1:00 left: FLOWER scoring unlocks (G410); 0:20 left: final stretch
    const left = TELEOP_S - (t - m.tTeleStart); m.cued ||= {};
    if (left <= 60 && !m.cued.chime) { m.cued.chime = true; cue('chime'); }
    if (left <= 20 && !m.cued.whistle) { m.cued.whistle = true; cue('whistle'); }
  }
  if (m.phase !== before) updateDsButtons();
}
function phaseText() {
  const m = app.match, t = app.sim?.t ?? 0, f = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  switch (m.phase) {
    case 'free': return ['Practice', app.op.state === 'running' ? f(t - (app.op.t0 ?? t)) : '0:00'];
    case 'pre': return ['Ready', '2:30'];
    case 'auto': return ['Autonomous', f(AUTO_S - (t - m.t0))];
    case 'transition': return [app.op.state === 'init' ? 'TeleOp ready' : 'Init TeleOp now', f(TRANSITION_S - (t - m.tAutoEnd))];
    case 'teleopWait': return [app.op.state === 'init' ? 'Press Start' : 'Init TeleOp, then Start', '2:00'];
    case 'teleop': { const left = TELEOP_S - (t - m.tTeleStart); return [left <= 60 ? 'Endgame' : 'TeleOp', f(left)]; }
    case 'post': { const S = app.sim.scorer.breakdown(t), r = S.red.total, b = S.blue.total; return [r === b ? `Tie ${r}–${b}` : `${r > b ? 'Red' : 'Blue'} wins ${Math.max(r, b)}–${Math.min(r, b)}`, '0:00']; }
  }
  return ['', ''];
}

// ------------------------------------------------------------------ Driver Station
function setServer(ok) { app.serverOk = ok; const s = $('server'); s.textContent = ok ? 'Java bridge connected' : 'Java bridge offline: run start.bat'; s.className = 'bridge ' + (ok ? 'ok' : 'bad'); s.title = s.textContent; }
function updateDsButtons() {
  const st = app.op.state;
  $('initBtn').disabled = !app.serverOk || !$('opmode').value || st === 'init' || st === 'running' || app.match.phase === 'auto';
  $('startBtn').disabled = st !== 'init' || app.match.phase === 'transition';
  $('stopBtn').disabled = !(st === 'init' || st === 'running');
  // the Code tab has the same three buttons, so edit, build and run happen in one place
  for (const k of ['init', 'start', 'stop']) $('c' + k[0].toUpperCase() + k.slice(1)).disabled = $(k + 'Btn').disabled;
  $('codeOp').textContent = $('opmode').selectedOptions[0]?.textContent || '';
  $('opState').textContent = { idle: '', init: 'Ready', running: 'Running', stopped: 'Stopped', error: 'Crashed' }[st] ?? st;
}
export async function initOpMode() {
  if (app.batch) { alert('A randomized batch is running. Wait for it to finish or stop it in the Randomize tab.'); return; }
  const cls = $('opmode').value, om = app.opmodes.find(o => o.cls === cls); if (!om) return;
  hideError(); $('tele').textContent = ''; graph.reset();
  if (app.match.mode === 'match' && (app.match.phase === 'post' || app.match.phase === 'pre' || app.match.phase === 'free') && om.kind === 'Autonomous') resetSim();
  try {
    const r = await bridge.init(cls, om.name, app.sim.devices(), app.sim.t, app.sim.readSensors());
    Object.assign(app.op, { state: r.state, cls, name: om.name, kind: om.kind, preselect: om.preselectTeleOp });
    if (r.state === 'error') showError(r.error);
  } catch (e) { showError({ type: 'init', message: String(e) }); }
  updateDsButtons();
}
export async function startOpMode() {
  const r = await bridge.start(); app.op.state = r.state; app.op.t0 = app.sim.t;
  const m = app.match;
  if (m.mode === 'match') {
    if (app.op.kind === 'Autonomous' && (m.phase === 'pre' || m.phase === 'post')) { m.phase = 'auto'; m.t0 = app.sim.t; app.sim.scorer.startMatch(app.sim.t); m.cued = {}; cue('charge'); }
    else if (m.phase === 'teleopWait' || m.phase === 'transition') { m.phase = 'teleop'; m.tTeleStart = app.sim.t; cue('bells'); }
    else if (m.phase === 'pre' || m.phase === 'post') { m.phase = 'teleop'; m.tTeleStart = app.sim.t; app.sim.scorer.startMatch(app.sim.t - AUTO_S - TRANSITION_S); m.cued = {}; cue('bells'); }
  }
  updateDsButtons();
}
export async function stopOpMode() {
  if (app.op.state === 'init' || app.op.state === 'running') { try { const r = await bridge.stop(); app.op.state = r.state === 'error' ? 'error' : 'stopped'; if (r.state === 'error') showError(r.error); } catch { app.op.state = 'idle'; } }
  app.sim?.setCommands({}); updateDsButtons();
}
function showError(e) {
  if (!e) return;
  const b = $('errBox'); b.classList.remove('hidden');
  const frames = (e.frames || []).map(f => `  <a data-file="${esc(f.file)}" data-line="${+f.line}">${esc(f.file)}:${+f.line}</a>  ${esc(f.method)}`).join('\n');
  b.innerHTML = `<b>${esc(e.type || 'Error')}</b>: ${esc(e.message || '')}\n${frames}${e.text ? `\n<details><summary>stack trace</summary>${esc(e.text)}</details>` : ''}`;
  b.querySelectorAll('a').forEach(a => a.onclick = () => gotoLine(a.dataset.file, +a.dataset.line));
}
// ---- device names: the team's code may call the drive motors "leftFront" while this robot calls them "frontLeft"
function renderNameCheck() {
  const box = $('nameCheck'); if (!app.sim) return;
  const robotDevs = app.sim.devices(false), aliases = app.robotCfg.aliases || {};
  const miss = missingNames(files(), robotDevs, aliases);
  box.classList.toggle('hidden', !miss.length); if (!miss.length) { box.innerHTML = ''; return; }
  const taken = new Set();         // two missing names in one list should not both get the same device
  const rows = miss.map(w => {
    const guess = suggest(w, robotDevs, taken); if (guess) taken.add(guess);
    const ok = robotDevs.filter(d => (w.type === 'distance' ? ['distance', 'color'] : [w.type]).includes(d.type));
    const sel = ok.length ? `<select data-alias="${esc(w.name)}"><option value="">Not on this robot</option>${ok.map(d => `<option ${d.name === guess ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`
      : `<span class="small">no ${w.type} on this robot</span>`;
    return `<div class="nc-row"><a data-file="${esc(w.file)}" data-line="${w.line}"><code>"${esc(w.name)}"</code></a><span class="small">${esc(w.javaType)}</span><span class="nc-arrow">→</span>${sel}</div>`;
  }).join('');
  box.innerHTML = `<b title="On the real robot this throws Unable to find a hardware device. Your code is not changed.">${miss.length} device name${miss.length > 1 ? 's' : ''} in your code not on this robot</b>${rows}
    <div class="row"><button id="ncApply" class="primary">Use these names</button></div>`;
  box.querySelectorAll('a').forEach(a => a.onclick = () => { switchTab('code'); gotoLine(a.dataset.file, +a.dataset.line); });
  $('ncApply').onclick = () => {
    const cfg = JSON.parse(JSON.stringify(app.robotCfg)); cfg.aliases = { ...(cfg.aliases || {}) };
    box.querySelectorAll('select[data-alias]').forEach(s => {
      if (!s.value) return;
      const entry = cfg.hubConfig && Object.values(cfg.hubConfig).find(c => c?.name === s.value);
      if (entry) entry.name = s.dataset.alias; else cfg.aliases[s.dataset.alias] = s.value;
    });
    setRobot(cfg, app.robotModel);
  };
}
function hideError() { $('errBox').classList.add('hidden'); }
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fillOpModes(list) {
  app.opmodes = list;
  setTimeout(() => app.onOpModes?.(), 0);
  const sel = $('opmode'), prev = sel.value;
  sel.innerHTML = list.length ? '' : '<option value="">No @TeleOp or @Autonomous classes in your code</option>';
  for (const kind of ['Autonomous', 'TeleOp']) {
    const g = document.createElement('optgroup'); g.label = kind;
    for (const o of list.filter(o => o.kind === kind).sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name))) {
      const op = document.createElement('option'); op.value = o.cls; op.textContent = (o.group ? o.group + ' / ' : '') + o.name; g.appendChild(op);
    }
    if (g.children.length) sel.appendChild(g);
  }
  if (list.some(o => o.cls === prev)) sel.value = prev;
  updateDsButtons();
}

// ------------------------------------------------------------------ code editor
function files() { return app.files || []; }
function saveFiles() { LS.set('files', app.files); }
function renderTabs() {
  const ft = $('fileTabs'); ft.innerHTML = '';
  files().forEach((f, i) => { const b = document.createElement('button'); b.textContent = f.name; b.className = i === app.active ? 'on' : ''; b.onclick = () => { syncEditor(); app.active = i; showFile(); }; ft.appendChild(b); });
}
function showFile() { renderTabs(); const f = files()[app.active]; $('src').value = f ? f.code : ''; updateGutter(); }
function syncEditor() { const f = files()[app.active]; if (f) { f.code = $('src').value; const m = f.code.match(/public\s+(?:final\s+)?class\s+(\w+)/); if (m && f.name !== m[1] + '.java') { f.name = m[1] + '.java'; renderTabs(); } saveFiles(); } }
let diagLines = new Set();
function updateGutter() {
  const n = $('src').value.split('\n').length; let s = '';
  for (let i = 1; i <= n; i++) s += diagLines.has(i) ? `<span class="bad">${i}</span>\n` : i + '\n';
  $('gutter').innerHTML = s; $('gutter').scrollTop = $('src').scrollTop;
  $('hl').innerHTML = highlightJava($('src').value); $('hl').scrollTop = $('src').scrollTop; $('hl').scrollLeft = $('src').scrollLeft;
}
function gotoLine(file, line) {
  syncEditor();
  const i = files().findIndex(f => f.name === file); if (i < 0) return;
  switchTab('code'); app.active = i; showFile();
  const ta = $('src'), lines = ta.value.split('\n'); let pos = 0;
  for (let k = 0; k < line - 1 && k < lines.length; k++) pos += lines[k].length + 1;
  ta.focus(); ta.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
  ta.scrollTop = Math.max(0, (line - 6) * 18.1);
}
async function build() {
  syncEditor();
  $('diag').innerHTML = '<span class="hint">Building…</span>';
  try {
    await stopOpMode();
    const r = await bridge.compile(files().map(f => ({ name: f.name, code: f.code })));
    diagLines = new Set(r.diagnostics.filter(d => d.kind === 'ERROR' && d.file === files()[app.active]?.name).map(d => d.line));
    updateGutter();
    const items = r.diagnostics.map(d => `<div class="${d.kind === 'ERROR' ? 'e' : 'w'}"><a data-file="${esc(d.file)}" data-line="${+d.line}">${esc(d.file)}:${+d.line}</a> ${d.kind === 'ERROR' ? 'error' : d.kind.toLowerCase()}: ${esc(d.msg)}</div>`);
    if (r.ok) items.unshift(`<div class="ok">${r.opmodes.length ? 'Built' : 'Built. No @TeleOp or @Autonomous yet.'}</div>` +
      (r.opmodes.length ? `<div class="runlist">${r.opmodes.map(o => `<button data-run="${esc(o.cls)}" title="Open Driver Station and press Init">${esc(o.name)}</button>`).join('')}</div>` : ''));
    $('diag').innerHTML = items.join('');
    $('diag').querySelectorAll('a').forEach(a => a.onclick = () => gotoLine(a.dataset.file, +a.dataset.line));
    $('diag').querySelectorAll('[data-run]').forEach(b => b.onclick = () => { $('opmode').value = b.dataset.run; updateDsButtons(); initOpMode(); });
    fillOpModes(r.opmodes);
    renderNameCheck();
    if (r.ok && r.opmodes.length) { /* stay on the code tab so the user sees the result */ }
  } catch (e) { $('diag').innerHTML = `<div class="e">${esc(String(e))}</div>`; }
}
async function loadExamples(replace) {
  try {
    const ex = await bridge.examples();
    if (replace || !app.files) app.files = ex; else for (const e of ex) if (!app.files.some(f => f.name === e.name)) app.files.push(e);
    app.active = 0; saveFiles(); showFile();
  } catch (e) { $('diag').textContent = 'Could not load the examples: ' + e; }
}

// ------------------------------------------------------------------ UI wiring
function switchTab(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== 'p-' + t));
  $('side').classList.toggle('wide', t === 'code' || t === 'robot' || t === 'help' || t === 'bench' || t === 'dh');
  if (t === 'code') showFile();
  if (t === 'bench') app.onRobotChangedBench?.();
  if (t === 'ds') game?.render();
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll('#camBtns [data-cam]').forEach(b => b.onclick = () => {
  document.querySelectorAll('#camBtns [data-cam]').forEach(x => x.classList.toggle('on', x === b));
  app.renderer.setMode(b.dataset.cam === 'driverRed' && $('alliance').value === 'blue' ? 'driverBlue' : b.dataset.cam);
});
$('camInset').onclick = () => { app.renderer.showCam = !app.renderer.showCam; $('camInset').classList.toggle('on', app.renderer.showCam); };
$('pauseBtn').onclick = () => { app.running = !app.running; setPauseIcon(app.running); };
$('speed').onchange = () => app.speed = +$('speed').value;
$('quality').value = app.renderer.quality;
$('quality').onchange = () => app.renderer.setQuality($('quality').value);
app.renderer.onAutoQuality = (q) => { $('quality').value = q; };
$('resetBtn').onclick = async () => { if (app.batch) { alert('A randomized batch is running. Wait for it to finish or stop it in the Randomize tab.'); return; } await stopOpMode(); resetSim(); };
for (const [k, v] of Object.entries(START_POSES)) { const o = document.createElement('option'); o.value = k; o.textContent = k; $('startPose').appendChild(o); }
{ const o = document.createElement('option'); o.value = 'custom'; o.textContent = 'Custom position…'; $('startPose').appendChild(o); }
const graph = new TeleGraph($('teleGraph'), $('teleSeries'));
function showCustomPose() {
  const on = $('startPose').value === 'custom', c = LS.get('customPose', { x: 0, y: 0, heading: 90 });
  $('customPoseRow').classList.toggle('hidden', !on);
  $('cpX').value = c.x; $('cpY').value = c.y; $('cpH').value = c.heading;
}
function saveCustomPose(c) { LS.set('customPose', c); showCustomPose(); stopOpMode().then(() => resetSim()); }
for (const id of ['cpX', 'cpY', 'cpH']) $(id).onchange = () => saveCustomPose({ x: +$('cpX').value || 0, y: +$('cpY').value || 0, heading: +$('cpH').value || 0 });
let pick = 0, picked = null;
$('cpPick').onclick = () => { pick = 1; $('cpPick').textContent = 'Click where the robot stands…'; };
$('c').addEventListener('click', (ev) => {
  if (!pick) return;
  const p = fieldPointFromClick(app.renderer, ev); if (!p) return;
  const lim = 72 - 9;
  if (pick === 1) { picked = { x: Math.max(-lim, Math.min(lim, p.x / IN)), y: Math.max(-lim, Math.min(lim, p.y / IN)) }; pick = 2; $('cpPick').textContent = 'Now click where it faces…'; return; }
  const heading = Math.atan2(p.y / IN - picked.y, p.x / IN - picked.x) * 180 / Math.PI;
  pick = 0; $('cpPick').textContent = 'Pick on field';
  saveCustomPose({ x: +picked.x.toFixed(1), y: +picked.y.toFixed(1), heading: Math.round(heading) });
});
$('startPose').onchange = $('alliance').onchange = async () => {
  const a = $('alliance').value, sp = $('startPose').value;
  if (sp !== 'custom' && !sp.toLowerCase().startsWith(a)) $('startPose').value = Object.keys(START_POSES).find(k => k.toLowerCase().startsWith(a));
  showCustomPose();
  await stopOpMode(); resetSim();
};
$('matchMode').onchange = async () => { app.match.mode = $('matchMode').value; await stopOpMode(); resetSim(); };
$('initBtn').onclick = $('cInit').onclick = initOpMode; $('startBtn').onclick = $('cStart').onclick = startOpMode; $('stopBtn').onclick = $('cStop').onclick = () => stopOpMode();
$('opmode').onchange = updateDsButtons;
$('g1').onchange = () => assignment.g1 = $('g1').value; $('g2').onchange = () => assignment.g2 = $('g2').value;
$('hpRed').onclick = () => app.sim.humanPlayerNectar('red'); $('hpBlue').onclick = () => app.sim.humanPlayerNectar('blue');
$('hpAuto').onchange = () => app.sim.hp.auto = $('hpAuto').checked;
$('src').addEventListener('input', () => { updateGutter(); clearTimeout(app._st); app._st = setTimeout(syncEditor, 500); });
$('src').addEventListener('scroll', () => { $('gutter').scrollTop = $('hl').scrollTop = $('src').scrollTop; $('hl').scrollLeft = $('src').scrollLeft; });
$('src').addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); const t = e.target, s = t.selectionStart; t.setRangeText('    ', s, t.selectionEnd, 'end'); updateGutter(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); syncEditor(); build(); }
});
$('buildBtn').onclick = build;
$('newFile').onclick = () => {
  syncEditor(); const name = prompt('Class name', 'MyOpMode'); if (!name) return;
  app.files.push({ name: name + '.java', code: `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\nimport com.qualcomm.robotcore.eventloop.opmode.TeleOp;\n\n@TeleOp(name = "${name}")\npublic class ${name} extends LinearOpMode {\n    @Override\n    public void runOpMode() {\n        waitForStart();\n        while (opModeIsActive()) {\n            telemetry.update();\n        }\n    }\n}\n` });
  app.active = app.files.length - 1; saveFiles(); showFile();
};
$('upJava').onchange = async (e) => {
  syncEditor();
  for (const f of e.target.files) { const code = await f.text(); const i = app.files.findIndex(x => x.name === f.name); if (i >= 0) app.files[i].code = code; else app.files.push({ name: f.name, code }); }
  app.active = app.files.length - 1; saveFiles(); showFile(); e.target.value = '';
};
$('delFile').onclick = () => { if (!files().length || !confirm('Delete ' + files()[app.active].name + '?')) return; app.files.splice(app.active, 1); app.active = 0; saveFiles(); showFile(); };
$('loadExamples').onclick = () => { if (confirm('Add the example OpModes? Files you already have with the same names stay untouched.')) loadExamples(false); };
$('saveFiles').onclick = () => { syncEditor(); for (const f of files()) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.code], { type: 'text/x-java' })); a.download = f.name; a.click(); } };

// HUD
const rate = { t: 0, sim: null, x: null };
function hud() {
  const sim = app.sim; if (!sim) return;
  if (!app.batch && sim.robot.body.translation().z < -2) { resetSim(); return; }   // knocked off the field: start over
  const S = sim.scorer.breakdown(sim.t);
  $('sRed').textContent = S.red.total; $('sBlue').textContent = S.blue.total;
  const [ph, tm] = phaseText(); $('phase').textContent = ph; $('timer').textContent = tm;
  if (!$('scoreTable').classList.contains('hidden')) {
    const rows = [
      ['Leave', a => S[a].leave ? POINTS.leave : 0], ['Auto park', a => S[a].autoPark ? POINTS.autoPark : 0],
      ['HIVE tips', a => `${S[a].tips} × ${POINTS.tip}`], ['In upper CELL', a => `${S[a].cell} × 2`],
      ['In owned FLOWER', a => `${S[a].flowerElems} × 2`], ['Bottom NECTAR', a => `${S[a].bottomNectar} × 5`],
      ['In GARDEN', a => `${S[a].garden} × 1`], ['Park', a => S[a].teleopPark ? POINTS.teleopPark : 0],
    ];
    const owners = S.flowers.map(f => f.owner ? f.owner[0].toUpperCase() : '–').join(' ');
    $('scoreTable').innerHTML = '<table><tr><th></th><th class="r">Red</th><th class="b">Blue</th></tr>' +
      rows.map(([n, g]) => `<tr><td>${n}</td><td>${g('red')}</td><td>${g('blue')}</td></tr>`).join('') +
      `<tr class="total"><td>Total</td><td>${S.red.total}</td><td>${S.blue.total}</td></tr></table>` +
      `<div class="note">FLOWER owners: ${owners}. Human player NECTAR left: red ${sim.hp.red}, blue ${sim.hp.blue}. Leave and park count for your robot only. The balls staged in the HIVEs and GARDENs at the start already count, so neither alliance starts at 0.</div>`;
  }
  const now = performance.now();
  if (now - rate.t > 1000) { rate.x = rate.sim != null && sim.t >= rate.sim ? (sim.t - rate.sim) / ((now - rate.t) / 1000) : null; rate.sim = sim.t; rate.t = now; }
  const slow = app.running && app.speed > 1 && rate.x != null && rate.x < app.speed * 0.85 ? `   running at ${rate.x.toFixed(1)}× (your computer's limit)` : '';
  const r = sim.robot, p = r.pose();
  const held = r.holders.map(h => `${h.id} ${h.balls.length}`).join(', ');
  $('simInfo').textContent = `${sim.t.toFixed(1)} s   x ${(p.x / 0.0254).toFixed(1)} in   y ${(p.y / 0.0254).toFixed(1)} in   ${p.heading.toFixed(0)}°\n` +
    `Battery ${sim.battery.v.toFixed(2)} V   ${sim.battery.i.toFixed(1)} A   holding: ${held || 'nothing'}${slow}` +
    ((ms) => ms && ms.fly ? `\nFlywheel ${ms.rpm.toFixed(0)} / ${ms.target} RPM   hood ${ms.hood?.toFixed(2) ?? '-'}` : '')(app.op.state === 'running' ? null : mechStatus(r));
  const pads = padNames(); $('padInfo').textContent = pads.length ? 'Gamepad: ' + pads.join(', ') : ''; $('padInfo').title = 'Keyboard: ' + KEY_HELP;
}
let trailLen = -1, lastFrame = performance.now();
function frame() {
  const now = performance.now(), dt = (now - lastFrame) / 1000; lastFrame = now;
  if (app.replay) replayStep(dt);
  if (app.renderer.trail && app.rec.trail.length !== trailLen) { trailLen = app.rec.trail.length; app.renderer.setTrail(app.rec.trail); }
  app.renderer.setArc(app.sim ? predictArc(app.sim.robot) : null);
  app.renderer.render(app.tagView); hud(); if ($('graphBox').open) graph.draw(); requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ trail, CSV log, replay
const showSound = () => { $('soundBtn').classList.toggle('on', !isMuted()); $('soundBtn').setAttribute('aria-pressed', String(!isMuted())); };
showSound();
$('soundBtn').onclick = () => { setMuted(!isMuted()); showSound(); if (!isMuted()) cue('chime'); };
$('keysBtn').onclick =() => { const h = $('keys').classList.toggle('hidden'); $('keysBtn').classList.toggle('on', !h); $('keysBtn').setAttribute('aria-expanded', String(!h)); };
$('hud').onclick = () => $('scoreTable').classList.toggle('hidden');
$('trailBtn').onclick = () => { app.renderer.showTrail = !(app.renderer.showTrail ?? true); app.renderer.trail.visible = app.renderer.showTrail; $('trailBtn').classList.toggle('on', app.renderer.showTrail); };
$('csvBtn').onclick = () => {
  const csv = app.rec.csv(); if (!csv) { alert('Nothing recorded yet. Run the simulation first.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'ftcsim-run-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv'; a.click();
};
$('replayBtn').onclick = async () => {
  if (app.rec.frames.length < 10) { alert('Nothing recorded yet. Run the simulation first.'); return; }
  await stopOpMode();
  app.running = false; setPauseIcon(false);
  const f0 = app.rec.frames[0].t;
  app.replay = { t: 0, playing: false, t0: f0, dur: app.rec.duration };
  $('rpSlider').max = app.replay.dur.toFixed(2); $('rpSlider').value = 0; $('replayBar').classList.remove('hidden');
  replaySeek(0);
};
function replaySeek(t) {
  const R = app.replay; R.t = Math.max(0, Math.min(R.dur, t));
  const f = app.rec.apply(app.sim, R.t0 + R.t);
  $('rpSlider').value = R.t.toFixed(2); $('rpTime').textContent = R.t.toFixed(1) + ' c';
  if (f?.tele) $('tele').textContent = f.tele.join('\n');
}
function replayStep(dt) { const R = app.replay; if (R.playing) { replaySeek(R.t + dt * +$('rpSpeed').value); if (R.t >= R.dur) { R.playing = false; $('rpPlay').textContent = '▶'; } } }
$('rpSlider').oninput = () => { app.replay.playing = false; $('rpPlay').textContent = '▶'; replaySeek(+$('rpSlider').value); };
$('rpPlay').onclick = () => { const R = app.replay; if (R.t >= R.dur) R.t = 0; R.playing = !R.playing; $('rpPlay').textContent = R.playing ? '⏸' : '▶'; };
$('rpExit').onclick = () => { app.running = true; setPauseIcon(true); resetSim(); };
$('otherRobot').onchange = async () => { await stopOpMode(); resetSim(); };

// ------------------------------------------------------------------ Settings tab
const NOISE_LABEL = {
  sensorDelayMs: 'Sensor delay, ms', actuatorDelayMs: 'Command delay, ms', imuNoiseDeg: 'IMU noise, °', imuDriftDegPerMin: 'IMU drift, °/min',
  distNoiseFrac: 'Distance noise, ×', distNoiseMm: 'Distance noise, mm', colorNoise: 'Color noise',
  tagPosNoise: 'Tag position noise, m', tagAngNoiseDeg: 'Tag angle noise, °', encoderNoiseTicks: 'Encoder noise, ticks', pinpointNoise: 'Pinpoint noise, m',
};
function initSettings() {
  $('setQuality').value = app.renderer.quality;
  $('setQuality').onchange = () => { app.renderer.setQuality($('setQuality').value); $('quality').value = $('setQuality').value; };
  $('quality').addEventListener('change', () => { $('setQuality').value = $('quality').value; });
  $('setSound').value = isMuted() ? 'off' : 'on';
  $('setSound').onchange = () => { setMuted($('setSound').value === 'off'); showSound(); };
  $('soundBtn').addEventListener('click', () => { $('setSound').value = isMuted() ? 'off' : 'on'; });
  const form = () => {
    $('noiseForm').innerHTML = Object.keys(DEFAULT_NOISE).map(k => `<label>${esc(NOISE_LABEL[k] || k)} <input type="number" step="any" min="0" data-k="${esc(k)}" value="${app.noise[k] ?? DEFAULT_NOISE[k]}"></label>`).join('');
    $('noiseForm').querySelectorAll('input').forEach(i => i.onchange = () => {
      const v = Math.max(0, parseFloat(i.value) || 0); app.noise[i.dataset.k] = v; LS.set('noise', app.noise);
      if (app.sim) app.sim.noise[i.dataset.k] = v;                 // takes effect immediately
    });
  };
  const setAll = (n) => { app.noise = n; LS.set('noise', n); if (app.sim) app.sim.noise = { ...DEFAULT_NOISE, ...n }; form(); };
  $('noiseReset').onclick = () => setAll({});
  $('noiseOff').onclick = () => setAll(Object.fromEntries(Object.keys(DEFAULT_NOISE).map(k => [k, 0])));
  form();
  $('clearCalib').onclick = async () => { app.calib = {}; LS.set('calib', {}); await stopOpMode(); resetSim(); };
  $('clearAll').onclick = () => {
    if (!confirm('Delete your saved code, robot, calibration and settings from this browser? Download anything you want to keep first.')) return;
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('ftcsim.')) localStorage.removeItem(k); indexedDB.deleteDatabase('ftcsim'); } catch { }
    location.reload();
  };
}

// ------------------------------------------------------------------ boot
$('p-help').innerHTML = HELP_HTML;
resetSim();
initRobotTab(app, $('robotSetup'));
initCalibTab(app, $('p-calib'));
initRandomTab(app, $('p-random'));
initBenchTab(app, $('p-bench'), $('p-random'));
const lab = initLab(app, $('robotWiring'));
const openWiring = () => { switchTab('robot'); $('robotNav').querySelector('[data-r="robotWiring"]').click(); };
initDriverHub(app, $, openWiring);
const game = initGame(app, $('gameBox'));
initMenu(app, { switchTab, game });
iconizeToolbar(); setPauseIcon(true);
initSettings();
$('robotNav').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $('robotNav').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); for (const id of ['robotSetup', 'robotWiring', 'p-calib']) $(id).classList.toggle('hidden', id !== b.dataset.r); if (b.dataset.r === 'robotWiring') lab.render(); };
setServer(await bridge.online());
if (app.serverOk) { if (!app.files) await loadExamples(true); else showFile(); build(); } else { app.files = app.files || []; showFile(); }
setInterval(async () => { const ok = await bridge.online(); if (ok !== app.serverOk) { setServer(ok); updateDsButtons(); } }, 3000);
updateDsButtons();
requestAnimationFrame(frame);
physicsLoop();

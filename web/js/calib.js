// "Calibration" (fit simulator knobs to measurements from the real robot) and "Randomize" (domain randomization of the
// autonomous: N runs with random friction / mass / delays / battery, success rate).
import { Simulation, TICK } from './sim.js';
import { bridge } from './bridge.js';
import { resetSim, stopOpMode, startPoseValue, retire } from './main.js';
import { AUTO_S } from './scoring.js';
import { mulberry32 } from './sim.js';

const IN = 0.0254;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const save = (k, v) => { try { localStorage.setItem('ftcsim.' + k, JSON.stringify(v)); } catch { } };

// ------------------------------------------------------------------ headless drive experiments (no Java involved)
function driveTest(app, params, kind, power, seconds, voltage) {
  const sim = new Simulation(app.R, { robotCfg: app.robotCfg, pose: { x: 0, y: -1.0, heading: 90 }, alliance: 'red', params, battery: voltage, preload: 0, seed: 3 });
  // move the robot to an open area of the field (between the HIVE and the blue wall)
  sim.robot.body.setTranslation({ x: 0, y: -1.05, z: 0.001 }, true);
  const wheels = sim.robot.wheels;
  const v = kind === 'strafe' ? [1, 0, 0] : kind === 'turn' ? [0, 0, 1] : [0, 1, 0];
  const ws = wheels.map(w => {
    const vx = v[0] - v[2] * w.pos[1] * 4, vy = v[1] + v[2] * w.pos[0] * 4;
    const c = w.fwd[0] * w.d[0] + w.fwd[1] * w.d[1];
    return (w.d[0] * vx + w.d[1] * vy) / (c || 1);
  });
  const mx = Math.max(...ws.map(Math.abs)) || 1;
  const out = { motors: Object.fromEntries(wheels.map((w, i) => [w.motor, { mode: 'power', p: power * ws[i] / mx * (w.motorDir ?? 1), brake: true }])) };
  let yaw0 = sim.robot.yaw(), turned = 0, last = yaw0, tFull = null, speed = 0;
  const p0 = sim.robot.body.translation();
  for (let t = 0; t < seconds; t += TICK) {
    sim.setCommands(out); sim.tick();
    const y = sim.robot.yaw(); let d = y - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; last = y;
    if (tFull == null && Math.abs(turned) >= 2 * Math.PI) tFull = sim.t;
    const lv = sim.robot.body.linvel(); speed = Math.max(speed, Math.hypot(lv.x, lv.y));
  }
  const p1 = sim.robot.body.translation();
  sim.destroy();
  return { speed, tFull, dist: Math.hypot(p1.x - p0.x, p1.y - p0.y) };
}
function bisect(f, lo, hi, target, iters = 12) {
  // f increasing in x
  for (let i = 0; i < iters; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function fitLog(text, ticksPerM) {
  // CSV: t, power, velocity [, voltage]; velocity in ticks/s (or m/s if ticksPerM = 1)
  const rows = text.split(/\r?\n/).map(l => l.split(/[,;\t ]+/).map(Number)).filter(r => r.length >= 3 && r.every(Number.isFinite));
  if (rows.length < 10) throw new Error('Need at least 10 rows of: time, power, velocity[, voltage]');
  const X = [], Y = [];
  for (let i = 1; i < rows.length - 1; i++) {
    const [t, u, v, V] = rows[i], a = (rows[i + 1][2] - rows[i - 1][2]) / (rows[i + 1][0] - rows[i - 1][0]);
    if (!Number.isFinite(a) || Math.abs(v) < 1e-6) continue;
    const uv = u * (V ? V / 12 : 1);
    X.push([Math.sign(v), v / ticksPerM, a / ticksPerM]); Y.push(uv);
  }
  // least squares: u = kS*sign(v) + kV*v + kA*a
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (let k = 0; k < X.length; k++) for (let i = 0; i < 3; i++) { b[i] += X[k][i] * Y[k]; for (let j = 0; j < 3; j++) A[i][j] += X[k][i] * X[k][j]; }
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A), sol = [0, 1, 2].map(i => det(A.map((r, ri) => r.map((v, ci) => ci === i ? b[ri] : v))) / D);
  return { kS: sol[0], kV: sol[1], kA: sol[2], n: X.length };
}

export function initCalibTab(app, el) {
  el.innerHTML = `
    <div class="card"><b>Measurements from the real robot</b>
      <p class="small">Measure with <b>MeasureRobot.java</b> on the real robot.</p>
      <table class="t">
        <tr><td>Forward speed at power 1.0</td><td><input type="number" id="cFwd" step="0.1" style="width:80px"> in/s</td></tr>
        <tr><td title="Distance after 2 s minus distance after 1 s">Strafe speed at power 1.0</td><td><input type="number" id="cStrafe" step="0.1" style="width:80px"> in/s</td></tr>
        <tr><td>Time for one full turn (360°) at power</td><td><input type="number" id="cTurnP" value="0.5" step="0.1" style="width:50px"> → <input type="number" id="cTurn" step="0.05" style="width:70px"> s</td></tr>
        <tr><td>Encoder drive: commanded ticks and measured distance</td><td><input type="number" id="cTicks" style="width:70px"> ticks, <input type="number" id="cDist" step="0.1" style="width:70px"> in</td></tr>
        <tr><td>Robot mass on a scale</td><td><input type="number" id="cMass" step="0.1" style="width:80px"> kg</td></tr>
        <tr><td>Battery voltage during the tests</td><td><input type="number" id="cVolt" value="13.0" step="0.1" style="width:80px"> V</td></tr>
      </table>
      <div class="row"><button id="cFit" class="primary">Fit</button><button id="cReset">Reset to datasheets</button></div>
      <pre id="cOut" class="log"></pre></div>
    <div class="card"><b>Motor log (system identification)</b>
      <div class="small" title="CSV columns: time_s, power (-1..1), velocity [, voltage]. Velocity in ticks/s, or m/s with ticks per meter = 1. Gives kS, kV, kA like Road Runner and Pedro Pathing.">CSV: time, power, velocity → kS, kV, kA</div>
      <div class="row"><label class="filebtn">Upload CSV<input type="file" id="cLog" accept=".csv,.txt" hidden></label>
        <label>Ticks per meter <input type="number" id="cTpm" value="${(537.7 / (Math.PI * 0.104)).toFixed(1)}" style="width:90px"></label><button id="cLogApply" disabled>Apply to the simulator</button></div>
      <pre id="cLogOut" class="log"></pre></div>
    <div class="card"><b>Current simulator parameters</b><pre id="cParams" class="log"></pre></div>`;
  const $ = (id) => el.querySelector('#' + id);
  const m = app.calib.measured || {};
  for (const [k, id] of [['fwd', 'cFwd'], ['strafe', 'cStrafe'], ['turnP', 'cTurnP'], ['turn', 'cTurn'], ['ticks', 'cTicks'], ['dist', 'cDist'], ['mass', 'cMass'], ['volt', 'cVolt']]) if (m[k] != null) $(id).value = m[k];
  const show = () => { $('cParams').textContent = JSON.stringify(app.calib.params || {}, null, 1) + '\n(1.0 or missing means the datasheet value)'; };
  show();
  const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };

  $('cFit').onclick = async () => {
    const out = $('cOut'); out.textContent = 'Fitting, this takes a few seconds…\n';
    await new Promise(r => setTimeout(r, 20));
    const meas = { fwd: num('cFwd'), strafe: num('cStrafe'), turnP: num('cTurnP') ?? 0.5, turn: num('cTurn'), ticks: num('cTicks'), dist: num('cDist'), mass: num('cMass'), volt: num('cVolt') ?? 13 };
    const P = { ...(app.calib.params || {}) };
    const log = (s) => { out.textContent += s + '\n'; };
    if (meas.mass) { const base = app.robotCfg.chassis.mass + (app.robotCfg.joints || []).reduce((s, j) => s + (j.mass || 0), 0); P.massScale = meas.mass / base; log(`Mass ×${P.massScale.toFixed(3)} (${base.toFixed(2)} to ${meas.mass} kg)`); }
    if (meas.ticks && meas.dist) {
      const w = app.robotCfg.wheels?.[0], tpr = w ? (await import('./motors.js')).MOTORS[w.model].ticks : 537.7;
      const rEff = meas.dist * IN / (meas.ticks / tpr * 2 * Math.PI);
      P.wheelRadiusScale = rEff / (w?.radius || rEff); log(`Effective wheel radius ${(rEff * 1000).toFixed(1)} mm (×${P.wheelRadiusScale.toFixed(3)})`);
    }
    if (meas.fwd) {
      const target = meas.fwd * IN;
      P.wheelFreeScale = bisect(x => driveTest(app, { ...P, wheelFreeScale: x }, 'fwd', 1.0, 2.0, meas.volt).speed, 0.4, 1.3, target);
      log(`Forward ${meas.fwd} in/s gives motor free-speed scale ×${P.wheelFreeScale.toFixed(3)}`);
    }
    if (meas.strafe && app.robotCfg.wheels?.some(w => w.type === 'mecanum')) {
      const target = meas.strafe * IN;
      // more sideways scrub of the mecanum contact patch -> slower strafing
      P.muScrub = bisect(x => -driveTest(app, { ...P, muScrub: x }, 'strafe', 1.0, 2.0, meas.volt).speed, 0.0, 0.8, -target);
      log(`Strafe ${meas.strafe} in/s gives mecanum side scrub ${P.muScrub.toFixed(3)}`);
    }
    if (meas.turn) {
      const r = driveTest(app, P, 'turn', meas.turnP, 6, meas.volt);
      if (r.tFull) {
        log(`Full turn at power ${meas.turnP}: simulator ${r.tFull.toFixed(2)} s, robot ${meas.turn} s`);
        P.turnScale = r.tFull / meas.turn;
        log(r.tFull / meas.turn < 0.85 || r.tFull / meas.turn > 1.15 ? '  More than 15% off: check the wheel positions (track width, wheelbase) and the mass' : '  Within 15%');
      }
    }
    app.calib = { params: P, measured: meas }; save('calib', app.calib); show();
    log('Done. Sim reset with the new values.');
    await stopOpMode(); resetSim();
  };
  $('cReset').onclick = async () => { app.calib = {}; save('calib', {}); show(); await stopOpMode(); resetSim(); $('cOut').textContent = 'Back to datasheet values.'; };

  let fit = null;
  $('cLog').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      fit = fitLog(await f.text(), +$('cTpm').value || 1);
      const freeSpeed = 1 / fit.kV;
      $('cLogOut').textContent = `${fit.n} samples\nkS = ${fit.kS.toFixed(4)} (power to start moving)\nkV = ${fit.kV.toFixed(4)} (power per m/s), top speed about ${freeSpeed.toFixed(2)} m/s at 12 V\nkA = ${fit.kA.toFixed(4)} (power per m/s²)`;
      $('cLogApply').disabled = false;
    } catch (err) { $('cLogOut').textContent = 'Could not read the log: ' + err.message; }
    e.target.value = '';
  };
  $('cLogApply').onclick = async () => {
    if (!fit) return;
    const P = { ...(app.calib.params || {}) };
    // kV -> free speed scale (straight driving at 12 V), kS -> coulomb friction of the drive motors
    const simFree = driveTest(app, { ...P, wheelFreeScale: 1 }, 'fwd', 1.0, 2.0, 12).speed;
    P.wheelFreeScale = (1 / fit.kV) / simFree; P.coulomb = Math.max(0, Math.min(0.3, fit.kS));
    // kA vs the simulated robot: scale the mass so the acceleration matches
    const r = driveTest(app, P, 'fwd', 0.5, 0.15, 12), simKA = 0.5 / Math.max(0.1, r.speed / 0.15);
    if (fit.kA > 0) P.massScale = Math.max(0.5, Math.min(2, (P.massScale || 1) * fit.kA / simKA));
    app.calib = { ...app.calib, params: P }; save('calib', app.calib); show();
    $('cLogOut').textContent += `\nApplied: wheelFreeScale ${P.wheelFreeScale.toFixed(3)}, coulomb ${P.coulomb.toFixed(3)}, massScale ${(P.massScale || 1).toFixed(3)}`;
    await stopOpMode(); resetSim();
  };
}

// ------------------------------------------------------------------ domain randomization
export function initRandomTab(app, el) {
  el.innerHTML = `
    <div class="card">
      <div class="row"><label class="grow">Autonomous <select id="rOp"></select></label><label>Runs <input type="number" id="rN" value="20" style="width:60px"></label></div>
      <table class="t">
        <tr><td>Wheel and roller friction, ±%</td><td><input type="number" id="rMu" value="15" style="width:60px"></td><td>Mass, ±%</td><td><input type="number" id="rMass" value="10" style="width:60px"></td></tr>
        <tr><td>Motor efficiency, ±%</td><td><input type="number" id="rEff" value="8" style="width:60px"></td><td>Battery, V</td><td><input type="text" id="rBat" value="12.4, 13.4" size="8"></td></tr>
        <tr><td>Sensor delay up to, ms</td><td><input type="number" id="rSd" value="30" style="width:60px"></td><td>Command delay up to, ms</td><td><input type="number" id="rAd" value="20" style="width:60px"></td></tr>
        <tr><td>Start offset, ± in</td><td><input type="number" id="rPos" value="0.5" step="0.1" style="width:60px"></td><td>Start heading, ±°</td><td><input type="number" id="rAng" value="1.5" step="0.5" style="width:60px"></td></tr>
        <tr><td>IMU drift, °/min</td><td><input type="number" id="rDrift" value="1" step="0.5" style="width:60px"></td><td>Ball friction, ±%</td><td><input type="number" id="rBall" value="20" style="width:60px"></td></tr>
      </table>
      <div class="row"><b>A run succeeds when</b>
        <label>Auto points at least <input type="number" id="rPts" value="20" style="width:55px"></label>
        <label>HIVE tips ≥ <input type="number" id="rTips" value="0" style="width:45px"></label>
        <label class="chk"><input type="checkbox" id="rPosOn"> it ends within a circle (x, y, radius in inches) <input type="text" id="rPosT" value="36, 60, 12" size="10"></label></div>
      <div class="row"><button id="rRun" class="primary">Run batch</button><button id="rStop" disabled>Stop</button><label class="chk"><input type="checkbox" id="rShow" checked> Show on the field</label></div>
      <progress id="rProg" max="1" value="0" style="width:100%"></progress>
      <div id="rSum"></div>
      <div class="parts"><table class="t" id="rTable"></table></div>
    </div>`;
  const $ = (id) => el.querySelector('#' + id);
  const fillOps = () => {
    const prev = $('rOp').value;
    $('rOp').innerHTML = (app.opmodes || []).filter(o => o.kind === 'Autonomous').map(o => `<option value="${esc(o.cls)}">${esc(o.name)}</option>`).join('') || '<option value="">Build code with an @Autonomous class first</option>';
    if (prev) $('rOp').value = prev;
  };
  fillOps(); setInterval(fillOps, 3000);
  let stop = false;
  $('rStop').onclick = () => { stop = true; };
  $('rRun').onclick = async () => {
    const cls = $('rOp').value, om = (app.opmodes || []).find(o => o.cls === cls);
    if (!om) { alert('Build code with an @Autonomous class in the Code tab first.'); return; }
    if (!app.serverOk) { alert('The Java bridge is offline. Run start.bat.'); return; }
    stop = false; $('rRun').disabled = true; $('rStop').disabled = false;
    await stopOpMode();
    app.batch = true;
    while (app.ticking) await new Promise(r => setTimeout(r, 5));
    const N = Math.max(1, +$('rN').value || 1), rows = [];
    const pct = (id) => (+$(id).value || 0) / 100, [b0, b1] = $('rBat').value.split(',').map(Number);
    const [tx, ty, tr] = $('rPosT').value.split(',').map(Number);
    try {
    $('rTable').innerHTML = '<tr><th>Run</th><th>Result</th><th>Auto</th><th>Tips</th><th>Finish (x, y)</th><th>Parameters</th></tr>';
    for (let i = 0; i < N && !stop; i++) {
      const rnd = mulberry32(1000 + i), u = (a) => (rnd() * 2 - 1) * a;
      const base = { ...(app.calib.params || {}) };
      const params = { ...base, muScale: (base.muScale || 1) * (1 + u(pct('rMu'))), massScale: (base.massScale || 1) * (1 + u(pct('rMass'))), effScale: (base.effScale || 1) * (1 + u(pct('rEff'))),
        muScrub: (base.muScrub ?? 0.12) * (1 + u(pct('rMu'))), ballFriction: 0.5 * (1 + u(pct('rBall'))) };
      const noise = { ...app.noise, sensorDelayMs: rnd() * (+$('rSd').value || 0), actuatorDelayMs: rnd() * (+$('rAd').value || 0), imuDriftDegPerMin: u(+$('rDrift').value || 0) };
      const pose0 = startPoseValue(), pose = { ...pose0, x: pose0.x + u(+$('rPos').value * IN), heading: pose0.heading + u(+$('rAng').value) };
      if (pose0.y != null) pose.y = pose0.y + u(+$('rPos').value * IN);
      const battery = b0 + rnd() * ((b1 || b0) - b0);
      const sim = new Simulation(app.R, { robotCfg: app.robotCfg, pose, alliance: document.getElementById('alliance').value, params, noise, battery, seed: 77 + i });
      const prev = app.sim; app.sim = sim;
      if ($('rShow').checked || i === 0) app.renderer.setSim(sim, app.robotModel);
      if (prev && app.renderer.sim !== prev) retire(prev);
      let ok = true, err = null;
      try {
        const r = await bridge.init(cls, om.name, sim.devices(), sim.t, sim.readSensors());
        if (r.state === 'error') throw new Error(r.error?.message || 'init error');
        for (let k = 0; k < 20; k++) { await bridge.sync(sim.t, sim.readSensors(), [{}, {}], 40); sim.tick(); }   // a short INIT period
        await bridge.start();
        sim.scorer.startMatch(sim.t);
        const tEnd = sim.t + AUTO_S;
        while (sim.t < tEnd && !stop) {
          const resp = await bridge.sync(sim.t, sim.readSensors(), [{}, {}], 60);
          sim.setCommands(resp.out); sim.tick(); app.tagView = null;
          if (resp.state === 'error') { err = resp.error?.message || 'error'; break; }
        }
        await bridge.stop();
        sim.scorer.endAuto();
      } catch (e) { err = String(e.message || e); }
      const S = sim.scorer.breakdown(sim.t), me = S[sim.alliance], p = sim.robot.pose();
      const fx = p.x / IN, fy = p.y / IN;
      if (err) ok = false;
      if (me.auto < (+$('rPts').value || 0)) ok = false;
      if (me.autoTips < (+$('rTips').value || 0)) ok = false;
      if ($('rPosOn').checked && Math.hypot(fx - tx, fy - ty) > tr) ok = false;
      rows.push(ok);
      const tr_ = document.createElement('tr');
      tr_.innerHTML = `<td>${i + 1}</td><td class="${ok ? 'okc' : 'badc'}">${ok ? '✔' : '✖'} ${esc(err || '')}</td><td>${me.auto}</td><td>${me.autoTips}</td><td>${fx.toFixed(1)}, ${fy.toFixed(1)}</td>` +
        `<td class="small">μ×${params.muScale.toFixed(2)} m×${params.massScale.toFixed(2)} η×${params.effScale.toFixed(2)} ${battery.toFixed(1)} V, delays ${noise.sensorDelayMs.toFixed(0)}/${noise.actuatorDelayMs.toFixed(0)} ms</td>`;
      $('rTable').appendChild(tr_);
      const succ = rows.filter(Boolean).length;
      $('rSum').innerHTML = `<b>${succ} of ${rows.length} runs succeeded (${Math.round(succ / rows.length * 100)}%)</b>`;
      $('rProg').value = (i + 1) / N;
    }
    } catch (e) { $('rSum').textContent = 'Batch stopped: ' + (e.message || e); console.error(e); }
    finally {
      app.batch = false;
      resetSim();
      $('rRun').disabled = false; $('rStop').disabled = true;
    }
  };
}

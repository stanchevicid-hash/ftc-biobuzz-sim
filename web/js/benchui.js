// "Test bench" tab: forms, runs and results for the mechanism tests in bench.js.
import { benchInfo, shooterTest, shooterSweep, intakeTest, driveTest, jointTest } from './bench.js';
import { resetSim, stopOpMode, retire } from './main.js';

const IN = 0.0254;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : v.toFixed(d);
const nums = (s) => String(s).split(',').map(Number).filter(Number.isFinite);

export function initBenchTab(app, el, randomEl) {
  const nav = el.querySelector('#benchNav'), body = el.querySelector('#benchBody');
  let current = 'shooter', running = false, cancel = false;
  nav.onclick = (e) => { const b = e.target.closest('button'); if (!b || running) return; current = b.dataset.b; nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); };

  const field = (id, label, value, attrs = '') => `<label>${label} <input type="number" id="${id}" value="${value}" ${attrs}></label>`;
  const runRow = (extra = '') => `<div class="row"><button id="bRun" class="primary">Run</button>${extra}<button id="bStop" disabled>Stop</button>
    <label class="chk"><input type="checkbox" id="bShow" checked> Watch</label></div><div id="bStatus" class="small"></div><div id="bOut"></div>`;
  const missing = (what) => `<p class="hint">No ${what} on this robot. Add one in Robot, step 6.</p>`;

  function render() {
    randomEl.classList.toggle('hidden', current !== 'auto');
    body.classList.toggle('hidden', current === 'auto');
    if (current === 'auto') return;
    const info = benchInfo(app.robotCfg), L = info.launcher;
    if (current === 'shooter') body.innerHTML = !L ? missing('shooter') : `
      <div class="grid3">${field('sDist', 'Distance, in', 42, 'step="1"')}${field('sRpm', 'Flywheel RPM', 3000, 'step="50"')}
      ${L.hood ? field('sHood', 'Hood (0–1)', 0.7, 'step="0.05" min="0" max="1"') : ''}${field('sShots', 'Shots', 4, 'min="1" max="8"')}
      ${field('sInt', 'Shot gap, s', 0.4, 'step="0.05"')}${field('sBat', 'Battery, V', 13, 'step="0.1"')}</div>
      ${runRow(`<button id="bSweep" title="Every distance${L.hood ? ' × hood' : ''} combination">Sweep</button>`)}
      <details class="sweepopts"><summary>Sweep</summary><div class="grid3"><label>Distances, in <input type="text" id="sDists" value="18, 24, 30, 36, 42"></label>
      ${L.hood ? '<label>Hood positions <input type="text" id="sHoods" value="0.3, 0.5, 0.7, 0.9, 1.0"></label>' : ''}<label>Shots each <input type="number" id="sEach" value="3" min="1" max="4"></label></div></details>`;
    if (current === 'intake') body.innerHTML = !info.holder ? missing('intake') : `
      <div class="grid3">${field('iBalls', 'Balls', 5, 'min="1" max="10"')}${field('iSpace', 'Spacing, in', 8, 'step="0.5"')}
      ${field('iPow', 'Drive power', 0.3, 'step="0.05" min="0.05" max="1"')}${field('iOff', 'Offset, in', 0, 'step="0.5"')}</div>${runRow()}`;
    if (current === 'drive') body.innerHTML = !info.drive ? missing('drivetrain') : `
      <div class="grid3">${field('dPow', 'Power', 1, 'step="0.05" min="0.1" max="1"')}${field('dBat', 'Battery, V', 13, 'step="0.1"')}</div>${runRow()}`;
    if (current === 'joint') body.innerHTML = !info.joints.length ? missing('lift or arm') : `
      <div class="grid3"><label>Joint <select id="jId">${info.joints.map(j => `<option>${esc(j.id)}</option>`).join('')}</select></label>${field('jPow', 'Power', 1, 'step="0.05" min="0.1" max="1"')}</div>${runRow()}`;
    const run = el.querySelector('#bRun'); if (!run) return;
    run.onclick = () => go(false); el.querySelector('#bSweep') && (el.querySelector('#bSweep').onclick = () => go(true));
    el.querySelector('#bStop').onclick = () => { cancel = true; };
  }

  async function go(sweep) {
    if (running) return;
    const $ = (id) => el.querySelector('#' + id), v = (id, d) => { const x = parseFloat($(id)?.value); return Number.isFinite(x) ? x : d; };
    running = true; cancel = false; $('bRun').disabled = true; $('bSweep') && ($('bSweep').disabled = true); $('bStop').disabled = false;
    const show = $('bShow').checked && !sweep, out = $('bOut'), status = $('bStatus');
    await stopOpMode();
    app.batch = true; while (app.ticking) await new Promise(r => setTimeout(r, 5));
    const prev = app.sim;
    const opts = {
      show, cancel: () => cancel, dispose: (s) => (show ? retire(s) : s.destroy()),
      onSim: (s) => { if (show) { app.sim = s; app.renderer.setSim(s, app.robotModel); if (prev && prev !== s) retire(prev); } },
    };
    status.textContent = 'Running…'; out.innerHTML = '';
    try {
      const cfg = app.robotCfg;
      if (current === 'shooter' && !sweep) out.innerHTML = shooterHtml(await shooterTest(app.R, cfg, { ...opts, distIn: v('sDist', 30), rpm: v('sRpm', 2200), hood: v('sHood', 0.5), shots: v('sShots', 4), interval: v('sInt', 0.4), battery: v('sBat', 13) }));
      if (current === 'shooter' && sweep) out.innerHTML = sweepHtml(await shooterSweep(app.R, cfg, { ...opts, rpm: v('sRpm', 2200), interval: v('sInt', 0.4), battery: v('sBat', 13),
        dists: nums($('sDists').value), hoods: $('sHoods') ? nums($('sHoods').value) : [0.5], shots: v('sEach', 3), onProgress: (m) => { status.textContent = 'Sweep: ' + m; } }), !!$('sHoods'));
      if (current === 'intake') out.innerHTML = intakeHtml(await intakeTest(app.R, cfg, { ...opts, balls: v('iBalls', 5), spacingIn: v('iSpace', 8), power: v('iPow', 0.3), offsetIn: v('iOff', 0) }));
      if (current === 'drive') out.innerHTML = driveHtml(await driveTest(app.R, cfg, { ...opts, power: v('dPow', 1), battery: v('dBat', 13) }));
      if (current === 'joint') out.innerHTML = jointHtml(await jointTest(app.R, cfg, $('jId').value, { ...opts, power: v('jPow', 1) }));
      drawTrace(out);
      status.textContent = '';
    } catch (e) { status.textContent = e.message === 'stopped' ? 'Stopped.' : 'Test failed: ' + e.message; if (e.message !== 'stopped') console.error(e); }
    finally {
      app.batch = false; resetSim();
      running = false; $('bRun').disabled = false; $('bSweep') && ($('bSweep').disabled = false); $('bStop').disabled = true;
    }
  }

  // ---- result views
  let lastTrace = null;
  function shooterHtml(r) {
    lastTrace = { pts: r.trace, target: r.targetWheel, marks: r.rows.map(x => x.t), unit: 'wheel RPM' };
    const hits = r.rows.filter(x => x.hit).length, drop = r.rows.map(x => x.rpmBefore - x.rpmAfter);
    const verdict = hits === r.rows.length ? 'okc' : hits ? 'warnc' : 'badc';
    return `<p class="bench-sum"><b class="${verdict}">${hits} of ${r.rows.length} in the CELL</b> from ${r.distIn} in.
      Spin-up ${f(r.spinUp, 2)} s, each shot costs about ${f(drop.reduce((a, b) => a + b, 0) / (drop.length || 1), 0)} RPM.${r.tips ? ' The HIVE tipped.' : ''}</p>
      <table class="t"><tr><th>#</th><th>Time, s</th><th>RPM before → after</th><th>Back in 2 %, s</th><th>Exit, m/s</th><th>Highest, in</th><th>Result</th></tr>
      ${r.rows.map(x => `<tr><td>${x.n}</td><td>${f(x.t, 2)}</td><td>${f(x.rpmBefore, 0)} → ${f(x.rpmAfter, 0)}</td><td>${f(x.recover, 2)}</td><td>${f(x.exit, 2)}</td><td>${f(x.apex / IN, 0)}</td>
      <td class="${x.hit ? 'okc' : 'badc'}">${x.hit ? 'in' : (x.apex / IN < 53.5 ? 'too low' : 'missed')}</td></tr>`).join('')}</table>
      <canvas class="trace" width="640" height="160"></canvas>
      ${hits < r.rows.length ? '<p class="hint">Too low? More RPM or more hood. Sweep finds what works.</p>' : ''}`;
  }
  function sweepHtml(grid, hood) {
    lastTrace = null;
    const hoods = grid[0]?.row.map(c => c.hood) || [];
    return `<p class="bench-sum">Balls in the CELL out of shots, for each distance${hood ? ' and hood position' : ''}.</p>
      <table class="t sweep"><tr><th>Distance, in</th>${hoods.map(h => `<th>${hood ? 'hood ' + h.toFixed(2) : 'result'}</th>`).join('')}</tr>
      ${grid.map(g => `<tr><td>${g.dist}</td>${g.row.map(c => `<td style="background:rgba(63,155,74,${(c.hits / (c.shots || 1)) * 0.75})">${c.hits}/${c.shots}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  function intakeHtml(r) {
    lastTrace = null;
    const rate = r.rows.length > 1 ? (r.rows.length - 1) / (r.rows[r.rows.length - 1].t - r.rows[0].t) : null;
    return `<p class="bench-sum"><b class="${r.held === Math.min(r.placed, r.capacity) ? 'okc' : 'warnc'}">Picked up ${r.held} of ${r.placed}</b> (holds ${r.capacity}).
      ${rate ? `About ${f(rate, 1)} balls per second once moving.` : ''} ${r.left && r.held < r.capacity ? `${r.left} ball(s) pushed away or missed.` : ''}</p>
      <table class="t"><tr><th>Ball</th><th>Time, s</th><th>Driven, in</th></tr>${r.rows.map(x => `<tr><td>${x.n}</td><td>${f(x.t, 2)}</td><td>${f(x.dist, 1)}</td></tr>`).join('')}</table>`;
  }
  function driveHtml(r) {
    lastTrace = null;
    const row = (name, x, turn) => x ? `<tr><td>${name}</td><td>${turn ? f(x.turnRate * 180 / Math.PI, 0) + ' °/s' : f(x.vmax / IN, 0) + ' in/s'}</td><td>${f(x.t90, 2)}</td><td>${turn ? '–' : f(x.stop / IN, 1)}</td><td>${turn ? '–' : f(x.headingDrift, 1) + '°'}</td></tr>` : '';
    return `<table class="t"><tr><th></th><th>Top speed</th><th>0 to 90 %, s</th><th>Slides after brake, in</th><th>Heading change</th></tr>
      ${row('Forward', r.forward)}${row('Strafe', r.strafe)}${row('Turn', r.turn, true)}</table>`;
  }
  function jointHtml(r) {
    const u = (q) => r.prismatic ? f(q / IN, 1) + ' in' : f(q * 180 / Math.PI, 0) + '°';
    lastTrace = { pts: r.trace.map(([t, q]) => [t, r.prismatic ? q / IN : q * 180 / Math.PI]), marks: [2.5], unit: r.prismatic ? 'in' : '°' };
    const sag = Math.abs(r.qTop - r.qEnd);
    return `<p class="bench-sum">${esc(r.joint.id)} (${esc(r.by)}): ${u(r.q0)} → ${u(r.qTop)}${r.t90 != null ? `, 90 % in ${f(r.t90, 2)} s` : ''}.
      <b class="${sag < (r.prismatic ? 0.01 : 0.05) ? 'okc' : 'warnc'}">${sag < (r.prismatic ? 0.01 : 0.05) ? 'Holds at zero power.' : `Sags ${u(sag)} at zero power.`}</b>
      ${r.peakA ? ` Peak current ${f(r.peakA, 1)} A.` : ''}</p><canvas class="trace" width="640" height="160"></canvas>`;
  }
  function drawTrace(out) {
    const cv = out.querySelector('canvas.trace'); if (!cv || !lastTrace) return;
    const { pts, target, marks, unit } = lastTrace, g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 30;
    const t1 = Math.max(...pts.map(p => p[0])), ys = pts.map(p => p[1]).concat(target ?? []), y0 = Math.min(...ys), y1 = Math.max(...ys) || 1;
    const X = (t) => pad + (t / t1) * (W - pad - 8), Y = (y) => H - 18 - (y - y0) / ((y1 - y0) || 1) * (H - 30);
    g.fillStyle = '#1d2023'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#4a5158'; g.setLineDash([3, 3]); for (const m of marks || []) { g.beginPath(); g.moveTo(X(m), 6); g.lineTo(X(m), H - 18); g.stroke(); }
    if (target != null) { g.strokeStyle = '#7d8582'; g.beginPath(); g.moveTo(pad, Y(target)); g.lineTo(W - 8, Y(target)); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = '#f2a900'; g.lineWidth = 2; g.beginPath(); pts.forEach(([t, y], i) => g[i ? 'lineTo' : 'moveTo'](X(t), Y(y))); g.stroke();
    g.fillStyle = '#a9b0ad'; g.font = '11px JetBrains Mono, monospace';
    g.fillText(`${y1.toFixed(0)} ${unit}`, 2, 12); g.fillText(`${(+y0.toFixed(0)) || 0}`, 2, H - 20); g.fillText(`${t1.toFixed(1)} s`, W - 44, H - 4);
  }

  render();
  app.onRobotChangedBench = render;
}

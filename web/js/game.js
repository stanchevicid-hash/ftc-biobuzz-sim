// Drive tab: missions with a clock, stars and personal records, a match against bots, and a driver level.
import { IN, ZONES, START_POSES } from './field.js';
import { DEMO_ROBOT } from './robots/demo.js';
import { resetSim, stopOpMode, initOpMode, startOpMode } from './main.js';
import { Bot } from './bots.js';
import { cue } from './sounds.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LSK = 'ftcsim.records';
const load = () => { try { return JSON.parse(localStorage.getItem(LSK)) || {}; } catch { return {}; } };
const save = (r) => { try { localStorage.setItem(LSK, JSON.stringify(r)); } catch { } };
const fmt = (s) => s == null ? '–' : s.toFixed(1) + ' s';
const pos = (sim) => sim.robot.body.translation();
const near = (sim, x, y, r) => { const p = pos(sim); return Math.hypot(p.x - x, p.y - y) < r; };
const inRect = (sim, [x0, x1, y0, y1]) => { const p = pos(sim); return p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1; };
const speed = (sim) => { const v = sim.robot.body.linvel(); return Math.hypot(v.x, v.y); };
const held = (sim) => sim.robot.holders.reduce((n, h) => n + h.balls.length, 0);

/**
 * A mission: where the robot starts, what it needs (drive only, or the team's TeleOp for mechanisms),
 * a check run every tick that returns 'done' or progress, and the stars: lower time is better, or more points.
 */
const MISSIONS = [
  { id: 'slalom', name: 'Slalom', goal: 'Drive through the gates in order', limit: 40, needs: 'drive', stars: [12, 18, 26],
    pose: { x: -60 * IN, y: -48 * IN, heading: 0 },
    gates: [[-24, -48], [0, -24], [24, -48], [48, -24], [24, 0]].map(([x, y]) => ({ x: x * IN, y: y * IN, r: 0.2 })),
    check(sim, st) { const g = this.gates[st.i]; if (g && near(sim, g.x, g.y, g.r)) { st.i++; cue('chime'); } return st.i >= this.gates.length; } },
  { id: 'park', name: 'Park', goal: 'Stop inside your LOADING ZONE', limit: 20, needs: 'drive', stars: [5, 8, 12],
    pose: { x: -36 * IN, y: -55 * IN, heading: 90 },
    zone: ZONES.loading.red,
    check(sim) { return inRect(sim, this.zone) && speed(sim) < 0.05; } },
  { id: 'pickup', name: 'Pickup', goal: 'Collect 4 POLLEN', limit: 45, needs: 'code', stars: [10, 16, 25],
    pose: { x: -54 * IN, y: -30 * IN, heading: 0 }, preload: 0,
    balls: [[-24, -30], [-6, -42], [12, -24], [30, -40], [42, -12]].map(([x, y]) => [x * IN, y * IN]),
    check(sim) { return held(sim) >= 4; } },
  { id: 'shoot', name: 'Score 3', goal: 'Put 3 balls in your upper CELL', limit: 60, needs: 'code', stars: [12, 20, 35],
    pose: { x: -60 * IN, y: 12 * IN, heading: 0 },
    check(sim, st) { const c = sim.scorer.breakdown(sim.t).red.cell; st.base ??= c; return c - st.base >= 3; } },
  { id: 'tip', name: 'Tip the HIVE', goal: 'Tip your HIVE', limit: 90, needs: 'code', stars: [25, 40, 60],
    pose: { x: -60 * IN, y: 12 * IN, heading: 0 },
    check(sim, st) { const n = sim.field.hives[0].tips.length; st.base ??= n; return n > st.base; } },
  { id: 'teleop', name: 'TeleOp 2:00', goal: 'Score as much as you can', limit: 120, needs: 'code', points: true, stars: [80, 50, 25],
    pose: START_POSES['Red - audience side'] },
];

const r_title = (r) => r.m.id === 'bots' ? (r.ok ? 'Win' : 'Loss') : r.ok ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : 'Time up';

export function initGame(app, el) {
  let run = null;                                  // the mission in progress
  const records = load();
  const starsOf = (m, v) => v == null ? 0 : m.points ? m.stars.filter(s => v >= s).length : m.stars.filter(s => v <= s).length;
  const level = () => { const total = MISSIONS.reduce((n, m) => n + starsOf(m, records[m.id]), 0); return { total, lvl: 1 + Math.floor(total / 3) }; };

  function render(result) {
    const L = level(), teleops = (app.opmodes || []).filter(o => o.kind === 'TeleOp');
    el.innerHTML = `
      <div class="game-head"><b>Level ${L.lvl}</b><span>${L.total} / ${MISSIONS.length * 3} ★</span>
        <label title="Missions with mechanisms run this TeleOp, like practice with your team's code">TeleOp <select id="gmTele">${teleops.map(o => `<option value="${esc(o.cls)}">${esc(o.name)}</option>`).join('') || '<option value="">Build code first</option>'}</select></label></div>
      ${result ? `<div class="game-result ${result.ok ? 'ok' : ''}"><b>${r_title(result)}</b>
        <span>${esc(result.name)}: ${result.points != null ? result.points + ' points' : fmt(result.time)}${result.best ? ', new record' : ''}</span>
        <button id="gmRetry">Again</button></div>` : ''}
      <div class="missions">${MISSIONS.map(m => { const s = starsOf(m, records[m.id]); return `
        <button class="mission ${run?.m === m ? 'on' : ''}" data-m="${m.id}" title="${esc(m.goal)}">
          <b>${esc(m.name)}</b><span class="stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span>
          <span class="best">${records[m.id] != null ? (m.points ? records[m.id] + ' pts' : fmt(records[m.id])) : esc(m.goal)}</span>${m.needs === 'code' ? '<i title="Uses your TeleOp">code</i>' : ''}</button>`; }).join('')}
        <button class="mission vs" data-m="bots" title="2:30 match: you and a bot against two bots"><b>Match vs bots</b><span class="best">2 v 2</span></button>
      </div>
      ${run ? `<div class="game-run"><b id="gmClock">0.0</b><span id="gmGoal">${esc(run.m.goal)}</span><button id="gmQuit">Stop</button></div>` : ''}`;
    el.querySelectorAll('.mission').forEach(b => b.onclick = () => b.dataset.m === 'bots' ? startBots() : start(MISSIONS.find(m => m.id === b.dataset.m)));
    el.querySelector('#gmRetry') && (el.querySelector('#gmRetry').onclick = () => result.m.id === 'bots' ? startBots() : start(result.m));
    el.querySelector('#gmQuit') && (el.querySelector('#gmQuit').onclick = () => finish(false));
    const sel = el.querySelector('#gmTele');
    if (sel) sel.value = app.gameTele || teleops.find(o => /tele/i.test(o.name))?.cls || sel.value;
    sel && (sel.onchange = () => { app.gameTele = sel.value; });
  }

  async function start(m) {
    await finish(false, true);
    if (m.needs === 'code' && !(app.opmodes || []).some(o => o.kind === 'TeleOp')) { alert('This mission needs a TeleOp. Build your code in the Code tab first.'); return; }
    document.getElementById('matchMode').value = 'free'; app.match.mode = 'free';
    resetSim({ pose: m.pose, alliance: 'red', others: [], preload: m.preload });
    const sim = app.sim;
    for (const [x, y] of m.balls || []) sim.addBall('pollen', 'yellow', [x, y, 0.036]);
    run = { m, st: { i: 0 }, t0: null, sim };
    app.renderer.setMarkers(m.gates ? m.gates.map((g, i) => ({ ...g, next: i === 0 })) : m.zone ? [{ rect: m.zone }] : []);
    render();
    if (m.needs === 'code') {
      const sel = document.getElementById('opmode'); sel.value = el.querySelector('#gmTele').value || sel.value;
      await initOpMode(); await startOpMode();
    }
    cue('charge');
    run.t0 = app.sim.t;
  }

  app.onTick = (sim) => {
    if (!run || run.sim !== sim || run.t0 == null || run.done) return;
    if (run.bots) {                                    // the match clock and scoring run as usual; just wait for the end
      const S = sim.scorer.breakdown(sim.t), c = el.querySelector('#gmClock'); if (c) c.textContent = `${S.red.total} : ${S.blue.total}`;
      if (app.match.phase === 'post') finish(true);
      return;
    }
    const t = sim.t - run.t0, m = run.m;
    const clock = el.querySelector('#gmClock'); if (clock) clock.textContent = (m.points ? Math.max(0, m.limit - t) : t).toFixed(1);
    if (m.gates) app.renderer.setMarkers(m.gates.map((g, i) => ({ ...g, done: i < run.st.i, next: i === run.st.i })));
    if (m.points) { if (t >= m.limit) finish(true, false, sim.scorer.breakdown(sim.t).red.total); return; }
    if (m.check(sim, run.st)) finish(true, false);
    else if (t >= m.limit) finish(false);
  };

  async function finish(ok, silent = false, points = null) {
    if (!run) return;
    const r = run; r.done = true; run = null;
    const time = r.t0 != null ? r.sim.t - r.t0 : null;
    if (r.m.needs === 'code' || r.bots) await stopOpMode();
    app.renderer.setMarkers([]);
    if (silent) return;
    let result = null;
    if (r.bots) {
      const S = r.sim.scorer.breakdown(r.sim.t), win = S.red.total > S.blue.total;
      if (win) { records.botWins = (records.botWins || 0) + 1; save(records); }
      result = { m: r.m, name: 'Match vs bots', ok: win, points: `${S.red.total} : ${S.blue.total}`, stars: win ? 3 : 0, best: false };
    } else {
      const v = r.m.points ? points : time, prev = records[r.m.id];
      const better = ok && v != null && (prev == null || (r.m.points ? v > prev : v < prev));
      if (better) { records[r.m.id] = r.m.points ? v : +v.toFixed(2); save(records); }
      result = { m: r.m, name: r.m.name, ok, time, points, stars: ok ? starsOf(r.m, v) : 0, best: better };
      cue(ok ? 'bells' : 'buzzer');
    }
    render(result);
  }

  // ---- 2 v 2: you plus a partner bot (red) against two bots (blue), full match timing and scoring
  async function startBots() {
    await finish(false, true);
    document.getElementById('matchMode').value = 'match'; app.match.mode = 'match';
    const me = START_POSES['Red - audience side'];
    const others = [
      { cfg: DEMO_ROBOT, pose: START_POSES['Red - far side'], alliance: 'red' },
      { cfg: DEMO_ROBOT, pose: START_POSES['Blue - audience side'], alliance: 'blue' },
      { cfg: DEMO_ROBOT, pose: START_POSES['Blue - far side'], alliance: 'blue' },
    ];
    resetSim({ pose: me, alliance: 'red', others });
    app.sim.others.forEach((o, i) => { o.bot = new Bot(o.alliance, i); });
    run = { m: { id: 'bots', name: 'Match vs bots', goal: 'Win the match' }, st: {}, t0: null, sim: app.sim, bots: true };
    render();
    // the match starts like any other: pick your Autonomous (or none) and press Start in the Driver Hub, or drive in TeleOp
    app.match.phase = 'teleop'; app.match.tTeleStart = app.sim.t; app.sim.scorer.startMatch(app.sim.t - 38); app.match.cued = {};
    cue('bells'); run.t0 = app.sim.t;
  }

  app.onOpModes = () => { if (!run) render(); };
  render();
  return { render, startBots };
}

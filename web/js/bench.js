// Test bench: one mechanism at a time, on the real field physics, measured the way a team measures it on a practice field.
// Every test builds its own Simulation of the current robot, so nothing here touches the match in progress.
import { Simulation, TICK } from './sim.js';
import { HIVE, IN, qRotate, qConj, inPentagon, upCellSign } from './field.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3a = (v) => [v.x, v.y, v.z];
const rpmOf = (load) => Math.abs(load?.omega ?? 0) * 60 / (2 * Math.PI);

/** which mechanisms this robot has, so the UI only offers tests that can run */
export function benchInfo(cfg) {
  const launcher = (cfg.launchers || [])[0], holder = (cfg.holders || []).find(h => h.intake);
  const joints = (cfg.joints || []).filter(j => (cfg.motors || []).some(m => m.load?.joint === j.id) || (cfg.servos || []).some(s => s.joint === j.id));
  return { launcher, holder, joints, drive: (cfg.wheels || []).length > 0 };
}

/** pace a test: headless runs as fast as possible; when shown on the field, close to real time */
async function pace(opts, sim, k) {
  if (opts.show) { if (k % 4 === 0) await new Promise(r => setTimeout(r, 40 / (opts.speed || 1))); }
  else if (k % 200 === 0) await new Promise(r => setTimeout(r, 0));
  opts.onTick?.(sim);
  if (opts.cancel?.()) throw new Error('stopped');
}

/** the device rule of a launcher feed / holder intake -> command that makes it true or false */
function ruleCmd(cfg, rule, on) {
  const sv = (cfg.servos || []).find(s => s.name === rule.device);
  const want = rule.op === '>' ? rule.value + (on ? 0.4 : -0.6) : rule.value + (on ? -0.4 : 0.6);
  if (sv) return { servos: { [rule.device]: { pos: Math.max(0, Math.min(1, want)) } } };
  return { motors: { [rule.device]: { mode: 'power', p: Math.max(-1, Math.min(1, want)), brake: true } } };
}
const merge = (...cs) => { const o = { motors: {}, servos: {} }; for (const c of cs) { Object.assign(o.motors, c.motors || {}); Object.assign(o.servos, c.servos || {}); } return o; };

/** where the robot stands to shoot at the red HIVE's upper CELL from `distIn` (horizontal, robot center to the opening) */
function shooterPose(sim, distIn) {
  const h = sim.field.hives[0], up = upCellSign(h), q = h.body.rotation(), p = v3a(h.body.translation());
  const open = qRotate(q, [up * HIVE.cellOuter, 0, (HIVE.cellZ0 + HIVE.cellZ1) / 2]);
  const target = [p[0] + open[0], p[1] + open[1], p[2] + open[2]];
  const x = target[0] + up * distIn * IN;                   // the opening faces outwards along the arm
  return { target, pose: { x, y: target[1], heading: up > 0 ? 180 : 0 }, up };
}
/** ball inside either CELL of a hive (hive-local test, as the scorer does) */
function inCell(h, pos) {
  const q = h.body.rotation(), l = qRotate(qConj(q), sub(pos, v3a(h.body.translation())));
  const ax = Math.abs(l[0]);
  return ax > HIVE.cellInner && ax < HIVE.cellOuter && inPentagon(l[1], l[2]);
}

/**
 * Shooter: spin the flywheel to `rpm` (motor RPM, hub velocity mode), set the hood, fire `shots` balls when the wheel is back
 * within 2 % of the target, and follow every ball. Returns per-shot rows and the flywheel trace.
 */
export async function shooterTest(R, cfg, o = {}) {
  const L = (cfg.launchers || [])[0]; if (!L) throw new Error('This robot has no shooter. Add one in Robot, step 6.');
  const fw = (cfg.motors || []).find(m => m.name === L.flywheel);
  const cap = Math.max(1, ...(cfg.holders || []).map(h => h.capacity ?? 1)), shots = Math.min(o.shots ?? 4, cap), pre = { ...o };
  let sim = new Simulation(R, { robotCfg: cfg, pose: { x: 0, y: 0, heading: 0 }, alliance: 'red', seed: o.seed ?? 3, preload: shots });
  const sp = shooterPose(sim, o.distIn ?? 30); sim.destroy();
  sim = new Simulation(R, { robotCfg: cfg, pose: sp.pose, alliance: 'red', seed: o.seed ?? 3, preload: shots, battery: o.battery ?? 13 });
  o.onSim?.(sim);
  const rb = sim.robot, load = rb.cfg.motors.find(m => m.name === L.flywheel).load, ticks = rb.motors[L.flywheel].m.ticks;
  const tv = (o.rpm ?? 2200) / 60 * ticks;
  const fly = { motors: { [L.flywheel]: { mode: 'velocity', tv, brake: false } } };
  const hood = L.hood ? { servos: { [L.hood.device]: { pos: o.hood ?? 0.5 } } } : {};
  const ratio = (fw?.load?.ratio ?? 1), targetWheel = (o.rpm ?? 2200) / ratio;   // wheel RPM the hub aims for
  const rows = [], trace = [], flying = [];
  let fired = 0, feedUntil = -1, nextOk = 0, k = 0, spinUp = null, lastShotT = 0;
  const T = (o.spinUpMax ?? 4) + shots * 1.2 + 2.5;
  try {
  while (sim.t < T) {
    const wheel = rpmOf(load), ready = Math.abs(wheel - targetWheel) < targetWheel * 0.02;
    if (spinUp == null && ready) spinUp = sim.t;
    const feeding = sim.t < feedUntil;
    if (!feeding && ready && fired < shots && sim.t >= nextOk) { feedUntil = sim.t + 0.15; nextOk = sim.t + (o.interval ?? 0.4); }
    sim.setCommands(merge(fly, hood, ruleCmd(cfg, L.feed, sim.t < feedUntil)));
    const before = rb.launchers[0].shots, rpmBefore = wheel;
    sim.tick(); k++;
    if (rb.launchers[0].shots > before) {
      const ball = sim.balls.find(b => !b.held && !flying.some(f => f.ball === b) && b.body.linvel && Math.hypot(...v3a(b.body.linvel())) > 1);
      fired++; lastShotT = sim.t;
      const row = { n: fired, t: sim.t, rpmBefore, rpmAfter: rpmOf(load), exit: ball ? Math.hypot(...v3a(ball.body.linvel())) : 0, apex: 0, hit: false, recover: null };
      rows.push(row); if (ball) flying.push({ ball, row });
    }
    for (const f of flying) {
      const p = v3a(f.ball.body.translation()); f.row.apex = Math.max(f.row.apex, p[2]);
      if (!f.row.hit && sim.field.hives.some(h => inCell(h, p))) f.row.hit = true;
    }
    const last = rows[rows.length - 1];
    if (last && last.recover == null && sim.t > last.t + 0.02 && ready) last.recover = sim.t - last.t;
    if (k % 2 === 0) trace.push([sim.t, rpmOf(load)]);
    await pace(pre, sim, k);
    if (fired === shots && sim.t > lastShotT + 2.2) break;
  }
  } finally { (o.dispose || ((s) => s.destroy()))(sim); }
  return { rows, trace, spinUp, targetWheel, tips: sim.field?.hives?.[0]?.tips?.length ?? 0, distIn: o.distIn ?? 30, pose: sp.pose, sim: o.keep ? sim : null };
}

/** distance x hood grid, a few shots each: which settings score from where */
export async function shooterSweep(R, cfg, o = {}) {
  const grid = [];
  for (const d of o.dists) {
    const row = [];
    for (const h of o.hoods) {
      const r = await shooterTest(R, cfg, { ...o, distIn: d, hood: h, shots: o.shots ?? 3, show: false });
      row.push({ hood: h, hits: r.rows.filter(x => x.hit).length, shots: r.rows.length });
      o.onProgress?.(`${d} in, hood ${h.toFixed(2)}`);
    }
    grid.push({ dist: d, row });
  }
  return grid;
}

/** Intake: a line of POLLEN in front of the robot, drive into it with the intake on, time every pickup */
export async function intakeTest(R, cfg, o = {}) {
  const H = (cfg.holders || []).find(h => h.intake); if (!H) throw new Error('This robot has no intake. Add one in Robot, step 6.');
  const n = o.balls ?? 5, spacing = (o.spacingIn ?? 8) * IN;
  const sim = new Simulation(R, { robotCfg: cfg, pose: { x: -1.25, y: -1.0, heading: 0 }, alliance: 'red', seed: o.seed ?? 4, preload: 0 });
  o.onSim?.(sim);
  const front = Math.max(...(cfg.chassis.colliders || [{ c: [0, 0], h: cfg.chassis.size.map(x => x / 2) }]).map(c => c.c[1] + c.h[1]));
  const p0 = v3a(sim.robot.body.translation()), placed = [];
  for (let i = 0; i < n; i++) placed.push(sim.addBall('pollen', 'yellow', [p0[0] + front + 0.12 + i * spacing, p0[1] + (o.offsetIn ?? 0) * IN, 0.036]));
  const holder = sim.robot.holders.find(h => h.id === H.id), rows = [];
  const drive = (p) => Object.fromEntries(sim.robot.wheels.map(w => [w.motor, { mode: 'power', p: p * (w.motorDir ?? 1), brake: true }]));
  let k = 0, last = 0;
  const T = (o.seconds ?? 6);
  try {
  while (sim.t < T) {
    sim.setCommands(merge({ motors: drive(o.power ?? 0.3) }, ruleCmd(cfg, H.intake, true)));
    sim.tick(); k++;
    if (holder.balls.length > last) { rows.push({ n: holder.balls.length, t: sim.t, dist: Math.hypot(...sub(v3a(sim.robot.body.translation()), p0).slice(0, 2)) / IN }); last = holder.balls.length; }
    await pace(o, sim, k);
    if (holder.balls.length >= (H.capacity ?? 1) && sim.t > (rows[rows.length - 1]?.t ?? 0) + 0.5) break;
  }
  } finally { (o.dispose || ((s) => s.destroy()))(sim); }
  const pushed = placed.filter(b => !b.held).length;
  return { rows, placed: n, held: last, capacity: H.capacity ?? 1, left: pushed, seconds: rows.length ? rows[rows.length - 1].t : null };
}

/** Drivetrain: 0 to 90 % speed, top speed, stopping distance, strafe, turn rate, drift over the run */
export async function driveTest(R, cfg, o = {}) {
  const res = {};
  const run = async (kind) => {
    const sim = new Simulation(R, { robotCfg: cfg, pose: { x: -1.3, y: -1.05, heading: 0 }, alliance: 'red', seed: 5, preload: 0, battery: o.battery ?? 13 });
    o.onSim?.(sim);
    const vr = kind === 'strafe' ? [-1, 0, 0] : kind === 'turn' ? [0, 0, 1] : [0, 1, 0];
    const ws = sim.robot.wheels.map(w => { const vx = vr[0] - vr[2] * w.pos[1] * 4, vy = vr[1] + vr[2] * w.pos[0] * 4, c = w.fwd[0] * w.d[0] + w.fwd[1] * w.d[1]; return (w.d[0] * vx + w.d[1] * vy) / (c || 1); });
    const mx = Math.max(...ws.map(Math.abs)) || 1, p = o.power ?? 1;
    const cmd = (on) => ({ motors: Object.fromEntries(sim.robot.wheels.map((w, i) => [w.motor, { mode: 'power', p: on ? p * ws[i] / mx * (w.motorDir ?? 1) : 0, brake: true }])) });
    const p0 = v3a(sim.robot.body.translation()), h0 = sim.robot.yaw();
    let vmax = 0, t90 = null, k = 0, turned = 0, last = h0; const speeds = [];
    const onFor = kind === 'turn' ? 2 : 1.4;
    while (sim.t < onFor) {
      sim.setCommands(cmd(true)); sim.tick(); k++;
      const lv = sim.robot.body.linvel(), sp = Math.hypot(lv.x, lv.y); speeds.push([sim.t, sp]); vmax = Math.max(vmax, sp);
      const y = sim.robot.yaw(); let d = y - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; last = y;
      await pace(o, sim, k);
    }
    t90 = speeds.find(([, s]) => s >= 0.9 * vmax)?.[0] ?? null;
    const pStop = v3a(sim.robot.body.translation());
    while (sim.t < onFor + 1.5) { sim.setCommands(cmd(false)); sim.tick(); k++; await pace(o, sim, k); }
    const p1 = v3a(sim.robot.body.translation());
    const out = { vmax, t90, stop: Math.hypot(p1[0] - pStop[0], p1[1] - pStop[1]), turnRate: Math.abs(turned) / onFor, headingDrift: (sim.robot.yaw() - h0) * 180 / Math.PI, travelled: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) };
    (o.dispose || ((s) => s.destroy()))(sim); return out;
  };
  res.forward = await run('forward');
  if ((cfg.wheels || []).some(w => w.type === 'mecanum')) res.strafe = await run('strafe');
  res.turn = await run('turn');
  return res;
}

/** Lift / arm: full power out to the stop, then zero power: travel time, holding, current */
export async function jointTest(R, cfg, jointId, o = {}) {
  const j = (cfg.joints || []).find(x => x.id === jointId); if (!j) throw new Error('No joint ' + jointId);
  const mot = (cfg.motors || []).find(m => m.load?.joint === j.id), sv = (cfg.servos || []).find(s => s.joint === j.id);
  const sim = new Simulation(R, { robotCfg: cfg, pose: { x: -1.3, y: -1.05, heading: 0 }, alliance: 'red', seed: 6, preload: 0 });
  o.onSim?.(sim);
  const q0 = sim.robot.jointState(j.id)[0], lim = j.limits, trace = [];
  let k = 0, t90 = null, peakA = 0;
  const cmd = (on) => mot ? { motors: { [mot.name]: { mode: 'power', p: on ? (o.power ?? 1) : 0, brake: true } } } : { servos: { [sv.name]: { pos: 1 } } };   // a powered servo keeps holding its last position
  try {
    while (sim.t < 2.5) {
      sim.setCommands(cmd(true)); sim.tick(); k++;
      const q = sim.robot.jointState(j.id)[0]; trace.push([sim.t, q]);
      if (mot) peakA = Math.max(peakA, sim.robot.motors[mot.name].current);
      if (lim && t90 == null && Math.abs(q - q0) >= 0.9 * Math.abs(lim[1] - q0)) t90 = sim.t;
      await pace(o, sim, k);
    }
    const qTop = sim.robot.jointState(j.id)[0];
    while (sim.t < 4) { sim.setCommands(cmd(false)); sim.tick(); k++; trace.push([sim.t, sim.robot.jointState(j.id)[0]]); await pace(o, sim, k); }
    const qEnd = sim.robot.jointState(j.id)[0];
    return { joint: j, by: mot ? mot.name : sv.name, prismatic: j.type === 'prismatic', q0, qTop, qEnd, t90, peakA, trace };
  } finally { (o.dispose || ((s) => s.destroy()))(sim); }
}

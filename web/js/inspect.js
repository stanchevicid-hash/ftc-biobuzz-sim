// Robot inspection: what an FTC inspector and a mentor would check before trusting a robot model.
// Static part: geometry over every joint position (R102 start size, R105 expansion), mass and tipping,
// actuator rules (R501-R503), drivetrain sanity, device names. Dynamic part: short test drives in the simulator.
import { MOTORS, SERVOS } from './motors.js';
import { Simulation, TICK } from './sim.js';

const IN = 0.0254, G = 9.81;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(...a) || 1; return scale(a, 1 / l); };
const fmt = (m) => (m / IN).toFixed(1);

/** rotate point p about the axis (unit a) through c by angle t (Rodrigues) */
function rotAbout(p, c, a, t) {
  const v = sub(p, c), cs = Math.cos(t), sn = Math.sin(t);
  return add(c, add(add(scale(v, cs), scale(cross(a, v), sn)), scale(a, dot(a, v) * (1 - cs))));
}
/** maps a point given in a link's zero pose to its pose for joint values q (follows the parent chain) */
function linkMover(cfg, q) {
  const byId = Object.fromEntries((cfg.joints || []).map(j => [j.id, j]));
  const move = (id, p) => {
    if (!id || id === 'chassis' || !byId[id]) return p;
    const j = byId[id], a = norm(j.axis), x = q[id] ?? j.initial ?? 0;
    const local = j.type === 'prismatic' ? add(p, scale(a, x)) : rotAbout(p, j.anchor, a, x);
    return move(j.parent, local);
  };
  return move;
}
function boxes(cfg) {
  const out = [], ch = cfg.chassis;
  for (const c of ch.colliders || [{ c: [0, 0, ch.clearance + ch.size[2] / 2], h: ch.size.map(x => x / 2) }]) out.push({ link: 'chassis', ...c });
  for (const w of cfg.wheels || []) out.push({ link: 'chassis', c: w.pos, h: [(w.width || 0.04) / 2, w.radius, w.radius] });
  for (const j of cfg.joints || []) for (const b of j.colliders || [{ c: j.box?.c || j.anchor, h: j.box?.h || [0.02, 0.02, 0.02] }]) out.push({ link: j.id, ...b });
  return out;
}
function extents(cfg, q) {
  const move = linkMover(cfg, q), e = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  for (const b of boxes(cfg)) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = move(b.link, [b.c[0] + sx * b.h[0], b.c[1] + sy * b.h[1], b.c[2] + sz * b.h[2]]);
    e[0] = Math.min(e[0], p[0]); e[1] = Math.max(e[1], p[0]); e[2] = Math.min(e[2], p[1]); e[3] = Math.max(e[3], p[1]); e[4] = Math.min(e[4], p[2]); e[5] = Math.max(e[5], p[2]);
  }
  return { dx: e[1] - e[0], dy: e[3] - e[2], top: e[5], bottom: e[4] };
}
/** every combination of joint positions worth measuring (ends of travel, plus intermediate angles for rotating joints) */
function jointSamples(cfg) {
  const lists = (cfg.joints || []).map(j => {
    const lim = j.limits, lo = lim ? lim[0] : (j.type === 'prismatic' ? 0 : -Math.PI), hi = lim ? lim[1] : (j.type === 'prismatic' ? 0.5 : Math.PI);
    const n = j.type === 'prismatic' ? 2 : 9;
    return { id: j.id, vals: Array.from({ length: n }, (_, k) => lo + (hi - lo) * k / (n - 1)) };
  });
  let combos = [{}];
  for (const l of lists) {
    const next = [];
    for (const c of combos) for (const v of l.vals) next.push({ ...c, [l.id]: v });
    combos = next.length > 6000 ? next.filter((_, i) => i % Math.ceil(next.length / 6000) === 0) : next;
  }
  return combos;
}
function centerOfMass(cfg, q) {
  const move = linkMover(cfg, q);
  let m = cfg.chassis.mass, s = scale(cfg.chassis.com, cfg.chassis.mass);
  for (const w of cfg.wheels || []) { m += w.mass ?? 0.2; s = add(s, scale(w.pos, w.mass ?? 0.2)); }
  for (const j of cfg.joints || []) { const c = move(j.id, j.box?.c || j.anchor), mj = j.mass ?? 0.3; m += mj; s = add(s, scale(c, mj)); }
  return { mass: m, com: scale(s, 1 / m) };
}
/** smallest distance from point to the convex hull edges of the wheel contacts (negative = outside) */
function supportMargin(cfg, com) {
  const pts = (cfg.wheels || []).map(w => [w.pos[0], w.pos[1]]);
  if (pts.length < 3) return null;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    best = Math.min(best, ((com[0] - a[0]) * ey - (com[1] - a[1]) * ex) / L * -1);
  }
  return best;
}

/** static checks; returns [{level:'pass'|'warn'|'fail'|'info', title, detail}] */
export function inspectStatic(cfg) {
  const R = [], add_ = (level, title, detail = '') => R.push({ level, title, detail });
  const joints = cfg.joints || [];
  // ---- R102: starting configuration
  const start = extents(cfg, {});
  const sOk = start.dx <= 18 * IN + 1e-4 && start.dy <= 18 * IN + 1e-4 && start.top <= 18 * IN + 1e-4;
  add_(sOk ? 'pass' : 'fail', `Starting size ${fmt(start.dx)} × ${fmt(start.dy)} × ${fmt(start.top)} in`, sOk ? 'Fits the 18 in cube (R102).' : 'Must fit an 18 × 18 × 18 in cube at the start of the match (R102). Fold mechanisms or set joint start positions.');
  // ---- R105: every joint position
  if (joints.length) {
    let worst = { dx: 0, dy: 0, top: 0 }, worstQ = {};
    for (const q of jointSamples(cfg)) {
      const e = extents(cfg, q);
      if (e.dx > worst.dx) { worst.dx = e.dx; worstQ.dx = q; }
      if (e.dy > worst.dy) { worst.dy = e.dy; worstQ.dy = q; }
      if (e.top > worst.top) { worst.top = e.top; worstQ.top = q; }
    }
    const fits = (worst.dx <= 18 * IN + 1e-4 && worst.dy <= 24 * IN + 1e-4) || (worst.dx <= 24 * IN + 1e-4 && worst.dy <= 18 * IN + 1e-4);
    const tall = worst.top <= 29 * IN + 1e-4;
    const where = (q) => Object.entries(q || {}).map(([k, v]) => `${k} ${joints.find(j => j.id === k)?.type === 'prismatic' ? (v / IN).toFixed(1) + ' in' : (v * 180 / Math.PI).toFixed(0) + '°'}`).join(', ');
    add_(fits && tall ? 'pass' : 'fail', `Fully expanded ${fmt(worst.dx)} × ${fmt(worst.dy)} in, ${fmt(worst.top)} in tall`,
      fits && tall ? 'Stays inside 18 × 24 × 29 in at every joint position (R105).'
        : `R105 allows 18 × 24 in and 29 in tall at every mechanically possible position. Worst case: ${!tall ? 'height at ' + where(worstQ.top) : 'width at ' + where(worst.dx > worst.dy ? worstQ.dx : worstQ.dy)}.`);
    const unlimited = joints.filter(j => !j.limits);
    if (unlimited.length) add_('warn', `No mechanical stop on ${unlimited.map(j => j.id).join(', ')}`, 'R105 needs hard stops. Add them and enter the limits in the joint table.');
  }
  // ---- mass, center of mass, tipping
  const c0 = centerOfMass(cfg, {});
  add_('info', `Mass ${c0.mass.toFixed(2)} kg (${(c0.mass / 0.4536).toFixed(1)} lb)`, 'There is no weight limit (R104). Heavier robots accelerate slower and drain the battery faster.');
  const m0 = supportMargin(cfg, c0.com);
  if (m0 != null) {
    let worstMargin = m0, worstCom = c0.com;
    for (const q of joints.length ? jointSamples(cfg) : []) { const c = centerOfMass(cfg, q).com, m = supportMargin(cfg, c); if (m < worstMargin) { worstMargin = m; worstCom = c; } }
    const aTip = worstMargin / Math.max(0.02, worstCom[2]);    // in g: deceleration that lifts the wheels on the near edge
    if (worstMargin < 0) add_('fail', 'Center of mass leaves the wheelbase', 'With a mechanism extended the robot falls over by itself. Move weight back or limit the mechanism.');
    else if (aTip < 0.6) add_('warn', `Can tip over when braking or turning hard (at ${aTip.toFixed(2)} g)`, `Center of mass is ${(worstMargin * 1000).toFixed(0)} mm from the nearest wheel edge and ${(worstCom[2] * 1000).toFixed(0)} mm high in the worst pose. Wheels on tiles grip up to about 1 g.`);
    else add_('pass', `Stable: needs ${aTip.toFixed(2)} g to tip`, `Center of mass ${(c0.com[2] * 1000).toFixed(0)} mm high, at least ${(worstMargin * 1000).toFixed(0)} mm inside the wheels.`);
  }
  // ---- drivetrain
  const W = cfg.wheels || [];
  if (!W.length) add_('fail', 'No drive wheels', 'Mark the wheels in the parts table so the robot can drive.');
  else {
    const off = W.filter(w => Math.abs(w.pos[2] - w.radius) > 0.006);
    if (off.length) add_('warn', `${off.map(w => w.motor).join(', ')} do not touch the floor in the model`, 'Wheel center height should equal its radius. Check the units and the up axis.');
    if (cfg.chassis.clearance < 0.005) add_('warn', 'Frame almost touches the tiles', `Ground clearance ${(cfg.chassis.clearance * 1000).toFixed(0)} mm. Tile seams and balls will catch it.`);
    const mec = W.filter(w => w.type === 'mecanum');
    if (mec.length === 4) {
      const q = (w) => (w.pos[1] >= 0 ? 'f' : 'b') + (w.pos[0] < 0 ? 'l' : 'r'), by = Object.fromEntries(mec.map(w => [q(w), w]));
      const xPattern = by.fl && by.br && by.fr && by.bl && by.fl.roller === by.br.roller && by.fr.roller === by.bl.roller && by.fl.roller !== by.fr.roller;
      add_(xPattern ? 'pass' : 'fail', xPattern ? 'Mecanum rollers form an X' : 'Mecanum rollers are not in an X pattern', xPattern ? 'Strafing works.' : 'Diagonal wheels must have the same roller direction and the left and right wheels opposite ones, or the robot cannot strafe. Swap the roller setting in the wheel table.');
    } else if (mec.length && mec.length !== 4) add_('warn', `${mec.length} mecanum wheels`, 'Mecanum drives normally use four.');
    const leftDirs = new Set(W.filter(w => w.pos[0] < 0).map(w => w.motorDir ?? 1)), rightDirs = new Set(W.filter(w => w.pos[0] >= 0).map(w => w.motorDir ?? 1));
    if (leftDirs.size === 1 && rightDirs.size === 1 && [...leftDirs][0] !== [...rightDirs][0])
      add_('info', `Reverse the ${[...leftDirs][0] < 0 ? 'left' : 'right'} drive motors in code`, 'Positive power spins this side backwards. Add setDirection(REVERSE), same as on the real robot.');
  }
  // ---- actuators: R501 / R502 / R503
  const motors = [...W.map(w => ({ name: w.motor, model: w.model })), ...(cfg.motors || [])], servos = cfg.servos || [];
  add_(motors.length <= 8 && servos.length <= 8 ? 'pass' : 'fail', `${motors.length} motors, ${servos.length} servos`, motors.length <= 8 && servos.length <= 8 ? 'Within the 8 + 8 limit (R503).' : 'R503 allows at most 8 motors and 8 servos.');
  const unknown = motors.filter(m => !MOTORS[m.model]);
  if (unknown.length) add_('warn', `Unknown motor model for ${unknown.map(m => m.name).join(', ')}`, 'Pick a motor from the list so torque and encoder ticks are right. Only R501 motors are legal.');
  for (const s of servos) {
    const sp = SERVOS[s.model]; if (!sp) continue;
    const watts = 0.25 * sp.torque * (Math.PI / 3 / sp.secPer60);
    if (watts > 8) add_('fail', `Servo ${s.name} is over 8 W`, `${sp.name}: ${watts.toFixed(1)} W by the R502 formula.`);
  }
  // ---- joints: is something driving them, and is it strong enough
  for (const j of joints) {
    const mot = (cfg.motors || []).find(m => m.load?.joint === j.id), sv = servos.find(s => s.joint === j.id);
    if (!mot && !sv) { add_('warn', `Nothing drives joint ${j.id}`, 'Assign a motor or a servo, otherwise it just hangs.'); continue; }
    const mass = j.mass ?? 0.3, a = norm(j.axis), c = j.box?.c || j.anchor;
    let need, unit;
    if (j.type === 'prismatic') { need = mass * G * Math.max(0, a[2]); unit = 'N'; }
    else { const r = sub(c, j.anchor), perp = sub(r, scale(a, dot(r, a))), horiz = Math.hypot(perp[0], perp[1], a[2] ? 0 : perp[2]); need = mass * G * Math.max(Math.hypot(perp[0], perp[1]), horiz); unit = 'N·m'; }
    let have;
    if (mot) { const mm = MOTORS[mot.model]; have = mm ? mm.stallTorque * (mot.efficiency ?? 0.85) * (mot.load.ratio ?? 1) : 0; }
    else { const sp = SERVOS[sv.model], travel = sv.travel ?? (j.type === 'prismatic' ? 0.1 : sp.range * Math.PI / 180); have = sp.torque * (sp.range * Math.PI / 180) / travel; }
    if (need < 1e-3) continue;
    const ratio = need / Math.max(1e-6, have);
    const by = mot ? `${MOTORS[mot.model]?.name || mot.model}` : SERVOS[sv.model]?.name;
    if (ratio > 0.8) add_('fail', `${j.id} is too heavy for its ${mot ? 'motor' : 'servo'}`, `Holding it against gravity needs ${need.toFixed(2)} ${unit}, ${by} gives ${have.toFixed(2)} ${unit} at stall. Use a stronger gear ratio or lighten the mechanism.`);
    else if (ratio > 0.4) add_('warn', `${j.id} runs at ${(ratio * 100).toFixed(0)}% of stall just to hold`, `${need.toFixed(2)} of ${have.toFixed(2)} ${unit} (${by}). It will be slow and the motor will heat up.`);
    else add_('pass', `${j.id} can lift itself`, `Needs ${need.toFixed(2)} ${unit}, ${by} gives ${have.toFixed(2)} ${unit} (${(ratio * 100).toFixed(0)}% of stall).`);
  }
  // ---- device names
  const names = [...motors.map(m => m.name), ...servos.map(s => s.name), ...(cfg.sensors || []).map(s => s.name)];
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) add_('fail', `Duplicate device names: ${[...new Set(dup)].join(', ')}`, 'Every hardwareMap name must be unique.');
  if (names.some(n => !n || /\s$|^\s/.test(n))) add_('warn', 'A device name is empty or has spaces at the ends', 'hardwareMap.get() would not find it.');
  if (!(cfg.sensors || []).some(s => s.type === 'webcam' || s.type === 'limelight')) add_('info', 'No camera', 'AprilTag aiming at the CELLS needs a webcam or a Limelight.');
  return R;
}

/** short test drives in the simulator: speeds, turning, every joint. Yields between tests so the page stays responsive. */
export async function inspectDynamic(R, cfg, onProgress = () => { }) {
  const out = [], add_ = (level, title, detail = '') => out.push({ level, title, detail });
  const tick = () => new Promise(r => setTimeout(r, 0));
  const mk = () => new Simulation(R, { robotCfg: cfg, pose: { x: 0, y: -1.0, heading: 90 }, alliance: 'red', seed: 5, preload: 0 });
  const W = cfg.wheels || [];
  const drive = (sim, vx, vy, w, s) => {
    const ws = sim.robot.wheels.map(wh => { const v = [vx - w * wh.pos[1] * 4, vy + w * wh.pos[0] * 4], c = wh.fwd[0] * wh.d[0] + wh.fwd[1] * wh.d[1]; return (wh.d[0] * v[0] + wh.d[1] * v[1]) / (c || 1); });
    const mx = Math.max(...ws.map(Math.abs)) || 1;
    const cmd = { motors: Object.fromEntries(sim.robot.wheels.map((wh, i) => [wh.motor, { mode: 'power', p: ws[i] / mx * (wh.motorDir ?? 1), brake: true }])) };
    let vmax = 0, turned = 0, last = sim.robot.yaw(); const p0 = sim.robot.body.translation(), h0 = last;
    for (let t = 0; t < s; t += TICK) {
      sim.setCommands(cmd); sim.tick();
      const lv = sim.robot.body.linvel(); vmax = Math.max(vmax, Math.hypot(lv.x, lv.y));
      const y = sim.robot.yaw(); let d = y - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; last = y;
    }
    const p1 = sim.robot.body.translation();
    return { vmax, turned, dist: Math.hypot(p1.x - p0.x, p1.y - p0.y), drift: (p1.x - p0.x), dh: (sim.robot.yaw() - h0) * 180 / Math.PI };
  };
  if (W.length) {
    onProgress('Test drive: forward'); await tick();
    let sim = mk(); const f = drive(sim, 0, 1, 0, 1.5); sim.destroy();
    const fwdOk = f.vmax > 0.3;
    add_(fwdOk ? 'pass' : 'fail', `Drives forward at ${(f.vmax / IN).toFixed(0)} in/s (${f.vmax.toFixed(2)} m/s)`, fwdOk ? `Crosses the field (144 in) in about ${(3.66 / f.vmax + 0.4).toFixed(1)} s.` : 'The robot barely moves: check wheel motor models and that wheels touch the floor.');
    if (fwdOk && Math.abs(f.dh) > 3) add_('warn', `Turns ${Math.abs(f.dh).toFixed(0)}° while driving straight for 1.5 s`, 'Uneven wheel load or a wheel out of place. Use IMU heading correction.');
    if (W.some(w => w.type === 'mecanum')) {
      onProgress('Test drive: strafe'); await tick();
      sim = mk(); const s = drive(sim, 1, 0, 0, 1.5); sim.destroy();
      const pct = s.vmax / Math.max(1e-6, f.vmax);
      add_(pct > 0.6 ? 'pass' : 'fail', `Strafes at ${(s.vmax / IN).toFixed(0)} in/s (${(pct * 100).toFixed(0)}% of forward)`, pct > 0.6 ? 'Typical mecanum strafing is 75–90% of forward speed.' : 'Strafing barely works: roller pattern or wheel directions are wrong.');
    }
    onProgress('Test drive: turn'); await tick();
    sim = mk(); const r = drive(sim, 0, 0, 1, 2.0); sim.destroy();
    const rate = Math.abs(r.turned) / 2.0;
    add_(rate > 1 ? 'pass' : 'warn', `Turns at ${(rate * 180 / Math.PI).toFixed(0)}°/s`, rate > 1 ? `A full turn takes about ${(2 * Math.PI / rate).toFixed(1)} s at full power.` : 'Very slow turning: wheels may be scrubbing or the wheelbase is long.');
  }
  for (const j of cfg.joints || []) {
    const mot = (cfg.motors || []).find(m => m.load?.joint === j.id), sv = (cfg.servos || []).find(s => s.joint === j.id);
    if (!mot && !sv) continue;
    onProgress(`Moving ${j.id}`); await tick();
    const sim = mk(), lo = j.limits ? j.limits[0] : null, hi = j.limits ? j.limits[1] : null;
    const q0 = sim.robot.jointState(j.id)[0];
    let tReach = null;
    for (let t = 0; t < 2.5; t += TICK) {
      if (mot) sim.setCommands({ motors: { [mot.name]: { mode: 'power', p: 1, brake: true } } });
      else sim.setCommands({ servos: { [sv.name]: { pos: 1 } } });
      sim.tick();
      const q = sim.robot.jointState(j.id)[0];
      if (mot && tReach == null && hi != null && Math.abs(q - hi) < Math.abs(hi - lo) * 0.05) tReach = sim.t;
    }
    const q1 = sim.robot.jointState(j.id)[0];
    for (let t = 0; t < 1.0; t += TICK) { if (mot) sim.setCommands({ motors: { [mot.name]: { mode: 'power', p: 0, brake: true } } }); else sim.setCommands({ servos: { [sv.name]: { pos: 1 } } }); sim.tick(); }
    const q2 = sim.robot.jointState(j.id)[0]; sim.destroy();
    const u = (v) => j.type === 'prismatic' ? `${(v / IN).toFixed(1)} in` : `${(v * 180 / Math.PI).toFixed(0)}°`;
    const range = hi != null ? hi - lo : null, moved = q1 - q0;
    // a servo at position 1 aims at zero + dir * travel, not necessarily at the hard stop
    let goal = hi;
    if (sv) {
      const sp = SERVOS[sv.model], travel = sv.travel ?? (j.type === 'prismatic' ? 0.1 : sp.range * Math.PI / 180);
      goal = (sv.zero ?? 0) + (sv.dir ?? 1) * travel;
      if (range && (goal > hi + range * 0.02 || goal < lo - range * 0.02)) add_('warn', `Servo ${sv.name} is told to go past the stop of ${j.id}`, `Position 1 means ${u(goal)}, the stop is at ${u(goal > hi ? hi : lo)}. The servo would push against it and stall; limit it with scaleRange() in code.`);
      if (range) goal = Math.min(hi, Math.max(lo, goal));
    }
    if (Math.abs(moved) < 1e-3) add_('fail', `${j.id} does not move`, 'Full power for 2.5 s did nothing: the actuator is too weak or the joint is blocked by the field.');
    else if (goal != null && range && Math.abs(q1 - goal) > range * 0.1) add_('warn', `${j.id} reaches ${u(q1)} of ${u(goal)}`, `It moved ${u(moved)} in 2.5 s. Positive power may move it the other way, or it is too weak to finish.`);
    else add_('pass', `${j.id} travels ${u(lo ?? q0)} to ${u(q1)}${tReach ? ` in ${(tReach - 0).toFixed(2)} s` : ''}`, mot ? 'Full power, from the start position.' : 'Servo from position 0 to 1.');
    if (mot && Math.abs(q2 - q1) > (j.type === 'prismatic' ? 0.01 : 0.05)) add_('warn', `${j.id} sags ${u(Math.abs(q2 - q1))} with zero power`, 'Gravity back-drives it. Hold with a little power or RUN_TO_POSITION.');
  }
  return out;
}

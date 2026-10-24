// Mechanisms without code: intake, flywheel, hood and feeder from the gamepad or keyboard,
// plus the predicted flight of the next ball so a driver can learn to aim.
//   right trigger (C) intake     left trigger (Z) spit out     A (1) flywheel on / off
//   right bumper (E) shoot       d-pad up / down (I / K) hood
const state = new WeakMap();

export function mechCommands(gp, robot) {
  const cfg = robot.cfg, L = (cfg.launchers || [])[0], H = robot.holders.find(h => h.intake);
  const st = state.get(robot) || { fly: false, hood: L?.hood ? 0.7 : null, prev: {} };
  state.set(robot, st);
  const edge = (b) => gp[b] && !st.prev[b];
  if (edge('a')) st.fly = !st.fly;
  if (L?.hood && edge('dpad_up')) st.hood = Math.min(1, +(st.hood + 0.05).toFixed(2));
  if (L?.hood && edge('dpad_down')) st.hood = Math.max(0, +(st.hood - 0.05).toFixed(2));
  for (const b of ['a', 'dpad_up', 'dpad_down']) st.prev[b] = gp[b];
  const out = { motors: {}, servos: {} };
  if (H?.intake) out.motors[H.intake.device] = { mode: 'power', p: gp.right_trigger > 0.3 ? 1 : gp.left_trigger > 0.3 ? -1 : 0, brake: true };
  if (L) {
    out.motors[L.flywheel] = st.fly ? { mode: 'velocity', tv: 3000 / 60 * robot.motors[L.flywheel].m.ticks, brake: false } : { mode: 'power', p: 0, brake: false };
    if (L.hood) out.servos[L.hood.device] = { pos: st.hood };
    const sv = (cfg.servos || []).some(s => s.name === L.feed.device);
    const on = gp.right_bumper && st.fly;
    if (sv) out.servos[L.feed.device] = { pos: on ? 1 : 0 };
    else out.motors[L.feed.device] = { mode: 'power', p: on ? 1 : 0, brake: true };
  }
  return out;
}

/** flywheel and hood state for the readout: { fly, rpm, target, hood } or null */
export function mechStatus(robot) {
  const L = (robot.cfg.launchers || [])[0], st = state.get(robot); if (!L) return null;
  const load = robot.cfg.motors.find(m => m.name === L.flywheel)?.load;
  return { fly: !!st?.fly, rpm: Math.abs(load?.omega ?? 0) * 60 / (2 * Math.PI) * (load?.ratio ?? 1), target: 3000, hood: st?.hood };
}

/** where the next ball would fly: launcher exit, hood pitch and the wheel's current surface speed, gravity and air drag */
export function predictArc(robot) {
  const L = (robot.cfg.launchers || [])[0]; if (!L) return null;
  const load = robot.cfg.motors.find(m => m.name === L.flywheel)?.load; if (!load) return null;
  const speed = Math.abs(load.omega ?? 0) * (load.radius ?? 0.048) * (L.speedFactor ?? 0.5); if (speed < 1) return null;
  let pitch = L.pitchDeg ?? 45;
  if (L.hood) { const sp = robot.servoPos(L.hood.device); if (sp != null) pitch = L.hood.min + (L.hood.max - L.hood.min) * sp; }
  const body = robot.linkBody(L.link), q = body.rotation(), pr = pitch * Math.PI / 180;
  const rot = (v) => { const { w, x, y, z } = q, [vx, vy, vz] = v, tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx); return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]; };
  const d = rot([0, Math.cos(pr), Math.sin(pr)]), p = robot.linkToWorld(L.link, L.exit);
  const pts = [], v = d.map(c => c * speed), dt = 0.01;
  let x = [...p];
  for (let i = 0; i < 250 && x[2] > 0; i++) {
    pts.push([...x]);
    for (let k = 0; k < 3; k++) v[k] *= (1 - 0.15 * dt);       // same linear damping as the ball bodies
    v[2] -= 9.81 * dt; x = [x[0] + v[0] * dt, x[1] + v[1] * dt, x[2] + v[2] * dt];
  }
  return pts;
}

// Records a run (every 2nd tick = 50 Hz): poses for replay, the robot path, motor/telemetry data for a CSV log.
const MAX_FRAMES = 12000;        // 4 minutes at 50 Hz

const pose7 = (b) => { const p = b.translation(), q = b.rotation(); return [p.x, p.y, p.z, q.w, q.x, q.y, q.z]; };

export class Recorder {
  constructor() { this.reset(null); }
  reset(sim) {
    this.sim = sim; this.frames = []; this.trail = []; this.k = 0;
    this.tele = []; this.lastTele = ''; this.markers = [];
  }
  /** called after every physics tick */
  capture(sim, info = {}) {
    if (sim !== this.sim) this.reset(sim);
    if (this.k++ % 2) return;
    if (this.frames.length >= MAX_FRAMES) { this.frames.shift(); }
    const r = sim.robot, links = Object.values(r.links);
    const robots = [r, ...(sim.others || [])];
    const buf = [];
    for (const rb of robots) { buf.push(...pose7(rb.body)); for (const L of Object.values(rb.links)) buf.push(...pose7(L.body)); }
    for (const h of sim.field.hives) { const q = h.body.rotation(); buf.push(q.w, q.x, q.y, q.z); }
    for (const b of sim.balls) { const p = b.body.translation(); buf.push(p.x, p.y, p.z); }
    const motors = {};
    for (const [n, m] of Object.entries(r.motors)) motors[n] = [m.duty, m.vel, m.pos, m.current];
    const p = r.pose();
    this.frames.push({ t: sim.t, data: Float32Array.from(buf), nBalls: sim.balls.length, motors, battery: sim.battery.v,
      pose: [p.x, p.y, p.heading], phase: info.phase, op: info.op, tele: info.tele });
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 0.01) this.trail.push([p.x, p.y]);
    if (this.trail.length > 20000) this.trail.shift();
  }
  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t - this.frames[0].t : 0; }

  /** put the recorded state at time t back into the (paused) simulation so the renderer shows it */
  apply(sim, t) {
    if (!this.frames.length) return null;
    let lo = 0, hi = this.frames.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.frames[m].t <= t) lo = m; else hi = m - 1; }
    const f = this.frames[lo], d = f.data; let i = 0;
    const set = (b) => { b.setTranslation({ x: d[i], y: d[i + 1], z: d[i + 2] }, false); b.setRotation({ w: d[i + 3], x: d[i + 4], y: d[i + 5], z: d[i + 6] }, false); b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false); i += 7; };
    for (const rb of [sim.robot, ...(sim.others || [])]) { set(rb.body); for (const L of Object.values(rb.links)) set(L.body); }
    for (const h of sim.field.hives) { h.body.setRotation({ w: d[i], x: d[i + 1], y: d[i + 2], z: d[i + 3] }, false); i += 4; }
    sim.balls.forEach((b, k) => { if (k < f.nBalls) b.body.setTranslation({ x: d[i + 3 * k], y: d[i + 3 * k + 1], z: d[i + 3 * k + 2] }, false); else b.body.setTranslation({ x: 0, y: 0, z: -5 }, false); });
    return f;
  }

  /** CSV: time, pose (inches/deg), every motor (power, velocity, position, current), battery, numeric telemetry */
  csv() {
    if (!this.frames.length) return '';
    const motors = Object.keys(this.frames[0].motors);
    const teleKeys = new Set();
    for (const f of this.frames) for (const l of f.tele || []) { const m = l.match(/^\s*([^:|]{1,40}?)\s*:\s*(-?\d+(?:\.\d+)?)/); if (m) teleKeys.add(m[1]); }
    const tk = [...teleKeys];
    const head = ['t_s', 'x_in', 'y_in', 'heading_deg', 'phase', ...motors.flatMap(n => [`${n}_power`, `${n}_vel_tps`, `${n}_pos_ticks`, `${n}_current_A`]), 'battery_V', ...tk.map(k => 'tele_' + k.replace(/\W+/g, '_'))];
    const lines = [head.join(',')], t0 = this.frames[0].t;
    for (const f of this.frames) {
      const tv = {}; for (const l of f.tele || []) { const m = l.match(/^\s*([^:|]{1,40}?)\s*:\s*(-?\d+(?:\.\d+)?)/); if (m) tv[m[1]] = m[2]; }
      lines.push([(f.t - t0).toFixed(3), (f.pose[0] / 0.0254).toFixed(2), (f.pose[1] / 0.0254).toFixed(2), f.pose[2].toFixed(2), f.phase || '',
        ...motors.flatMap(n => { const m = f.motors[n] || [0, 0, 0, 0]; return [m[0].toFixed(3), Math.round(m[1]), Math.round(m[2]), m[3].toFixed(2)]; }),
        f.battery.toFixed(2), ...tk.map(k => tv[k] ?? '')].join(','));
    }
    return lines.join('\n');
  }
}

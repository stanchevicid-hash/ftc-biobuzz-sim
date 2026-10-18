// Builds the sensor snapshot sent to the OpMode each tick (the fake SDK reads it).
import { qRotate, qMul, qConj, qAxis, IN, GROUP, groups, ZONES, cellTags, HIVE } from './field.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const arr = (o) => [o.x, o.y, o.z];
const D2R = Math.PI / 180;

export const DEFAULT_NOISE = {
  sensorDelayMs: 0, actuatorDelayMs: 0,
  imuNoiseDeg: 0.03, imuDriftDegPerMin: 0.3,
  distNoiseFrac: 0.01, distNoiseMm: 2,
  colorNoise: 0.01,
  tagPosNoise: 0.004, tagAngNoiseDeg: 0.4,          // meters / deg at 1 m, grows with distance^2
  encoderNoiseTicks: 0, pinpointNoise: 0.0005,
};

/** Control Hub mounting on the robot (hub +Z = logo side, hub +Y = USB side), as a quaternion; logo UP + USB FORWARD = identity */
export function hubMount(logo = 'UP', usb = 'FORWARD') {
  const D = { UP: [0, 0, 1], DOWN: [0, 0, -1], FORWARD: [0, 1, 0], BACKWARD: [0, -1, 0], LEFT: [-1, 0, 0], RIGHT: [1, 0, 0] };
  const z = D[logo] || D.UP, y = D[usb] || D.FORWARD, x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  const m = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]], t = m[0][0] + m[1][1] + m[2][2];
  let w, a, b, c;
  if (t > 0) { const S = Math.sqrt(t + 1) * 2; w = S / 4; a = (m[2][1] - m[1][2]) / S; b = (m[0][2] - m[2][0]) / S; c = (m[1][0] - m[0][1]) / S; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const S = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / S; a = S / 4; b = (m[0][1] + m[1][0]) / S; c = (m[0][2] + m[2][0]) / S; }
  else if (m[1][1] > m[2][2]) { const S = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / S; a = (m[0][1] + m[1][0]) / S; b = S / 4; c = (m[1][2] + m[2][1]) / S; }
  else { const S = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / S; a = (m[0][2] + m[2][0]) / S; b = (m[1][2] + m[2][1]) / S; c = S / 4; }
  return { mw: w, mx: a, my: b, mz: c };
}

export function gauss(rng = Math.random) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** camera/sensor orientation in its link frame: forward = robot +Y turned by yaw (about Z), pitch (up +), roll */
export function sensorQuat(s) {
  return qMul(qAxis(0, 0, 1, (s.yaw || 0) * D2R), qMul(qAxis(1, 0, 0, (s.pitch || 0) * D2R), qAxis(0, 1, 0, (s.roll || 0) * D2R)));
}
export function sensorWorld(robot, s) {
  const body = robot.linkBody(s.link);
  const qs = qMul(body.rotation(), sensorQuat(s));
  return { pos: robot.linkToWorld(s.link, s.pos || [0, 0, 0]), q: qs, fwd: qRotate(qs, [0, 1, 0]), right: qRotate(qs, [1, 0, 0]), up: qRotate(qs, [0, 0, 1]) };
}

const COLORS = {
  yellow: [0.85, 0.78, 0.15], red: [0.8, 0.12, 0.12], blue: [0.12, 0.25, 0.85], tile: [0.25, 0.27, 0.28], tapeRed: [0.75, 0.1, 0.1], tapeBlue: [0.1, 0.2, 0.75],
  wall: [0.55, 0.6, 0.65], frame: [0.6, 0.6, 0.62], green: [0.25, 0.55, 0.2], robot: [0.5, 0.5, 0.52],
};
function inRect(r, x, y) { return x >= r[0] && x <= r[1] && y >= r[2] && y <= r[3]; }
function surfaceColor(col, p) {
  const u = col.userData || {};
  if (u.kind === 'ball') return COLORS[u.color] || COLORS.yellow;
  if (u.kind === 'floor') {
    for (const a of ['red', 'blue']) {
      if (inRect(ZONES.garden[a], p[0], p[1])) return a === 'red' ? COLORS.tapeRed : COLORS.tapeBlue;
      const z = ZONES.loading[a], w = IN;
      if (inRect(z, p[0], p[1]) && !inRect([z[0] + w, z[1] - w, z[2] + w, z[3] - w], p[0], p[1])) return a === 'red' ? COLORS.tapeRed : COLORS.tapeBlue;
    }
    return COLORS.tile;
  }
  if (u.kind === 'hive') return u.alliance === 'red' ? COLORS.red : COLORS.blue;
  if (u.kind === 'flower') return COLORS.green;
  if (u.kind === 'wall') return COLORS.wall;
  return COLORS.robot;
}

export class SensorSuite {
  constructor(sim) { this.sim = sim; this.rng = sim.rng; this.drift = 0; }

  ray(robot, origin, dir, max, ownToo = false) {
    const R = this.sim.R, world = this.sim.world;
    const own = robot.ownBodies;
    const ray = new R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
    const hit = world.castRay(ray, max, true, undefined, groups(0xffff, 0xffff & ~GROUP.HELD), undefined, undefined,
      (c) => ownToo || !(c.parent() && own.has(c.parent().handle)));
    if (!hit) return null;
    return { toi: hit.toi, col: hit.collider, p: add(origin, scale(dir, hit.toi)) };
  }

  snapshot(dt) {
    const sim = this.sim, r = sim.robot, N = sim.noise, g = () => gauss(this.rng);
    const out = { motors: {}, imu: {}, distance: {}, color: {}, touch: {}, analog: {}, pinpoint: {}, apriltag: {}, limelight: {}, cameras: {} };
    for (const [n, m] of Object.entries(r.motors))
      out.motors[n] = { pos: Math.round(m.pos + (N.encoderNoiseTicks ? g() * N.encoderNoiseTicks : 0)), vel: Math.round(m.vel), cur: m.current };
    // IMU: robot orientation quaternion (robot frame = FTC frame) with drift about world Z
    this.drift += (N.imuDriftDegPerMin / 60) * D2R * dt;
    const q0 = r.body.rotation(), dq = qAxis(0, 0, 1, this.drift + g() * N.imuNoiseDeg * D2R);
    const qi = qMul(dq, q0), wv = qRotate(qConj(q0), arr(r.body.angvel()));
    const imu = { qw: qi.w, qx: qi.x, qy: qi.y, qz: qi.z, wx: wv[0], wy: wv[1], wz: wv[2] };
    const imuCfg = (r.cfg.sensors || []).find(s => s.type === 'imu') || {};
    out.imu.imu = { ...imu, ...hubMount(imuCfg.hubLogo, imuCfg.hubUsb) };
    out.battery = sim.battery.v; out.totalCurrent = sim.battery.i;
    for (const s of r.cfg.sensors || []) {
      if (s.type === 'imu') { out.imu[s.name] = { ...imu, ...hubMount(s.hubLogo, s.hubUsb) }; continue; }
      if (s.type === 'distance') {
        const w = sensorWorld(r, s), h = this.ray(r, w.pos, w.fwd, s.max ?? 2.0);
        out.distance[s.name] = { d: h ? Math.max(0, h.toi * (1 + g() * N.distNoiseFrac) + g() * N.distNoiseMm / 1000) : -1 };
      } else if (s.type === 'color') {
        const w = sensorWorld(r, s), h = this.ray(r, w.pos, w.fwd, 0.1);
        if (h) {
          const c = surfaceColor(h.col, h.p), I = 0.6 / (1 + (h.toi / 0.03) ** 2) + 0.004;
          const ch = c.map(x => Math.max(0, x * I + g() * N.colorNoise * I));
          out.color[s.name] = { r: ch[0], g: ch[1], b: ch[2], a: (ch[0] + ch[1] + ch[2]) / 3 * 1.3, d: h.toi };
        } else out.color[s.name] = { r: 0.003, g: 0.003, b: 0.004, a: 0.004, d: -1 };
      } else if (s.type === 'touch') {
        if (s.joint && r.links[s.joint]) { const [x] = r.jointState(s.joint); out.touch[s.name] = s.below != null ? x < s.below : x > (s.above ?? 0); }
        else { const w = sensorWorld(r, s), h = this.ray(r, w.pos, w.fwd, s.range ?? 0.008); out.touch[s.name] = !!h; }
      } else if (s.type === 'analog') {
        let v = 0;
        if (s.servo) v = (r.servoPos(s.servo) ?? 0) * 3.3;
        else if (s.joint && r.links[s.joint]) v = Math.max(0, Math.min(3.3, (r.jointState(s.joint)[0] * (s.voltsPerUnit ?? 1)) + (s.offset ?? 0)));
        out.analog[s.name] = { v };
      } else if (s.type === 'pinpoint') {
        const t = r.travel;
        out.pinpoint[s.name] = { f: t.f * 1000 * (1 + g() * N.pinpointNoise), l: t.l * 1000 * (1 + g() * N.pinpointNoise), h: t.h + this.drift * 0.2,
          vf: (t.vf || 0) * 1000, vl: (t.vl || 0) * 1000, wz: t.wz || 0, xo: s.xOffsetMm ?? 0, yo: s.yOffsetMm ?? 0 };
      } else if (s.type === 'webcam') {
        out.cameras[s.name] = {};
        out.apriltag[s.name] = this.tagView(r, s, s.width || 640, s.height || 480, s.fx || 622.001, s.fy || 622.001);
      } else if (s.type === 'limelight') {
        const v = this.tagView(r, s, 640, 480, 621, 625);
        out.limelight[s.name] = { fiducials: v.tags.map(t => this.llFiducial(t, 640, 480, 621, 625)) };
      }
    }
    return out;
  }

  /** world poses of all field AprilTags (they move with the HIVEs) */
  fieldTags() {
    const list = [];
    for (const h of this.sim.field.hives) {
      const q = h.body.rotation(), p = arr(h.body.translation());
      for (const [sign, first] of [[1, h.tags.far], [-1, h.tags.audience]]) {
        const { tags, cluster } = cellTags(sign, first);
        const toW = (pt) => add(p, qRotate(q, pt)), axW = (ax) => ax.map(a => qRotate(q, a));
        const cl = { firstId: first, pos: toW(cluster.pos), axes: axW(cluster.axes), hive: h };
        for (const t of tags) list.push({ id: t.id, pos: toW(t.pos), axes: axW(t.axes), size: t.size, cluster: cl, hive: h });
      }
    }
    return list;
  }

  /** what a pinhole camera at sensor s sees: AprilTags with raw poses (inches, OpenCV frame) + cluster poses */
  tagView(robot, s, W, H, fx, fy) {
    const cam = sensorWorld(robot, s), N = this.sim.noise, g = () => gauss(this.rng);
    const xc = cam.right, yc = scale(cam.up, -1), zc = cam.fwd;
    const toCam = (pt) => { const d = sub(pt, cam.pos); return [dot(d, xc), dot(d, yc), dot(d, zc)]; };
    const rotIn = (axes) => { const R = []; for (const ca of [xc, yc, zc]) for (const ta of axes) R.push(dot(ca, ta)); return R; };
    const tags = [], clusters = {};
    for (const t of this.fieldTags()) {
      const pc = toCam(t.pos);
      if (pc[2] < 0.05) continue;
      const toCamDir = norm(sub(cam.pos, t.pos));
      if (dot(scale(t.axes[2], -1), toCamDir) < Math.cos(70 * D2R)) continue;     // seen too edge-on / from behind
      const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => {
        const wp = add(t.pos, add(scale(t.axes[0], a * t.size / 2), scale(t.axes[1], b * t.size / 2)));
        const c = toCam(wp); return c[2] <= 0.01 ? null : [fx * c[0] / c[2] + W / 2, fy * c[1] / c[2] + H / 2];
      });
      if (corners.some(c => !c || c[0] < 0 || c[0] > W || c[1] < 0 || c[1] > H)) continue;
      const side = Math.hypot(corners[0][0] - corners[1][0], corners[0][1] - corners[1][1]);
      if (side < 10) continue;                                                       // too small to decode
      const dist = Math.hypot(...pc);
      const hit = this.ray(robot, cam.pos, norm(sub(t.pos, cam.pos)), dist - 0.01);
      if (hit && hit.col.parent()?.handle !== t.hive.body.handle) continue;         // occluded
      if (hit && hit.toi < dist - 0.03) continue;
      const k = 1 + dist * dist;
      const np = pc.map(v => v + g() * N.tagPosNoise * k);
      const R = rotIn(t.axes);
      const center = [fx * pc[0] / pc[2] + W / 2, fy * pc[1] / pc[2] + H / 2];
      tags.push({ id: t.id, x: np[0] / IN, y: np[1] / IN, z: np[2] / IN, R, cx: center[0], cy: center[1], corners, margin: Math.max(5, 80 - dist * 15), _cl: t.cluster, area: polyArea(corners) });
      if (!clusters[t.cluster.firstId]) {
        const cp = toCam(t.cluster.pos).map(v => v + g() * N.tagPosNoise * k * 0.6);
        clusters[t.cluster.firstId] = { x: cp[0] / IN, y: cp[1] / IN, z: cp[2] / IN, R: rotIn(t.cluster.axes) };
      }
    }
    const view = { tags: tags.map(({ _cl, area, ...rest }) => rest), clusters };
    Object.defineProperty(view, 'raw', { value: tags, enumerable: false });
    return view;
  }

  llFiducial(t, W, H, fx, fy) {
    const xm = t.x * IN, ym = t.y * IN, zm = t.z * IN;
    return { id: t.id, tx: Math.atan2(xm, zm) / D2R, ty: Math.atan2(-ym, zm) / D2R, ta: polyArea(t.corners) / (W * H) * 100,
      txp: t.cx, typ: t.cy, px: xm, py: ym, pz: zm, yaw: 0, pitch: 0, roll: 0 };
  }
}

function polyArea(c) { let a = 0; for (let i = 0; i < c.length; i++) { const j = (i + 1) % c.length; a += c[i][0] * c[j][1] - c[j][0] * c[i][1]; } return Math.abs(a) / 2; }

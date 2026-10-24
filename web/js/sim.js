// Simulation core: Rapier world + BIOBUZZ field + robot + game pieces. No rendering here (used headless for batch runs).
import { buildFieldPhysics, stepHives, initialBalls, GROUP, groups, POLLEN_R, NECTAR_R, POLLEN_MASS, NECTAR_MASS, ZONES, IN, FIELD_HALF } from './field.js';
import { Robot } from './robot.js';
import { Battery, MOTORS } from './motors.js';
import { harness, defaultModel } from './wiring.js';
import { SensorSuite, DEFAULT_NOISE } from './sensors.js';
import { Scorer } from './scoring.js';

export const TICK = 0.01;          // control period = one OpMode sync (100 Hz)
export const SUBSTEPS = 4;         // physics at 400 Hz

/** small deterministic RNG so randomized runs can be repeated */
export function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** robot extent behind its origin (local -Y), from colliders, wheels and links */
export function robotExtents(cfg) {
  const boxes = [];
  const ch = cfg.chassis;
  for (const c of ch.colliders || [{ c: [0, 0, ch.clearance + ch.size[2] / 2], h: ch.size.map(x => x / 2) }]) boxes.push(c);
  for (const w of cfg.wheels || []) boxes.push({ c: w.pos, h: [(w.width || 0.04) / 2, w.radius, w.radius] });
  for (const j of cfg.joints || []) for (const b of j.colliders || [{ c: j.box?.c || j.anchor, h: j.box?.h || [0.02, 0.02, 0.02] }]) boxes.push(b);
  const e = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  for (const b of boxes) {
    e.x0 = Math.min(e.x0, b.c[0] - b.h[0]); e.x1 = Math.max(e.x1, b.c[0] + b.h[0]);
    e.y0 = Math.min(e.y0, b.c[1] - b.h[1]); e.y1 = Math.max(e.y1, b.c[1] + b.h[1]);
    e.z0 = Math.min(e.z0, b.c[2] - b.h[2]); e.z1 = Math.max(e.z1, b.c[2] + b.h[2]);
  }
  return e;
}
/** start poses given as {x, wall:'red'|'blue', heading}: back of the robot touching that wall */
export function placeAgainstWall(cfg, pose) {
  if (!pose.wall) return pose;
  const e = robotExtents(cfg), gap = 0.003;
  const y = pose.wall === 'red' ? FIELD_HALF + e.y0 - gap : -FIELD_HALF - e.y0 + gap;
  return { ...pose, y };
}

export class Simulation {
  /**
   * opts: { robotCfg, pose:{x,y,heading}, alliance:'red'|'blue', params:{muScale, massScale, effScale, ballFriction},
   *         noise: {...DEFAULT_NOISE}, seed, battery: volts, preload: 4 }
   */
  constructor(R, opts) {
    this.R = R; this.opts = opts;
    this.rng = mulberry32(opts.seed ?? 12345);
    this.noise = { ...DEFAULT_NOISE, ...(opts.noise || {}) };
    this.alliance = opts.alliance || 'red';
    this.world = new R.World({ x: 0, y: 0, z: -9.81 });
    this.world.timestep = TICK / SUBSTEPS;
    this.world.integrationParameters.maxCcdSubsteps = 2;
    this.field = buildFieldPhysics(R, this.world);
    this.t = 0;
    this.battery = new Battery(opts.battery ?? 13.0);
    this.balls = [];
    for (const b of initialBalls()) this.addBall(b.type, b.color, b.pos);
    this.robot = new Robot(R, this.world, opts.robotCfg, placeAgainstWall(opts.robotCfg, opts.pose), opts.params || {});
    this.robot.alliance = this.alliance;
    for (const id of Object.keys(opts.robotCfg.wiring?.swapped || {})) if (this.robot.motors[id]) this.robot.motors[id].swapped = true;   // leads swapped at the hub
    // other robots on the field (alliance partner / opponent), driven from gamepad2 by the UI
    this.others = (opts.others || []).map(o => Object.assign(new Robot(R, this.world, o.cfg, placeAgainstWall(o.cfg, o.pose), opts.params || {}), { alliance: o.alliance }));
    this.sensors = new SensorSuite(this);
    this.scorer = new Scorer(this);
    this.snapQueue = []; this.cmdQueue = [];
    this.hp = { red: 5, blue: 5, allowed: { red: 0, blue: 0 }, auto: true };
    this.lastTips = this.field.hives.map(h => h.tips.length);
    // preloaded POLLEN in the robot (4 per robot, section 10.3.4)
    for (const rb of [this.robot, ...this.others]) {
      const store = rb.holders.find(h => h.capacity >= 4) || rb.holders[0];
      const n = opts.preload ?? 4;
      if (store) for (let i = 0; i < n; i++) {
        const p = rb.linkToWorld(store.link, store.slots?.[i] || store.zone.c);
        const ball = this.addBall('pollen', 'yellow', p);
        this.grab(ball, store, rb); store.balls.push(ball);
      }
    }
    this.ctx = { balls: this.balls, grab: (b, h, r) => this.grab(b, h, r), release: (b, v, p) => this.release(b, v, p) };
  }

  addBall(type, color, pos) {
    const R = this.R, r = type === 'pollen' ? POLLEN_R : NECTAR_R, mass = type === 'pollen' ? POLLEN_MASS : NECTAR_MASS;
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...pos).setLinearDamping(0.15).setAngularDamping(0.6).setCcdEnabled(true));
    const vol = 4 / 3 * Math.PI * r ** 3;
    const col = this.world.createCollider(R.ColliderDesc.ball(r).setDensity(mass / vol).setFriction(this.opts.params?.ballFriction ?? 0.5).setRestitution(0.45)
      .setCollisionGroups(groups(GROUP.BALL, 0xffff & ~GROUP.HELD)), body);
    col.userData = { kind: 'ball', color };
    const ball = { body, col, type, color, r, mass, held: false, id: this.balls.length };
    this.balls.push(ball);
    return ball;
  }
  grab(ball, holder, robot) {
    ball.held = holder.id;
    ball.body.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
    ball.col.setCollisionGroups(groups(GROUP.HELD, 0));
  }
  release(ball, vel, pos) {
    ball.held = false;
    ball.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    ball.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
    ball.body.setLinvel({ x: vel[0], y: vel[1], z: vel[2] }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.col.setCollisionGroups(groups(GROUP.BALL, 0xffff & ~GROUP.HELD));
  }

  /** code name -> physical device. With a wired robot this goes through the Driver Hub configuration and the hub ports
   *  (wiring.js); otherwise it is the robot's own names plus any aliases from the name check. */
  get codeNames() {
    if (this.harnessCache !== undefined) return this.harnessCache;
    const h = harness(this.robot.cfg);
    return (this.harnessCache = h ? { strict: true, entries: h.entries } : { strict: false, entries: Object.entries(this.robot.cfg.aliases || {}).map(([name, physical]) => ({ name, physical })) });
  }
  /** sensor snapshot as seen by the OpMode (delayed if configured) */
  readSensors() {
    const snap = this.sensors.snapshot(TICK), H = this.codeNames;
    for (const cat of Object.values(snap)) {
      if (!cat || typeof cat !== 'object') continue;
      const orig = { ...cat };                                     // two names may swap devices: read from the untouched copy
      for (const e of H.entries) if (e.physical != null && e.physical in orig) cat[e.name] = orig[e.physical];
    }
    for (const e of H.entries) if (e.kind === 'motor' && e.physical == null) snap.motors[e.name] = { pos: 0, vel: 0, cur: 0 };   // empty port: encoder reads 0
    const d = this.noise.sensorDelayMs / 1000;
    if (d <= 0) return snap;
    this.snapQueue.push({ t: this.t, snap });
    while (this.snapQueue.length > 1 && this.snapQueue[1].t <= this.t - d) this.snapQueue.shift();
    return this.snapQueue[0].snap;
  }
  /** commands from the OpMode use code names: send each to the device on that name's port (nothing, if the port is empty) */
  setCodeCommands(out) {
    const H = this.codeNames;
    if (out && (H.strict || H.entries.length)) {
      const map = Object.fromEntries(H.entries.map(e => [e.name, e.physical]));
      const t = { ...out };
      for (const k of ['motors', 'servos', 'crservos']) {
        if (!out[k]) continue;
        t[k] = H.strict ? {} : { ...out[k] };
        for (const [n, c] of Object.entries(out[k])) { if (!(n in map)) continue; if (!H.strict) delete t[k][n]; if (map[n] != null) t[k][map[n]] = c; }
      }
      out = t;
    }
    this.setCommands(out);
  }
  /** actuator commands addressed to physical devices (delayed if configured) */
  setCommands(out) {
    const d = this.noise.actuatorDelayMs / 1000;
    if (d <= 0) { this.robot.applyCommands(out); return; }
    this.cmdQueue.push({ t: this.t, out });
    while (this.cmdQueue.length && this.cmdQueue[0].t <= this.t - d) this.robot.applyCommands(this.cmdQueue.shift().out);
  }

  /** advance one control tick (TICK seconds) */
  tick() {
    const dt = TICK / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      stepHives(this.field, this.t, dt);
      const amps = this.robot.step(dt, this.battery.v, this.ctx);
      for (const o of this.others) o.step(dt, 12.8, this.ctx);
      this.battery.update(amps + 0.6, dt);       // + Control Hub / sensors
      this.world.step();
      this.t += dt;
    }
    // balls that leave the field are put back near the center line (section 10.8.2)
    for (const b of this.balls) {
      if (b.held) continue;
      const p = b.body.translation();
      if (p.z < -0.5 || Math.abs(p.x) > 2.2 || Math.abs(p.y) > 2.2) { b.body.setTranslation({ x: 0, y: 0.6 * (this.rng() - 0.5), z: 0.1 }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    }
    // human player: one NECTAR per HIVE TIP (all remaining with 60 s left), dropped in the LOADING ZONE
    this.field.hives.forEach((h, i) => {
      const n = h.tips.length - this.lastTips[i];
      if (n > 0) { this.hp.allowed[h.alliance] += n; this.lastTips[i] = h.tips.length; }
    });
    if (this.hp.auto) for (const a of ['red', 'blue']) if (this.hp.allowed[a] > 0 && this.hp[a] > 0) this.humanPlayerNectar(a);
  }
  humanPlayerNectar(a) {
    if (this.hp[a] <= 0) return false;
    const z = ZONES.loading[a];
    this.addBall('nectar', a, [(z[0] + z[1]) / 2 + (this.rng() - 0.5) * 0.2, a === 'red' ? z[3] - NECTAR_R - IN : z[2] + NECTAR_R + IN, NECTAR_R + 0.01]);
    this.hp[a]--; this.hp.allowed[a] = Math.max(0, this.hp.allowed[a] - 1);
    return true;
  }

  /** hardwareMap device list for the OpMode bridge */
  devices(withAliases = true) {
    const cfg = this.robot.cfg, d = [];
    const motorInfo = (n, model) => { const m = this.robot.motors[n].m; return { name: n, type: 'motor', model, ticksPerRev: m.ticks, maxRPM: m.freeRPM, gearing: m.gearing }; };
    const H = this.codeNames;
    if (H.strict) {                                    // exactly what Configure Robot lists, whatever is plugged in behind it
      for (const e of H.entries) {
        if (e.kind === 'motor') {
          if (e.physical && this.robot.motors[e.physical]) { const x = motorInfo(e.physical, this.robot.motors[e.physical].modelId); d.push({ ...x, name: e.name }); }
          else { const m = MOTORS[defaultModel(cfg.hubConfig[e.key]?.type)] || MOTORS['gobilda-312']; d.push({ name: e.name, type: 'motor', ticksPerRev: m.ticks, maxRPM: m.freeRPM, gearing: m.gearing }); }
        } else if (e.kind !== 'unknown') d.push({ name: e.name, type: e.kind });
      }
      return d;
    }
    for (const w of cfg.wheels || []) d.push(motorInfo(w.motor, w.model));
    for (const m of cfg.motors || []) d.push(motorInfo(m.name, m.model));
    for (const s of cfg.servos || []) d.push({ name: s.name, type: s.kind === 'crservo' ? 'crservo' : 'servo' });
    for (const s of cfg.sensors || []) d.push({ name: s.name, type: s.type });
    if (withAliases) for (const { name: a, physical: r } of H.entries) { const x = d.find(e => e.name === r); if (x && !d.some(e => e.name === a)) d.push({ ...x, name: a }); }
    return d;
  }

  destroy() { this.world.free(); }
}

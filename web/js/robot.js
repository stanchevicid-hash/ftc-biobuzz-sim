// Robot physics built from a robot config (see robots/demo.js for the format).
// Robot frame (FTC convention): +X right, +Y forward, +Z up, origin on the floor under the chassis center.
import { GROUP, groups, qRotate, qMul, qConj, qAxis, IN } from './field.js';
import { Motor, Servo, MOTORS, SERVOS } from './motors.js';

const G = 9.81;
export const DEFAULT_MU_ROLLER = 0.06;   // roller rolling resistance
export const BRAKE_HOLD_N = 5;          // a braked wheel resists ~5 N before it back-drives (robot ~20 N): defense can push it
export const DEFAULT_MU_SCRUB = 0.12;    // mecanum contact patch scrubs when the chassis moves sideways: strafe ~80-90% of forward
const v3 = (a) => ({ x: a[0], y: a[1], z: a[2] });
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const arr = (o) => [o.x, o.y, o.z];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Robot {
  /**
   * @param R rapier module, world, cfg robot config, pose {x,y,heading deg}, params physics knobs (friction scale etc.)
   */
  constructor(R, world, cfg, pose, params = {}) {
    this.R = R; this.world = world; this.cfg = cfg; this.params = { muScale: 1, massScale: 1, effScale: 1, ...params };
    this.motors = {}; this.servos = {}; this.links = {}; this.wheels = []; this.holders = []; this.launchers = [];
    const ch = cfg.chassis;
    const yaw = (pose.heading - 90) * Math.PI / 180;
    this.q0 = qAxis(0, 0, 1, yaw);
    this.origin = [pose.x, pose.y, 0.001];
    const mass = ch.mass * this.params.massScale;
    const [sx, sy, sz] = ch.size;
    const I = [mass * (sy * sy + sz * sz) / 12, mass * (sx * sx + sz * sz) / 12, mass * (sx * sx + sy * sy) / 12];
    this.chassisMass = mass; this.chassisI = I;
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...this.origin).setRotation(this.q0).setCanSleep(false)
      .setAdditionalMassProperties(mass, v3(ch.com), v3(I), { w: 1, x: 0, y: 0, z: 0 }).setLinearDamping(0.05).setAngularDamping(0.05));
    const colliders = ch.colliders || [{ c: [0, 0, ch.clearance + sz / 2], h: [sx / 2, sy / 2, sz / 2] }];
    for (const c of colliders) {
      const col = world.createCollider(R.ColliderDesc.cuboid(...c.h).setTranslation(...c.c).setDensity(0).setFriction(0.3).setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.ROBOT, GROUP.FIELD | GROUP.BALL | GROUP.ROBOT)), this.body);   // chassis also hit other robots
      col.userData = { kind: 'robot' };
    }
    this.ownBodies = new Set([this.body.handle]);

    // motors (drivetrain motors are declared on the wheels)
    for (const w of cfg.wheels || []) this.motors[w.motor] = new Motor(w.motor, w.model, { efficiency: (w.efficiency ?? 0.9) * this.params.effScale,
      freeScale: this.params.wheelFreeScale ?? w.freeScale, coulomb: this.params.coulomb });
    for (const m of cfg.motors || []) this.motors[m.name] = new Motor(m.name, m.model, { efficiency: (m.efficiency ?? 0.85) * this.params.effScale });
    for (const s of cfg.servos || []) this.servos[s.name] = Object.assign(new Servo(s.name, s.model), { cfg: s });
    // wheels
    for (const w of cfg.wheels || []) {
      const J = 0.5 * (w.mass ?? 0.2) * w.radius * w.radius;
      const fwd = w.forward ? [w.forward[0], w.forward[1], 0] : [0, 1, 0];
      // mecanum: the wheel can only push along d = fwd rotated by -roller*45 deg (fwd (0,1), roller +1 -> d = (0.707, 0.707))
      let d = fwd;
      if (w.type === 'mecanum') { const phi = -(w.roller ?? 1) * Math.PI / 4; d = [fwd[0] * Math.cos(phi) - fwd[1] * Math.sin(phi), fwd[0] * Math.sin(phi) + fwd[1] * Math.cos(phi), 0]; }
      const lat = [-d[1], d[0], 0];
      this.wheels.push({ ...w, radius: w.radius * (this.params.wheelRadiusScale ?? 1), muRoller: this.params.muRoller ?? w.muRoller, muScrub: this.params.muScrub ?? w.muScrub,
        fwd, d, lat, J, omega: 0, angle: 0, N: 0, contact: false, compression: 0, motorObj: this.motors[w.motor] });
    }
    // links (mechanisms) on joints
    for (const j of cfg.joints || []) this.addJoint(j);
    for (const h of cfg.holders || []) this.holders.push({ ...h, balls: [], cooldown: 0 });
    for (const l of cfg.launchers || []) this.launchers.push({ ...l, cooldown: 0, shots: 0 });
    // static load per wheel (N), recomputed from suspension each step
    this.suspK = mass * G / Math.max(1, this.wheels.length) / 0.002;
    this.suspC = 2 * Math.sqrt(this.suspK * mass / Math.max(1, this.wheels.length)) * 0.7;
    this.travel = { f: 0, l: 0, h: 0, lastYaw: null };
  }

  addJoint(j) {
    const R = this.R, world = this.world;
    const parent = j.parent && j.parent !== 'chassis' ? this.links[j.parent].body : this.body;
    const mass = (j.mass ?? 0.3) * this.params.massScale;
    const c = j.box?.c || j.anchor, h = j.box?.h || [0.02, 0.02, 0.02];
    const I = [mass * (h[1] * h[1] + h[2] * h[2]) / 3, mass * (h[0] * h[0] + h[2] * h[2]) / 3, mass * (h[0] * h[0] + h[1] * h[1]) / 3];
    const pRot = this.body.rotation(), pPos = this.body.translation();
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pPos.x, pPos.y, pPos.z).setRotation(pRot).setCanSleep(false)
      .setAdditionalMassProperties(mass, v3(c), v3(I), { w: 1, x: 0, y: 0, z: 0 }).setAngularDamping(0.2).setLinearDamping(0.05));
    for (const b of j.colliders || [{ c, h }]) {
      const col = world.createCollider(R.ColliderDesc.cuboid(...b.h).setTranslation(...b.c).setDensity(0).setFriction(0.5).setRestitution(0.1)
        .setCollisionGroups(groups(GROUP.LINK, j.ghost ? GROUP.FIELD : GROUP.FIELD | GROUP.BALL)), body);
      col.userData = { kind: 'robot', link: j.id };
    }
    const axis = j.axis.map(x => x / Math.hypot(...j.axis));
    let jd;
    if (j.type === 'prismatic') jd = R.JointData.prismatic(v3(j.anchor), v3(j.anchor), v3(axis));
    else jd = R.JointData.revolute(v3(j.anchor), v3(j.anchor), v3(axis));
    const joint = world.createImpulseJoint(jd, parent, body, true);
    if (j.limits) joint.setLimits(j.limits[0], j.limits[1]);
    // inertia about the joint axis (box about its center + parallel axis), used for implicit actuator updates
    const r = sub(c, j.anchor), perp = sub(r, scale(axis, dot(r, axis)));
    const Iaxis = j.type === 'prismatic' ? mass : I[0] * axis[0] ** 2 + I[1] * axis[1] ** 2 + I[2] * axis[2] ** 2 + mass * dot(perp, perp);
    this.links[j.id] = { cfg: j, body, joint, axis, parentBody: parent, Iaxis: Math.max(Iaxis, 1e-4), mass };
    this.ownBodies.add(body.handle);
    if ((j.initial ?? 0) !== 0) this.setJointPosition(j.id, j.initial);
  }

  /** teleport a joint to a position (used for the starting configuration) */
  setJointPosition(id, x) {
    const L = this.links[id], j = L.cfg, pr = L.parentBody.rotation(), pp = arr(L.parentBody.translation());
    const axW = qRotate(pr, L.axis);
    if (j.type === 'prismatic') {
      const p = add(pp, scale(axW, x)); L.body.setTranslation(v3(p), true); L.body.setRotation(pr, true);
    } else {
      const dq = qAxis(...axW, x), anchorW = add(pp, qRotate(pr, j.anchor));
      const off = sub(pp, anchorW), p = add(anchorW, qRotate(dq, off));
      L.body.setTranslation(v3(p), true); L.body.setRotation(qMul(dq, pr), true);
    }
  }

  /** joint coordinate and velocity (rad or m) */
  jointState(id) {
    const L = this.links[id], pb = L.parentBody, b = L.body;
    const pr = pb.rotation(), axW = qRotate(pr, L.axis);
    if (L.cfg.type === 'prismatic') {
      const d = sub(arr(b.translation()), arr(pb.translation()));
      const dv = sub(arr(b.linvel()), arr(pb.linvel()));
      return [dot(qRotate(qConj(pr), d), L.axis), dot(dv, axW)];
    }
    const rel = qMul(qConj(pr), b.rotation());
    const s = rel.x * L.axis[0] + rel.y * L.axis[1] + rel.z * L.axis[2];
    let a = 2 * Math.atan2(s, rel.w); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
    const w = dot(sub(arr(b.angvel()), arr(pb.angvel())), axW);
    return [a, w];
  }

  /** apply an impulse along/about a joint axis to the link and the opposite to its parent */
  jointImpulse(id, imp) {
    const L = this.links[id], axW = qRotate(L.parentBody.rotation(), L.axis);
    if (L.cfg.type === 'prismatic') { L.body.applyImpulse(v3(scale(axW, imp)), true); L.parentBody.applyImpulse(v3(scale(axW, -imp)), true); }
    else { L.body.applyTorqueImpulse(v3(scale(axW, imp)), true); L.parentBody.applyTorqueImpulse(v3(scale(axW, -imp)), true); }
  }

  /** commands from the OpMode bridge: {motors:{...}, servos:{...}, crservos:{...}} */
  applyCommands(out) {
    const mo = out?.motors || {};
    for (const [n, m] of Object.entries(this.motors)) m.cmd = mo[n] || { mode: 'power', p: 0, brake: m.cmd.brake ?? true };
    const so = out?.servos || {}, cr = out?.crservos || {};
    for (const [n, s] of Object.entries(this.servos)) {
      if (s.cfg.kind === 'crservo') s.crPower = cr[n]?.p ?? 0;
      else if (n in so) s.setPosition(so[n].pos);
    }
  }

  /** servo commanded position 0..1 (null when unpowered) */
  servoPos(name) { const s = this.servos[name]; return s && s.target != null ? s.target / (s.s.range * Math.PI / 180) : null; }
  /** effective drive value of a device for intake/feed rules */
  deviceValue(name) {
    if (this.motors[name]) return this.motors[name].duty;
    const s = this.servos[name]; if (!s) return 0;
    return s.cfg.kind === 'crservo' ? s.crPower : (this.servoPos(name) ?? 0);
  }

  step(dt, vBatt, ctx) {
    const b = this.body, q = b.rotation(), p = arr(b.translation());
    const up = qRotate(q, [0, 0, 1]);
    let totalCurrent = 0;
    // ---- motors: hub control
    for (const m of Object.values(this.motors)) { m.control(dt, vBatt); }
    // ---- wheels: suspension (raycast) + drive torque (implicit) + traction impulses (friction limited)
    const com = add(p, qRotate(q, this.cfg.chassis.com));
    for (const w of this.wheels) {
      const cW = add(p, qRotate(q, w.pos));
      const ray = new this.R.Ray(v3(cW), v3(scale(up, -1)));
      const hit = this.world.castRay(ray, w.radius + 0.02, true, undefined, groups(0xffff, GROUP.FIELD), undefined, undefined,
        (col) => col.userData?.kind === 'floor' || col.userData?.kind === 'field' || col.userData?.kind === 'flower');
      w.contact = !!hit;
      if (hit) {
        const comp = w.radius - hit.toi;
        const contactV = this.pointVel(add(cW, scale(up, -hit.toi)));
        const vz = dot(contactV, up);
        let F = this.suspK * Math.max(0, comp) - this.suspC * vz;
        F = Math.max(0, F);
        w.N = F; w.compression = comp;
        b.applyImpulseAtPoint(v3([0, 0, F * dt]), v3(cW), true);   // ground reaction is vertical (flat tiles)
      } else { w.N = 0; }
      // drive: implicit DC motor update on the wheel spin
      const m = w.motorObj, ratio = w.ratio ?? 1, dir = w.motorDir ?? 1;
      m.omega = w.omega * ratio * dir;
      const Jw = w.J + m.reflectedJ * ratio * ratio;
      const tau0 = m.torque(vBatt);                         // at current omega
      const ws = m.wFree, Ts = m.m.stallTorque * m.eff;
      const damp = (m.duty === 0 && !m.cmd.brake) ? 0 : Ts / ws; // d(tau)/d(omega) magnitude at the motor
      const c = damp * ratio * ratio;
      const tauW = (tau0 + damp * m.omega) * ratio * dir;    // torque without the back-EMF part, at the wheel
      w.omega = (w.omega * Jw + dt * tauW) / (Jw + dt * c);
      // gearbox static friction: a stopped, unpowered wheel stays put unless pushed harder than this (no slow creep)
      const stick = m.m.stallTorque * m.eff * Math.max(0.03, 3 * m.coulomb) * ratio * dt / Jw;
      if (m.duty === 0) w.omega = Math.abs(w.omega) <= stick ? 0 : w.omega - Math.sign(w.omega) * stick;
      w.Jeff = Jw;
      totalCurrent += m.current;
    }
    // 4 springs on a rigid frame are statically indeterminate: remove the diagonal "warp" from the loads used for traction
    // (a real chassis twists a little and shares the load evenly between the diagonals)
    if (this.wheels.length === 4 && this.wheels.every(w => w.contact)) {
      const diag = (w) => Math.sign(w.pos[0] * w.pos[1]);
      const warp = this.wheels.reduce((s, w) => s + diag(w) * w.N, 0) / 4;
      for (const w of this.wheels) w.N = Math.max(0, w.N - diag(w) * warp);
    }
    // traction: a few PGS iterations, impulse along the roller-normal direction d and the free direction lat
    const fric = this.params.muScale;
    for (const w of this.wheels) {
      w.accD = 0; w.accL = 0; w.accX = 0;
      // static friction anchor: a stopped, unpowered wheel holds its contact point (removes slow numerical creep)
      if (w.contact && w.omega === 0 && w.motorObj.duty === 0) { if (!w.anchor) w.anchor = add(p, qRotate(q, [w.pos[0], w.pos[1], w.pos[2] - w.radius])); }
      else w.anchor = null;
    }
    for (let it = 0; it < 6; it++) {
      for (const w of this.wheels) {
        if (!w.contact || w.N <= 0) continue;
        const cP = add(p, qRotate(q, [w.pos[0], w.pos[1], w.pos[2] - w.radius]));
        const dW = qRotate(q, w.d), lW = qRotate(q, w.lat), fW = qRotate(q, w.fwd);
        const vP = this.pointVel(cP);
        const c = dot(fW, dW) * w.radius;
        let sD = dot(vP, dW) - w.omega * c;
        if (w.anchor) sD += 0.2 * dot(sub(cP, w.anchor), dW) / dt;
        const r = sub(cP, com);
        const kD = this.invMassAlong(r, dW) + c * c / w.Jeff;
        const maxD = (w.mu ?? 1.0) * fric * w.N * dt;
        let lam = -sD / kD, acc = clamp(w.accD + lam, -maxD, maxD); lam = acc - w.accD; w.accD = acc;
        b.applyImpulseAtPoint(v3(scale(dW, lam)), v3(cP), true);
        w.omega -= lam * c / w.Jeff;
        // free (roller) direction: rolling resistance only for mecanum/omni, full grip for traction wheels
        const muL = w.type === 'traction' ? (w.mu ?? 1.0) * fric : (w.muRoller ?? DEFAULT_MU_ROLLER);
        const sL = dot(this.pointVel(cP), lW);
        const kL = this.invMassAlong(r, lW);
        const maxL = muL * w.N * dt;
        let lamL = -sL / kL, accL = clamp(w.accL + lamL, -maxL, maxL); lamL = accL - w.accL; w.accL = accL;
        b.applyImpulseAtPoint(v3(scale(lW, lamL)), v3(cP), true);
        // mecanum scrub: resists sideways (robot X) motion of the contact patch only
        if (w.type === 'mecanum') {
          const xW = qRotate(q, [1, 0, 0]), sX = dot(this.pointVel(cP), xW), kX = this.invMassAlong(r, xW);
          const maxX = (w.muScrub ?? DEFAULT_MU_SCRUB) * fric * w.N * dt;
          let lamX = -sX / kX, accX = clamp((w.accX || 0) + lamX, -maxX, maxX); lamX = accX - (w.accX || 0); w.accX = accX;
          b.applyImpulseAtPoint(v3(scale(xW, lamX)), v3(cP), true);
        }
      }
    }
    // the anchor only holds what the gearbox static friction can hold; pushed harder, the braked wheel back-drives
    for (const w of this.wheels) {
      if (!w.anchor) continue;
      const m = w.motorObj, hold = Math.max(BRAKE_HOLD_N, m.m.stallTorque * m.eff * Math.max(0.03, 3 * m.coulomb) * (w.ratio ?? 1) / w.radius);
      // sustained push (not a one-step numerical spike) releases it
      w.over = Math.abs(w.accD) >= Math.min(hold, (w.mu ?? 1.0) * fric * w.N) * dt ? (w.over || 0) + 1 : 0;
      if (w.over > 20) { w.anchor = null; w.over = 0; }
    }
    for (const w of this.wheels) { w.angle += w.omega * dt; const m = w.motorObj; m.omega = w.omega * (w.ratio ?? 1) * (w.motorDir ?? 1); m.angle = w.angle * (w.ratio ?? 1) * (w.motorDir ?? 1); }

    // ---- other motors: joints and spinners
    for (const mc of this.cfg.motors || []) {
      const m = this.motors[mc.name], load = mc.load || { type: 'none' };
      const ratio = load.ratio ?? 1, dir = load.dir ?? 1;
      if (load.type === 'joint' && this.links[load.joint]) {
        const L = this.links[load.joint], [x, v] = this.jointState(load.joint);
        // prismatic: ratio = 1/spool radius (motor rad per meter)
        m.omega = v * ratio * dir; m.angle = (x - (L.cfg.initial ?? 0)) * ratio * dir;
        const Ts = m.m.stallTorque * m.eff, damp = (m.duty === 0 && !m.cmd.brake) ? 0 : Ts / m.wFree;
        const tau0 = m.torque(vBatt), tauNoEmf = (tau0 + damp * m.omega) * ratio * dir;
        const I = L.Iaxis + m.reflectedJ * ratio * ratio, c = damp * ratio * ratio;
        const vNew = (v * I + dt * tauNoEmf) / (I + dt * c);
        this.jointImpulse(load.joint, L.Iaxis * (vNew - v));
      } else if (load.type === 'spinner') {
        load.omega = load.omega ?? 0;
        m.omega = load.omega * ratio * dir;
        const Ts = m.m.stallTorque * m.eff, damp = (m.duty === 0 && !m.cmd.brake) ? 0 : Ts / m.wFree;
        const tau0 = m.torque(vBatt), tauNoEmf = (tau0 + damp * m.omega) * ratio * dir;
        const I = (load.inertia ?? 1e-4) + m.reflectedJ * ratio * ratio, c = damp * ratio * ratio + 1e-5;
        load.omega = (load.omega * I + dt * tauNoEmf) / (I + dt * c);
        load.angle = (load.angle ?? 0) + load.omega * dt;
        m.omega = load.omega * ratio * dir; m.angle = load.angle * ratio * dir;
      } else {
        // unloaded motor: only its own rotor
        const I = m.reflectedJ + 1e-5, Ts = m.m.stallTorque * m.eff, damp = Ts / m.wFree;
        const tau0 = m.torque(vBatt);
        m.omega = (m.omega * I + dt * (tau0 + damp * m.omega)) / (I + dt * damp);
        m.angle += m.omega * dt;
      }
      totalCurrent += m.current;
    }
    // ---- servos on joints: rate-limited, torque-limited position control (implicit velocity target)
    for (const s of Object.values(this.servos)) {
      const jid = s.cfg.joint; if (!jid || !this.links[jid]) continue;
      const L = this.links[jid], [x, v] = this.jointState(jid);
      const k = s.cfg.dir ?? 1, zero = (s.cfg.zero ?? 0);
      let wDes;
      // position 0..1 sweeps "travel" (rad or m) of the joint; default: the servo's full range, direct drive
      const range = s.s.range * Math.PI / 180, travel = s.cfg.travel ?? (L.cfg.type === 'prismatic' ? 0.1 : range);
      if (s.cfg.kind === 'crservo') wDes = s.crPower * s.maxSpeed * k * travel / range;
      else if (s.target == null) { s.dist = 0; s.vExpect = null; continue; }   // unpowered servo: limp
      else {
        const tgt = zero + k * (s.target / range) * travel, maxRate = s.maxSpeed * travel / range;
        wDes = clamp((tgt - x) * 25, -maxRate, maxRate);
      }
      // gravity and loads act after this impulse; the estimate of what they took last step is added back,
      // like the servo's own position loop would. Output torque (or force) is the servo's, geared by range/travel.
      if (s.vExpect != null) s.dist = 0.7 * (s.dist ?? 0) + 0.3 * (s.vExpect - v);
      const maxImp = s.s.torque * (range / travel) * dt;
      const imp = clamp(L.Iaxis * (wDes - v + (s.dist ?? 0)), -maxImp, maxImp);
      s.vExpect = v + imp / L.Iaxis;
      this.jointImpulse(jid, imp);
      totalCurrent += Math.min(2, Math.abs(wDes - v) * 0.3);
    }
    // ---- odometry truth (robot-frame travel, for Pinpoint)
    const vel = arr(b.linvel()), wv = arr(b.angvel());
    const fwdW = qRotate(q, [0, 1, 0]), rightW = qRotate(q, [1, 0, 0]);
    const vf = dot(vel, fwdW), vl = -dot(vel, rightW);
    this.travel.f += vf * dt; this.travel.l += vl * dt;
    const yaw = this.yaw();
    if (this.travel.lastYaw !== null) { let d = yaw - this.travel.lastYaw; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; this.travel.h += d; }
    this.travel.lastYaw = yaw; this.travel.vf = vf; this.travel.vl = vl; this.travel.wz = wv[2];
    this.stepGamePieces(dt, ctx);
    return totalCurrent;
  }

  pointVel(pt) {
    const b = this.body, v = arr(b.linvel()), w = arr(b.angvel()), c = add(arr(b.translation()), qRotate(b.rotation(), this.cfg.chassis.com));
    return add(v, cross(w, sub(pt, c)));
  }
  invMassAlong(r, d) {
    // 1/m + (r x d) . I^-1 (r x d), inertia in world frame from the principal moments
    const q = this.body.rotation(), rc = qRotate(qConj(q), cross(r, d));
    const I = this.chassisI;
    return 1 / this.chassisMass + rc[0] * rc[0] / I[0] + rc[1] * rc[1] / I[1] + rc[2] * rc[2] / I[2];
  }
  yaw() { const f = qRotate(this.body.rotation(), [0, 1, 0]); return Math.atan2(f[1], f[0]); }  // heading of robot forward, CCW from field +X
  pose() { const t = this.body.translation(); return { x: t.x, y: t.y, heading: this.yaw() * 180 / Math.PI }; }

  /** transform a point given in the robot frame of a link ('chassis' or joint id) to world */
  linkToWorld(link, pt) {
    const body = link && link !== 'chassis' && this.links[link] ? this.links[link].body : this.body;
    return add(arr(body.translation()), qRotate(body.rotation(), pt));
  }
  linkBody(link) { return link && link !== 'chassis' && this.links[link] ? this.links[link].body : this.body; }

  // ---------------------------------------------------------------- game pieces: holders (intake / claw) and launchers
  stepGamePieces(dt, ctx) {
    if (!ctx?.balls) return;
    for (const h of this.holders) {
      h.cooldown = Math.max(0, h.cooldown - dt);
      const body = this.linkBody(h.link);
      // keep held balls in their slots
      h.balls.forEach((ball, i) => {
        const slot = (h.slots && h.slots[i]) || h.zone.c;
        const wp = this.linkToWorld(h.link, slot);
        ball.body.setNextKinematicTranslation(v3(wp));
      });
      const val = this.deviceValue(h.intake?.device);
      const want = h.intake ? ruleActive(h.intake, val) : false;
      const eject = h.eject ? ruleActive(h.eject, this.deviceValue(h.eject.device)) : false;
      if (want && h.balls.length < (h.capacity ?? 1) && h.cooldown === 0) {
        for (const ball of ctx.balls) {
          if (ball.held || ball.scoredLock) continue;
          if (h.accepts && !h.accepts.includes(ball.type)) continue;
          if (this.inZone(h, arr(ball.body.translation()), ball.r)) {
            ctx.grab(ball, h, this); h.balls.push(ball); h.cooldown = h.intakeDelay ?? 0.12; break;
          }
        }
      }
      if ((eject || (h.release && ruleActive(h.release, this.deviceValue(h.release.device)))) && h.balls.length && h.cooldown === 0) {
        const ball = h.balls.shift();
        const v = this.pointVelOf(body, this.linkToWorld(h.link, h.zone.c));
        const out = h.eject && eject ? qRotate(body.rotation(), h.eject.dirVec || [0, 1, 0]) : [0, 0, 0];
        ctx.release(ball, add(v, scale(out, h.eject?.speed ?? 1.0)), this.linkToWorld(h.link, h.eject && eject ? h.zone.c : (h.slots?.[0] || h.zone.c)));
        h.cooldown = 0.2;
      }
    }
    for (const L of this.launchers) {
      L.cooldown = Math.max(0, L.cooldown - dt);
      const h = this.holders.find(x => x.id === L.holder); if (!h || !h.balls.length || L.cooldown > 0) continue;
      if (!ruleActive(L.feed, this.deviceValue(L.feed.device))) continue;
      const fwCfg = (this.cfg.motors || []).find(m => m.name === L.flywheel);
      const load = fwCfg?.load; if (!load) continue;
      const surf = Math.abs(load.omega ?? 0) * (load.radius ?? 0.048);
      if (surf < (L.minSurfaceSpeed ?? 2)) continue;
      const ball = h.balls.shift();
      let pitch = L.pitchDeg ?? 45;
      if (L.hood) { const sp = this.servoPos(L.hood.device); if (sp != null) pitch = L.hood.min + (L.hood.max - L.hood.min) * sp; }
      const body = this.linkBody(L.link);
      const pr = pitch * Math.PI / 180;
      const dirLocal = [0, Math.cos(pr), Math.sin(pr)];
      const dirW = qRotate(body.rotation(), dirLocal);
      const speed = surf * (L.speedFactor ?? 0.5) * (ball.type === 'nectar' ? (L.nectarFactor ?? 0.9) : 1);
      const exitW = this.linkToWorld(L.link, L.exit);
      ctx.release(ball, add(this.pointVelOf(body, exitW), scale(dirW, speed)), exitW);
      // flywheel loses the momentum given to the ball
      const I = (load.inertia ?? 1e-4) + this.motors[L.flywheel].reflectedJ * (load.ratio ?? 1) ** 2;
      load.omega -= Math.sign(load.omega) * ball.mass * speed * (load.radius ?? 0.048) / I;
      L.cooldown = L.cooldownS ?? 0.25; L.shots++;
    }
  }
  pointVelOf(body, pt) { const v = arr(body.linvel()), w = arr(body.angvel()), c = arr(body.translation()); return add(v, cross(w, sub(pt, c))); }
  inZone(h, wp, r) {
    const body = this.linkBody(h.link), q = body.rotation(), o = arr(body.translation());
    const lp = qRotate(qConj(q), sub(wp, o));
    const c = h.zone.c, e = h.zone.h;
    return Math.abs(lp[0] - c[0]) <= e[0] + r * 0.3 && Math.abs(lp[1] - c[1]) <= e[1] + r * 0.3 && Math.abs(lp[2] - c[2]) <= e[2] + r * 0.3;
  }

  /** world-space axis-aligned bounds of the robot (chassis + links) for size checks and zones */
  footprint() {
    const pts = [];
    const add8 = (body, c, h) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(add(arr(body.translation()), qRotate(body.rotation(), [c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]))); };
    const ch = this.cfg.chassis;
    for (const c of ch.colliders || [{ c: [0, 0, ch.clearance + ch.size[2] / 2], h: ch.size.map(x => x / 2) }]) add8(this.body, c.c, c.h);
    for (const w of this.wheels) add8(this.body, w.pos, [w.width / 2 || 0.02, w.radius, w.radius]);
    for (const L of Object.values(this.links)) for (const b of L.cfg.colliders || [{ c: L.cfg.box?.c || L.cfg.anchor, h: L.cfg.box?.h || [0.02, 0.02, 0.02] }]) add8(L.body, b.c, b.h);
    return pts;
  }

  destroy() {
    for (const L of Object.values(this.links)) this.world.removeRigidBody(L.body);
    this.world.removeRigidBody(this.body);
  }
}

export function ruleActive(rule, value) {
  if (!rule) return false;
  const v = value ?? 0, t = rule.value ?? rule.threshold ?? 0.3;
  switch (rule.op || '>') {
    case '>': return v > t;
    case '<': return v < t;
    case 'abs>': return Math.abs(v) > t;
    default: return false;
  }
}

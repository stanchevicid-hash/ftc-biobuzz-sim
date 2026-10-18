// Motor and servo database (manufacturer datasheets, 12 V nominal) + DC motor model + REV hub closed loop emulation.
// stall torque [N*m] and free speed [rpm] are at the OUTPUT shaft; ticks = encoder counts per output revolution.
const KGCM = 0.0980665;
const yj = (rpm, ratio, ppr, kgcm, sku) => ({ vendor: 'goBILDA', name: `goBILDA 5203 Yellow Jacket ${rpm} RPM (${ratio}:1)`, freeRPM: rpm,
  stallTorque: kgcm * KGCM, stallCurrent: 9.2, freeCurrent: 0.25, ticks: ppr, gearing: ratio, sku, rotorJ: 7e-6 });
export const MOTORS = {
  'gobilda-6000': yj(6000, 1, 28, 1.47, '5203-2402-0001'),
  'gobilda-1620': yj(1620, 3.7, 103.8, 5.4, '5203-2402-0003'),
  'gobilda-1150': yj(1150, 5.2, 145.1, 7.9, '5203-2402-0005'),
  'gobilda-435': yj(435, 13.7, 384.5, 18.7, '5203-2402-0014'),
  'gobilda-312': yj(312, 19.2, 537.7, 24.3, '5203-2402-0019'),
  'gobilda-223': yj(223, 26.9, 751.8, 38.0, '5203-2402-0027'),
  'gobilda-117': yj(117, 50.9, 1425.1, 68.4, '5203-2402-0051'),
  'gobilda-84': yj(84, 71.2, 1993.6, 93.6, '5203-2402-0071'),
  'gobilda-60': yj(60, 99.5, 2786.2, 133.2, '5203-2402-0100'),
  'gobilda-43': yj(43, 139, 3895.9, 185, '5203-2402-0139'),
  'gobilda-30': yj(30, 188, 5281.1, 250, '5203-2402-0188'),
  'rev-hdhex': { vendor: 'REV', name: 'REV HD Hex (bare, 6000 RPM)', freeRPM: 6000, stallTorque: 0.105, stallCurrent: 8.5, freeCurrent: 0.4, ticks: 28, gearing: 1, sku: 'REV-41-1291', rotorJ: 6e-6 },
  'rev-hdhex-20': { vendor: 'REV', name: 'REV HD Hex + UltraPlanetary 20:1', freeRPM: 6000 / 18.88, stallTorque: 0.105 * 18.88 * 0.85, stallCurrent: 8.5, freeCurrent: 0.4, ticks: 28 * 18.88, gearing: 18.88, sku: 'REV-41-1600', rotorJ: 6e-6 },
  'rev-hdhex-40': { vendor: 'REV', name: 'REV HD Hex 40:1 spur', freeRPM: 150, stallTorque: 4.2, stallCurrent: 8.5, freeCurrent: 0.4, ticks: 1120, gearing: 40, sku: 'REV-41-1301', rotorJ: 6e-6 },
  'rev-corehex': { vendor: 'REV', name: 'REV Core Hex (125 RPM)', freeRPM: 125, stallTorque: 3.2, stallCurrent: 4.4, freeCurrent: 0.3, ticks: 288, gearing: 72, sku: 'REV-41-1300', rotorJ: 1.5e-6 },
};
// servos: speed = seconds per 60 deg at 6 V, torque in N*m, range in degrees for position 0..1
export const SERVOS = {
  'gobilda-torque': { name: 'goBILDA 2000 Torque (25 kg*cm, 300 deg)', secPer60: 0.25, torque: 25 * KGCM, range: 300, sku: '2000-0025-0002' },
  'gobilda-speed': { name: 'goBILDA 2000 Speed (9.3 kg*cm, 300 deg)', secPer60: 0.09, torque: 9.3 * KGCM, range: 300, sku: '2000-0025-0003' },
  'gobilda-superspeed': { name: 'goBILDA 2000 Super Speed (4 kg*cm, 300 deg)', secPer60: 0.043, torque: 4 * KGCM, range: 300, sku: '2000-0025-0004' },
  'rev-smart': { name: 'REV Smart Robot Servo (13.5 kg*cm, 270 deg)', secPer60: 0.14, torque: 13.5 * KGCM, range: 270, sku: 'REV-41-1097' },
  'axon-max': { name: 'Axon MAX (28 kg*cm, 355 deg)', secPer60: 0.115, torque: 28 * KGCM, range: 355, sku: 'axon-max' },
  'axon-mini': { name: 'Axon Mini (8 kg*cm, 355 deg)', secPer60: 0.083, torque: 8 * KGCM, range: 355, sku: 'axon-mini' },
};
// datasheet SKU -> model (used by the robot-file auto detection)
export function motorFromSku(text) {
  const t = String(text).toUpperCase();
  let m = t.match(/52(0[2-4])-?\d{4}-?(0\d{3})/);           // 5202/5203/5204 Yellow Jacket: last block = ratio code
  if (m) {
    const code = parseInt(m[2], 10);
    const byCode = { 1: 'gobilda-6000', 3: 'gobilda-1620', 4: 'gobilda-1620', 5: 'gobilda-1150', 14: 'gobilda-435', 19: 'gobilda-312', 27: 'gobilda-223',
      51: 'gobilda-117', 71: 'gobilda-84', 100: 'gobilda-60', 139: 'gobilda-43', 188: 'gobilda-30' };
    return byCode[code] || 'gobilda-312';
  }
  if (/41-?1300|CORE.?HEX/.test(t)) return 'rev-corehex';
  if (/41-?1291|41-?1301|HD.?HEX/.test(t)) return 'rev-hdhex-20';
  if (/YELLOW.?JACKET|\bMOTOR\b/.test(t)) return 'gobilda-312';
  return null;
}
export function servoFromSku(text) {
  const t = String(text).toUpperCase();
  if (/2000-?0025-?0002|TORQUE/.test(t)) return 'gobilda-torque';
  if (/2000-?0025-?0003|SPEED/.test(t)) return 'gobilda-speed';
  if (/2000-?0025-?0004/.test(t)) return 'gobilda-superspeed';
  if (/41-?1097|SMART.?SERVO/.test(t)) return 'rev-smart';
  if (/AXON.?MINI/.test(t)) return 'axon-mini';
  if (/AXON/.test(t)) return 'axon-max';
  if (/SERVO/.test(t)) return 'gobilda-torque';
  return null;
}

/**
 * Motor state + hub firmware. The OpMode (via the bridge) sends {mode, p | tv | tp+vmax, brake, vpidf, pp};
 * every physics step update() turns that into a duty cycle and the DC model gives the torque.
 */
export class Motor {
  constructor(name, modelId, params = {}) {
    this.name = name; this.modelId = modelId; this.m = MOTORS[modelId] || MOTORS['gobilda-312'];
    this.eff = params.efficiency ?? 0.9;                       // gearbox/bearing efficiency (calibration knob)
    this.freeScale = params.freeScale ?? 1.0;                  // free-speed scale (calibration knob)
    this.coulomb = params.coulomb ?? 0.01;                     // static friction as a fraction of stall torque (calibration: kS)
    this.viscous = params.viscous ?? 0.06;                     // speed-proportional gearbox/bearing loss (fraction of stall at free speed)
    this.cmd = { mode: 'power', p: 0, brake: true };
    this.angle = 0; this.omega = 0;                            // output shaft (rad, rad/s), filled by the load
    this.duty = 0; this.current = 0; this.integ = 0;
  }
  get wFree() { return this.m.freeRPM * 2 * Math.PI / 60 * this.freeScale; }
  get ticksPerRad() { return this.m.ticks / (2 * Math.PI); }
  get pos() { return this.angle * this.ticksPerRad; }
  get vel() { return this.omega * this.ticksPerRad; }
  /** hub closed loop -> duty in [-1, 1] */
  control(dt, vBatt) {
    const c = this.cmd, freeTps = this.wFree * this.ticksPerRad * (vBatt / 12);
    if (c.mode !== this.lastMode) { this.integ = 0; this.lastMode = c.mode; }   // the hub resets its PID on a mode change
    if (c.mode === 'velocity' || c.mode === 'position') {
      let tv = c.tv ?? 0;
      if (c.mode === 'position') {
        const pp = (c.pp ?? 10);
        const err = (c.tp ?? 0) - this.pos;
        const vmax = Math.abs(c.vmax ?? 0);
        tv = Math.max(-vmax, Math.min(vmax, pp * err));
        if (vmax === 0) tv = 0;
      }
      const [P, I, , F] = c.vpidf || [10, 3, 0, 0];
      const e = (tv - this.vel) / Math.max(1, freeTps);
      this.integ = Math.max(-0.6, Math.min(0.6, this.integ + e * dt * 25 * (I / 3)));
      const ff = tv / Math.max(1, freeTps) * (F > 0 ? F / 10 + 0.9 : 1);
      this.duty = Math.max(-1, Math.min(1, ff + e * 3 * (P / 10) + this.integ));
      if (Math.abs(tv) < 1e-6 && Math.abs(this.vel) < 1 && c.mode === 'velocity') { this.duty = 0; this.integ = 0; }
    } else {
      this.duty = Math.max(-1, Math.min(1, c.p ?? 0)); this.integ = 0;
    }
    return this.duty;
  }
  /** DC motor torque at the output shaft [N*m] for the current omega. */
  torque(vBatt) {
    const m = this.m, w = this.omega, ws = this.wFree, Ts = m.stallTorque * this.eff;
    if (this.duty === 0 && !this.cmd.brake) { this.current = 0; return -Math.sign(w) * Ts * 0.01; } // FLOAT: only friction
    const v = this.duty * vBatt / 12;                    // fraction of nominal voltage
    const t = Ts * (v - w / ws);                         // short-circuit braking when duty = 0 and BRAKE
    this.current = m.stallCurrent * Math.abs(v - w / ws) + (Math.abs(w) > 0.1 ? m.freeCurrent : 0);
    return t - Math.sign(w) * Ts * this.coulomb - Ts * this.viscous * w / ws;    // gearbox drag: loaded robots reach ~90-95% of free speed
  }
  /** inertia of the rotor seen at the output shaft */
  get reflectedJ() { return this.m.rotorJ * this.m.gearing * this.m.gearing; }
}

/** Positional servo: rate limited by its no-load speed, torque limited; position 0..1 maps to its range. */
export class Servo {
  constructor(name, modelId, params = {}) {
    this.name = name; this.s = SERVOS[modelId] || SERVOS['gobilda-torque'];
    this.target = null;            // radians relative to the servo's 0 position, null = not powered
    this.crPower = 0;
  }
  get maxSpeed() { return Math.PI / 3 / this.s.secPer60; }
  setPosition(p) { this.target = p == null ? null : p * this.s.range * Math.PI / 180; }
}

/** Battery: open-circuit voltage falls with use, internal resistance makes it sag under load. */
export class Battery {
  constructor(v0 = 13.0, capacityAh = 3.0, r = 0.06) { this.v0 = v0; this.cap = capacityAh * 3600; this.used = 0; this.r = r; this.v = v0; this.i = 0; }
  update(totalCurrent, dt) {
    this.i = totalCurrent; this.used += totalCurrent * dt;
    const soc = Math.max(0, 1 - this.used / this.cap);
    const voc = this.v0 - (1 - soc) * 1.2;
    this.v = Math.max(6, voc - this.r * totalCurrent);
    return this.v;
  }
}

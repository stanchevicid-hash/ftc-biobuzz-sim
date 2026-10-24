// Wiring between the robot's devices and the REV hubs, and the Driver Hub's robot configuration.
// Code -> configuration name -> hub port -> whatever is physically plugged into that port, exactly like a real robot:
// a cable in the wrong port moves the wrong motor, swapped motor leads make the encoder count backwards.
//
// cfg.wiring    = { expansion: bool, ports: { 'CH:motor:0': deviceId, ... }, swapped: { deviceId: true } }
// cfg.hubConfig = { 'CH:motor:0': { name, type }, ... }      (what you type in Configure Robot)
import { MOTORS } from './motors.js';

export const HUBS = [{ id: 'CH', name: 'Control Hub' }, { id: 'EH', name: 'Expansion Hub' }];
export const PORTS = { motor: 4, servo: 6, i2c: 4, digital: 8, analog: 4, usb: 2 };
export const key = (hub, kind, n) => `${hub}:${kind}:${n}`;
/** port names come from robot files other teams share: only real ports count */
export const validKey = (k) => /^(CH|EH):(motor|servo|i2c|digital|analog|usb):\d$/.test(k);
export const wiredPorts = (W) => Object.entries(W?.ports || {}).filter(([k]) => validKey(k));
export const parseKey = (k) => { const [hub, kind, n] = k.split(':'); return { hub, kind, n: +n }; };
const SENSOR_IF = { distance: 'i2c', color: 'i2c', pinpoint: 'i2c', touch: 'digital', analog: 'analog', webcam: 'usb', limelight: 'usb' };
const SENSOR_TYPE = { distance: 'REV 2m Distance Sensor', color: 'REV Color Sensor V3', pinpoint: 'goBILDA Pinpoint', touch: 'REV Touch Sensor', analog: 'Analog Input', webcam: 'Webcam', limelight: 'Limelight3A', imu: 'REV internal IMU (BHI260AP)' };
export const CONFIG_TYPES = {
  motor: ['goBILDA 5202/3/4 series', 'REV Robotics HD Hex Motor', 'REV Robotics Core Hex Motor', 'Unspecified Motor'],
  servo: ['Servo', 'Continuous Rotation Servo'],
  i2c: ['REV Color Sensor V3', 'REV 2m Distance Sensor', 'goBILDA Pinpoint', 'REV internal IMU (BHI260AP)'],
  digital: ['REV Touch Sensor', 'Digital Device'], analog: ['Analog Input'], usb: ['Webcam', 'Limelight3A'],
};
/** configuration type -> the device type the code and the simulation use */
export function javaKind(type) {
  if (CONFIG_TYPES.motor.includes(type)) return 'motor';
  if (type === 'Servo') return 'servo';
  if (type === 'Continuous Rotation Servo') return 'crservo';
  return { 'REV Color Sensor V3': 'color', 'REV 2m Distance Sensor': 'distance', 'goBILDA Pinpoint': 'pinpoint', 'REV internal IMU (BHI260AP)': 'imu',
    'REV Touch Sensor': 'touch', 'Digital Device': 'touch', 'Analog Input': 'analog', Webcam: 'webcam', Limelight3A: 'limelight' }[type] || 'unknown';
}
const motorType = (model) => /^rev-hd/.test(model) ? 'REV Robotics HD Hex Motor' : /^rev-core/.test(model) ? 'REV Robotics Core Hex Motor' : /^gobilda/.test(model) ? 'goBILDA 5202/3/4 series' : 'Unspecified Motor';

/** everything on the robot that has a cable: { id, port (which kind of port the connector fits), kind, type, drive } */
export function physicalDevices(cfg) {
  const d = [];
  for (const w of cfg.wheels || []) d.push({ id: w.motor, port: 'motor', kind: 'motor', type: motorType(w.model), drive: true });
  for (const m of cfg.motors || []) d.push({ id: m.name, port: 'motor', kind: 'motor', type: motorType(m.model) });
  for (const s of cfg.servos || []) d.push({ id: s.name, port: 'servo', kind: s.kind === 'crservo' ? 'crservo' : 'servo', type: s.kind === 'crservo' ? 'Continuous Rotation Servo' : 'Servo' });
  for (const s of cfg.sensors || []) if (SENSOR_IF[s.type]) d.push({ id: s.name, port: SENSOR_IF[s.type], kind: s.type, type: SENSOR_TYPE[s.type] });
  return d;
}
/** connectors: JST-VH fits motor ports, 3-pin fits servo ports, the 4-pin JST-PH fits I2C, digital and analog ports alike */
export const fits = (dev, portKind) => dev.port === portKind || (['i2c', 'digital', 'analog'].includes(dev.port) && ['i2c', 'digital', 'analog'].includes(portKind));

/** a correct wiring and configuration: drive motors on the Control Hub, the rest in order, names = device names */
export function autoWire(cfg) {
  const ports = {}, hubConfig = {}, used = {};
  const take = (kind, start = 0) => {
    for (const hub of ['CH', 'EH']) for (let n = hub === 'CH' ? start : 0; n < PORTS[kind]; n++) { const k = key(hub, kind, n); if (!used[k]) { used[k] = true; return k; } }
    return null;
  };
  used[key('CH', 'i2c', 0)] = true;                                   // the internal IMU lives on I2C bus 0
  const devs = physicalDevices(cfg).sort((a, b) => (b.drive ? 1 : 0) - (a.drive ? 1 : 0));
  for (const d of devs) { const k = take(d.port, d.port === 'i2c' ? 1 : 0); if (!k) continue; ports[k] = d.id; hubConfig[k] = { name: d.id, type: d.type }; }
  const imu = (cfg.sensors || []).find(s => s.type === 'imu');
  hubConfig[key('CH', 'i2c', 0)] = { name: imu?.name || 'imu', type: SENSOR_TYPE.imu };
  return { wiring: { expansion: Object.keys(ports).some(k => k.startsWith('EH')), ports, swapped: {} }, hubConfig };
}

/**
 * What the code can reach: one entry per configured name -> the physical device that answers, or null.
 * null = nothing plugged in, hub not connected, or the connector is in a port of the wrong kind.
 */
export function harness(cfg) {
  if (!cfg.wiring || !cfg.hubConfig) return null;
  const W = cfg.wiring, devs = Object.fromEntries(physicalDevices(cfg).map(d => [d.id, d])), out = [];
  for (const [k, c] of Object.entries(cfg.hubConfig)) {
    if (!validKey(k) || !c?.name) continue;
    const p = parseKey(k), kind = javaKind(c.type);
    let physical = null;
    if (kind === 'imu') physical = (cfg.sensors || []).find(s => s.type === 'imu')?.name ?? null;
    else if (p.hub === 'CH' || W.expansion) { const id = W.ports[k], d = devs[id]; if (d && d.port === p.kind) physical = id; }
    out.push({ key: k, name: c.name, kind, physical });
  }
  return { entries: out, swapped: W.swapped || {} };
}

/**
 * Robot Doctor: compares the wires, the configuration and the code like a mentor at the pit table.
 * codeNames: [{ name, type }] requested by the OpModes (names.js).
 */
export function doctor(cfg, codeNames = []) {
  if (!cfg.wiring || !cfg.hubConfig) return [];
  const R = [], W = cfg.wiring, C = cfg.hubConfig, add = (level, title, fix = '') => R.push({ level, title, fix });
  const devs = physicalDevices(cfg), where = Object.fromEntries(wiredPorts(W).map(([k, id]) => [id, k]));
  const label = (k) => { const p = parseKey(k); return `${p.hub === 'CH' ? 'Control Hub' : 'Expansion Hub'} ${p.kind === 'i2c' ? 'I2C bus' : p.kind} ${p.n}`; };
  for (const d of devs) {
    const k = where[d.id];
    if (!k) { add('fail', `${d.id} is not plugged in`, `Plug it into a ${d.port === 'i2c' ? 'I2C' : d.port} port.`); continue; }
    const p = parseKey(k);
    if (p.hub === 'EH' && !W.expansion) add('fail', `${d.id} is on the Expansion Hub, which is not connected`, 'Connect the RS-485 cable between the hubs.');
    if (p.kind !== d.port) add('fail', `${d.id} is in ${label(k)}`, `It needs a ${d.port === 'i2c' ? 'I2C' : d.port} port. The plug fits, but it will not work.`);
    const c = C[k];
    if (!c?.name) add('warn', `${label(k)} has ${d.id} but no name in the configuration`, `Name it in Driver Hub, Configure Robot.`);
    else {
      if (javaKind(c.type) !== d.kind && !(d.kind === 'motor' && javaKind(c.type) === 'motor')) add('fail', `${label(k)} is configured as ${c.type}, but ${d.id} is plugged in`, `Set the type to ${d.type}.`);
      if (c.name !== d.id && devs.some(o => o.id === c.name)) add('fail', `"${c.name}" points at ${label(k)}, where ${d.id} is plugged in`, `Code that drives ${c.name} will move ${d.id}. Move the cable or fix the name.`);
    }
    if (W.swapped?.[d.id]) add('warn', `${d.id}: power and encoder disagree`, 'The motor leads are swapped: positive power counts the encoder down and RUN_TO_POSITION runs away. Swap the leads back (reversing in code does not fix the encoder).');
  }
  for (const [k, c] of Object.entries(C)) {
    if (!validKey(k) || !c?.name || javaKind(c.type) === 'imu') continue;
    if (!W.ports[k]) add('warn', `"${c.name}" is configured on ${label(k)}, but nothing is plugged in there`, 'Plug the device in or delete the entry.');
  }
  const names = Object.values(C).filter(c => c?.name).map(c => c.name), dup = names.filter((n, i) => names.indexOf(n) !== i);
  for (const n of new Set(dup)) add('fail', `"${n}" is used twice in the configuration`, 'Every name must be unique.');
  for (const w of codeNames) if (!names.includes(w.name)) add('fail', `Your code asks for "${w.name}", the configuration has no such name`, 'Add it in Configure Robot or change the code.');
  if (!R.length) add('pass', 'Wiring, configuration and code agree');
  return R;
}

/** default motor model for a configured motor with nothing behind it (the SDK still creates the object) */
export const defaultModel = (type) => type === 'REV Robotics HD Hex Motor' ? Object.keys(MOTORS).find(m => /^rev-hd/.test(m)) : 'gobilda-312';

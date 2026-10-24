// Device-name check: which hardwareMap names the team's code asks for, which of them this robot lacks,
// and a best guess for the robot device each one means (so "leftFront" in code can drive "frontLeft" on the robot).

const CLASS_TYPE = {
  DcMotor: 'motor', DcMotorEx: 'motor', DcMotorSimple: 'motor', Servo: 'servo', ServoImplEx: 'servo', CRServo: 'crservo', CRServoImplEx: 'crservo',
  IMU: 'imu', DistanceSensor: 'distance', Rev2mDistanceSensor: 'distance', ColorSensor: 'color', NormalizedColorSensor: 'color', RevColorSensorV3: 'color',
  TouchSensor: 'touch', RevTouchSensor: 'touch', DigitalChannel: 'touch', WebcamName: 'webcam', GoBildaPinpointDriver: 'pinpoint', Limelight3A: 'limelight',
  AnalogInput: 'analog',
};
const MAP_FIELD = { dcMotor: 'motor', servo: 'servo', crservo: 'crservo', touchSensor: 'touch', colorSensor: 'color', analogInput: 'analog', digitalChannel: 'touch' };
// robot device types that can answer a request for a given type (a color sensor V3 also measures distance)
const COMPATIBLE = { distance: ['distance', 'color'], motor: ['motor'], servo: ['servo'], crservo: ['crservo'] };

/** names requested with hardwareMap.get(X.class, "n"), hardwareMap.tryGet(...), hardwareMap.dcMotor.get("n"),
 *  where "n" may also be a String constant (static final String LEFT_FRONT = "leftFront") declared in any file */
export function codeDeviceNames(files) {
  const found = new Map(), consts = {};
  for (const f of files) for (const m of (f.code || '').matchAll(/\bString\s+([A-Za-z_]\w*)\s*=\s*"([^"]*)"/g)) consts[m[1]] = m[2];
  const arg = String.raw`(?:"([^"]+)"|(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)\s*\))`;
  const re = new RegExp(String.raw`hardwareMap\s*\.\s*(?:(?:get|tryGet)\s*\(\s*([A-Za-z0-9_]+)\s*\.\s*class\s*,\s*${arg}|([A-Za-z]+)\s*\.\s*get\s*\(\s*${arg})`, 'g');
  for (const f of files) {
    for (const m of (f.code || '').matchAll(re)) {
      const name = m[2] ?? consts[m[3]] ?? m[5] ?? consts[m[6]], type = m[1] ? CLASS_TYPE[m[1]] : MAP_FIELD[m[4]];
      if (name == null || !type || found.has(name)) continue;   // a variable or a method call is only known when it runs
      found.set(name, { name, type, javaType: m[1] || m[4], file: f.name, line: f.code.slice(0, m.index).split('\n').length });
    }
  }
  return [...found.values()];
}

/** position words in a device name, so leftFront, front_left, motorFL and lf all mean {front, left} */
function key(name) {
  let s = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/motor|drive|servo|sensor|wheel|dc/g, '');
  const pos = new Set();
  if (/^[lrfb]{2}$/.test(s)) { for (const c of s) pos.add({ l: 'left', r: 'right', f: 'front', b: 'back' }[c]); return [...pos].sort().join('+'); }
  for (const [w, p] of [['front', 'front'], ['fwd', 'front'], ['back', 'back'], ['rear', 'back'], ['left', 'left'], ['right', 'right']])
    if (s.includes(w)) { pos.add(p); s = s.replace(w, ''); }
  return [...pos].sort().join('+') + (s ? '|' + s : '');
}

/** best robot device for a missing code name, or null */
export function suggest(want, robotDevices, taken = new Set()) {
  const ok = COMPATIBLE[want.type] || [want.type];
  const pool = robotDevices.filter(d => ok.includes(d.type) && !taken.has(d.name));
  if (pool.length === 1 && want.type !== 'motor') return pool[0].name;     // the only IMU, the only webcam…
  const k = key(want.name);
  return pool.find(d => key(d.name) === k)?.name
    ?? pool.find(d => { const a = d.name.toLowerCase(), b = want.name.toLowerCase(); return a.includes(b) || b.includes(a); })?.name ?? null;
}

/** code names this robot cannot serve (aliases already set count as served) */
export function missingNames(files, robotDevices, aliases = {}) {
  const have = new Set(robotDevices.map(d => d.name));
  return codeDeviceNames(files).filter(w => !have.has(w.name) && !(aliases[w.name] && have.has(aliases[w.name])));
}

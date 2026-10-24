// Default / demo robot: goBILDA Strafer chassis (432 mm + 264 mm 1120-series channels, 4x 5203 312 RPM, 104 mm mecanum)
// with BIOBUZZ mechanisms: front intake roller -> 4-ball storage -> single flywheel shooter with servo hood,
// rear linear lift (prismatic joint, 435 RPM + 38 mm spool) carrying a servo claw for placing NECTAR in a FLOWER.
// Robot frame: +X right, +Y forward, +Z up, meters. Everything here is the config format a user robot is saved in.
export const DEMO_ROBOT = {
  name: 'Demo: goBILDA Strafer + BIOBUZZ mechanisms',
  version: 1,
  chassis: {
    size: [0.33, 0.43, 0.09], clearance: 0.022, mass: 10.6, com: [0, -0.01, 0.10],
    colliders: [
      { c: [0, 0, 0.067], h: [0.165, 0.215, 0.045] },          // frame + plate
      { c: [0, -0.06, 0.30], h: [0.08, 0.07, 0.15] },          // shooter tower
    ],
  },
  wheels: [
    { motor: 'frontLeft', model: 'gobilda-312', type: 'mecanum', pos: [-0.195, 0.15, 0.052], radius: 0.052, width: 0.046, roller: 1, motorDir: -1 },
    { motor: 'frontRight', model: 'gobilda-312', type: 'mecanum', pos: [0.195, 0.15, 0.052], radius: 0.052, width: 0.046, roller: -1, motorDir: 1 },
    { motor: 'backLeft', model: 'gobilda-312', type: 'mecanum', pos: [-0.195, -0.15, 0.052], radius: 0.052, width: 0.046, roller: -1, motorDir: -1 },
    { motor: 'backRight', model: 'gobilda-312', type: 'mecanum', pos: [0.195, -0.15, 0.052], radius: 0.052, width: 0.046, roller: 1, motorDir: 1 },
  ],
  motors: [
    { name: 'intake', model: 'gobilda-1150', load: { type: 'spinner', inertia: 2e-4, radius: 0.03 } },
    { name: 'shooter', model: 'gobilda-6000', load: { type: 'spinner', inertia: 8e-4, radius: 0.048 } },
    { name: 'lift', model: 'gobilda-435', load: { type: 'joint', joint: 'lift', ratio: 1 / 0.019, dir: 1 } },
  ],
  servos: [
    { name: 'feeder', model: 'gobilda-speed', kind: 'servo' },
    { name: 'hood', model: 'gobilda-torque', kind: 'servo', joint: 'hood', zero: 0, dir: 1, travel: 0.70 },
    { name: 'claw', model: 'gobilda-speed', kind: 'servo' },
  ],
  joints: [
    { id: 'hood', parent: 'chassis', type: 'revolute', anchor: [0, 0.01, 0.43], axis: [1, 0, 0], limits: [0, 0.75], mass: 0.08, ghost: true,
      box: { c: [0, 0.05, 0.445], h: [0.045, 0.045, 0.004] } },
    { id: 'lift', parent: 'chassis', type: 'prismatic', anchor: [0, -0.23, 0.05], axis: [0, 0, 1], limits: [0, 0.45], mass: 0.45,
      box: { c: [0, -0.232, 0.16], h: [0.07, 0.008, 0.11] } },
  ],
  holders: [
    { id: 'storage', link: 'chassis', zone: { c: [0, 0.24, 0.05], h: [0.12, 0.035, 0.06] }, capacity: 4, accepts: ['pollen', 'nectar'],
      intake: { device: 'intake', op: '>', value: 0.3 }, eject: { device: 'intake', op: '<', value: -0.3, dirVec: [0, 1, 0], speed: 1.5 },
      slots: [[0, -0.02, 0.32], [0, 0.05, 0.26], [0, 0.11, 0.2], [0, 0.16, 0.14]] },
    { id: 'claw', link: 'lift', zone: { c: [0, -0.30, 0.09], h: [0.06, 0.06, 0.06] }, capacity: 1, accepts: ['nectar', 'pollen'],
      intake: { device: 'claw', op: '<', value: 0.3 }, release: { device: 'claw', op: '>', value: 0.6 }, slots: [[0, -0.30, 0.09]] },
  ],
  launchers: [
    { holder: 'storage', link: 'chassis', flywheel: 'shooter', feed: { device: 'feeder', op: '>', value: 0.5 },
      exit: [0, 0.07, 0.47], hood: { device: 'hood', min: 25, max: 65 }, speedFactor: 0.5 },
  ],
  sensors: [
    { name: 'imu', type: 'imu', hubLogo: 'UP', hubUsb: 'FORWARD' },   // how the Control Hub is really mounted
    { name: 'Webcam 1', type: 'webcam', link: 'chassis', pos: [0, 0.16, 0.36], yaw: 0, pitch: 32, roll: 0 },
    { name: 'rearDistance', type: 'distance', link: 'chassis', pos: [0.12, -0.216, 0.06], yaw: 180, pitch: 0 },
    { name: 'intakeColor', type: 'color', link: 'chassis', pos: [0, 0.24, 0.115], yaw: 0, pitch: -90 },
    { name: 'liftLimit', type: 'touch', joint: 'lift', below: 0.004 },
    { name: 'pinpoint', type: 'pinpoint', xOffsetMm: -84, yOffsetMm: -168 },
  ],
  visual: { type: 'demo' },
};

/** printed top label for the electronics: dark plate, port strip, name */
function labelTex(THREE, text, bg, fg, ports) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 192);
  if (ports) ['#e0a526', '#e0a526', '#e0a526', '#e0a526', '#4f8fe0', '#4f8fe0', '#4f8fe0', '#57b36a', '#57b36a']
    .forEach((col, i) => { g.fillStyle = '#111'; g.fillRect(14 + i * 26, 12, 20, 16); g.fillStyle = col; g.fillRect(14 + i * 26, 28, 20, 3); });
  g.fillStyle = fg; g.font = '700 34px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, ports ? 120 : 108);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** goBILDA pattern on a 24 mm grid: a 14 mm hole in the middle of each cell, 4 mm holes on the 8 mm pitch around it (white = metal) */
let holesTex = null;
function goBildaHoles(THREE) {
  if (holesTex) return holesTex;
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), s = 96 / 24;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96); g.fillStyle = '#000';
  const hole = (x, y, d) => { g.beginPath(); g.arc(x * s, y * s, d / 2 * s, 0, Math.PI * 2); g.fill(); };
  hole(12, 12, 14);
  for (const [x, y] of [[4, 4], [20, 4], [4, 20], [20, 20]]) hole(x, y, 4);
  holesTex = new THREE.CanvasTexture(c); holesTex.wrapS = holesTex.wrapT = THREE.RepeatWrapping; holesTex.anisotropy = 8;
  return holesTex;
}
/** box-projected UVs in units of the 24 mm hole grid, so the pattern keeps its real size on every part */
function worldUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, k = 1 / 0.024;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [p.getY(i), p.getZ(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u * k + 0.5, v * k + 0.5);
  }
  return geo;
}

/** Procedural 3D model of the demo robot. Returns { root, links:{id:Group}, update(robot) }. */
export function buildDemoVisual(THREE, robot, extra = {}) {
  const Rounded = extra.RoundedBoxGeometry;          // passed in by the renderer, so this file also loads in node tests
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35, ...o });
  const alu = M(0xd2d5d9, { metalness: 1, roughness: 0.33, alphaMap: goBildaHoles(THREE), alphaTest: 0.5, side: THREE.DoubleSide }), dark = M(0x26282b), yellow = M(0xf2c12e, { metalness: 0.2 }), black = M(0x111111, { roughness: 0.9 });
  const green = M(0x5aa83a), orange = M(0xff7a1a), red = M(0xd32f2f), blue = M(0x1565c0), plate = M(0x8a8f96, { metalness: 0.6 });
  const box = (w, l, h, m, x, y, z, parent) => { const o = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, l, h)), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const cyl = (r, len, m, axis, x, y, z, parent, seg = 20) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
    if (axis === 'x') o.rotation.z = Math.PI / 2; if (axis === 'z') o.rotation.x = Math.PI / 2;
    o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
  };
  const root = new THREE.Group(), links = {};
  // frame: 432 mm side channels, 264 mm cross channels (48 mm U-channel)
  for (const sx of [-1, 1]) box(0.048, 0.432, 0.048, alu, sx * 0.141, 0, 0.07, root);
  for (const sy of [-1, 1]) box(0.24, 0.048, 0.048, alu, 0, sy * 0.192, 0.07, root);
  box(0.29, 0.40, 0.004, plate, 0, 0, 0.096, root);
  // motors (yellow jacket + gearbox) inside the channels, pointing inwards
  const spin = [];
  for (const w of robot.cfg.wheels) {
    const sx = Math.sign(w.pos[0]);
    cyl(0.018, 0.075, yellow, 'x', w.pos[0] - sx * 0.1, w.pos[1], 0.052, root);
    cyl(0.019, 0.05, dark, 'x', w.pos[0] - sx * 0.05, w.pos[1], 0.052, root);
    // wheel: hub + 10 angled rollers (mecanum)
    const g = new THREE.Group(); g.position.set(...w.pos); root.add(g);
    const hub = cyl(0.04, w.width * 0.9, M(0x333a44), 'x', 0, 0, 0, g); hub.castShadow = true;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, r = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), black);
      const k = new THREE.Group(); k.rotation.x = a; g.add(k);
      r.position.set(0, 0, w.radius - 0.012); r.rotation.set(0, 0, 0); r.rotation.order = 'ZYX';
      r.rotation.z = Math.PI / 2; r.rotation.x = (w.roller ?? 1) * Math.PI / 4;
      k.add(r);
    }
    spin.push({ g, w });
  }
  // electronics
  // electronics: rounded cases with their printed tops
  const rbox = (w, l, h, mat, x, y, z, r, top) => {
    const o = new THREE.Mesh(Rounded ? new Rounded(w, l, h, 3, r) : new THREE.BoxGeometry(w, l, h), mat); o.position.set(x, y, z); o.castShadow = true; root.add(o);
    if (top) { const t = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * r, l - 2 * r), M(0xffffff, { map: top, roughness: 0.6, metalness: 0 })); t.position.set(x, y, z + h / 2 + 0.0006); root.add(t); }
    return o;
  };
  rbox(0.11, 0.1, 0.03, M(0x2c2f33, { roughness: 0.45, metalness: 0.2 }), 0.08, -0.12, 0.115, 0.004, labelTex(THREE, 'Control Hub', '#2c2f33', '#e8e8e8', true));
  rbox(0.13, 0.07, 0.035, M(0x141414, { roughness: 0.7 }), -0.08, -0.13, 0.115, 0.006, labelTex(THREE, '12V NiMH', '#141414', '#f2c12e'));
  rbox(0.04, 0.04, 0.012, M(0x1d5f2c, { roughness: 0.5 }), 0.12, 0.1, 0.105, 0.002);                     // Pinpoint board
  // power switch and the main power lead from the battery to the hub
  rbox(0.03, 0.018, 0.012, M(0xd32f2f, { roughness: 0.5 }), -0.005, -0.17, 0.104, 0.003);
  const lead = new THREE.CatmullRomCurve3([[-0.03, -0.13, 0.135], [0, -0.15, 0.15], [0.03, -0.12, 0.135]].map(v => new THREE.Vector3(...v)));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 16, 0.003, 8), M(0xb22222, { roughness: 0.5 })));
  // intake: roller across the front + side plates
  const roller = new THREE.Group(); roller.position.set(0, 0.235, 0.06); root.add(roller);
  const rmesh = cyl(0.03, 0.27, M(0x2f8f5b, { roughness: 0.8 }), 'x', 0, 0, 0, roller);
  for (let i = 0; i < 6; i++) { const f = box(0.27, 0.008, 0.012, M(0x1f6f45), 0, 0, 0.034, roller); f.position.set(0, Math.cos(i) * 0.034, Math.sin(i) * 0.034); f.rotation.x = i; }
  for (const sx of [-1, 1]) box(0.006, 0.08, 0.1, green, sx * 0.14, 0.22, 0.09, root);
  // ramp to the shooter
  const ramp = box(0.12, 0.3, 0.006, M(0x3b7bd6, { transparent: true, opacity: 0.6 }), 0, 0.07, 0.2, root); ramp.rotation.x = 0.55;
  // shooter tower: side plates + flywheel
  for (const sx of [-1, 1]) box(0.008, 0.14, 0.3, green, sx * 0.075, -0.05, 0.3, root);
  const fly = new THREE.Group(); fly.position.set(0, 0.0, 0.43); root.add(fly);
  cyl(0.048, 0.04, black, 'x', 0, 0, 0, fly); box(0.042, 0.02, 0.09, orange, 0, 0, 0, fly);
  cyl(0.018, 0.06, yellow, 'x', 0.09, 0, 0.43, root);
  // camera on the tower
  const cam = box(0.09, 0.025, 0.03, dark, 0, 0.16, 0.36, root); cam.rotation.x = 32 * Math.PI / 180;
  cyl(0.008, 0.01, M(0x223344, { metalness: 0.9 }), 'y', 0, 0.175, 0.37, root);
  // lift rails at the back
  for (const sx of [-1, 1]) box(0.024, 0.024, 0.42, alu, sx * 0.09, -0.222, 0.27, root);
  // links
  const hood = new THREE.Group(); root.add(hood); links.hood = hood;
  const hp = box(0.09, 0.09, 0.006, orange, 0, 0.05, 0.445, hood);
  const lift = new THREE.Group(); root.add(lift); links.lift = lift;
  box(0.14, 0.016, 0.22, alu, 0, -0.232, 0.16, lift);
  box(0.12, 0.08, 0.012, plate, 0, -0.27, 0.04, lift);                    // claw base
  const fingers = [];
  for (const sx of [-1, 1]) { const f = new THREE.Group(); f.position.set(sx * 0.03, -0.25, 0.05); lift.add(f); box(0.008, 0.11, 0.07, green, sx * 0.025, -0.05, 0.04, f); fingers.push({ f, sx }); }
  box(0.04, 0.02, 0.02, M(0x222222), 0.12, -0.222, 0.06, root);          // rear distance sensor
  box(0.03, 0.03, 0.01, M(0x444444), 0, 0.24, 0.12, root);                // intake color sensor
  const ballsLabel = null;
  return {
    root, links,
    update(r) {
      for (const { g, w } of spin) { const ww = r.wheels.find(x => x.motor === w.motor); g.rotation.x = -(ww?.angle ?? 0); }
      const loads = Object.fromEntries((r.cfg.motors || []).map(m => [m.name, m.load]));
      roller.rotation.x = -(loads.intake?.angle ?? 0);
      fly.rotation.x = -(loads.shooter?.angle ?? 0);
      const claw = r.servoPos('claw') ?? 0;
      for (const { f, sx } of fingers) f.rotation.z = sx * (0.1 + claw * 0.6);
    },
  };
}

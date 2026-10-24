// BIOBUZZ (FTC 2026-27) field: geometry from Competition Manual TU04/TU05 section 9, physics and visuals.
// Frame: meters, origin = field center on the tiles, +X away from the audience, +Y towards the RED alliance wall, +Z up.
export const IN = 0.0254;
export const FIELD_HALF = 72 * IN;          // 144 in inside the perimeter
export const WALL_H = 12.25 * IN;
export const POLLEN_R = 2.8 / 2 * IN, NECTAR_R = 3.6 / 2 * IN;
export const POLLEN_MASS = 0.028, NECTAR_MASS = 0.055;   // kg, estimated (Gopher ResisDent hollow PE balls)
export const GROUP = { FIELD: 1, ROBOT: 2, BALL: 4, LINK: 8, HELD: 16 };
export const groups = (member, filter) => (member << 16) | filter;

// HIVE (9.6): pivot 43.95 in high, hives 25.5 in center-to-center, cells 18.84 in apart, 12.04 in deep, opening 20 x 14 in, tilted 30 deg.
export const HIVE = {
  pivotZ: 43.95 * IN, tilt: 30 * Math.PI / 180,
  cellInner: 9.42 * IN, cellOuter: 21.46 * IN, cellHalfW: 10 * IN, cellZ0: -1.4 * IN, cellZ1: 12.6 * IN, cellSideH: 7.61 * IN,
  tipTorque: 0.45,          // N*m holding each stable state. Not published: tuned so the 3 staged NECTAR hold and ~2 more POLLEN tip it
  mass: 3.0,
  hives: [
    { alliance: 'red', y: 12.75 * IN, startAngle: +1, tags: { far: 30, audience: 34 } },   // +angle: far cell down, audience cell up
    { alliance: 'blue', y: -12.75 * IN, startAngle: -1, tags: { far: 42, audience: 38 } },
  ],
};
// FLOWER (9.7): top opening 4 in at 21.5 in, scoring volume between top ring and middle ring (~4 in), retrieval opening 3.55 in.
export const FLOWER = { topZ: 21.5 * IN, midZ: 4.0 * IN, innerR: 2.15 * IN, fromWall: 2.6 * IN, pipeR: 1.89 * Math.SQRT2 * IN };   // pipes 1.89 in off center on both axes
// HIVE frame (9.6.1, Figure 9-8): A-frames 38.95 in deep at the base, 49.46 in apart
export const FRAME = { halfDepth: 38.95 / 2 * IN, halfWidth: 49.46 / 2 * IN };
export const FLOWERS = [
  { id: 'F-red', x: -24 * IN, y: 72 * IN - FLOWER.fromWall, out: [0, -1] },
  { id: 'F-aud', x: -72 * IN + FLOWER.fromWall, y: -22 * IN, out: [1, 0] },
  { id: 'F-blue', x: 24 * IN, y: -72 * IN + FLOWER.fromWall, out: [0, 1] },
  { id: 'F-far', x: 72 * IN - FLOWER.fromWall, y: 22 * IN, out: [-1, 0] },
];
// zones (9.3), [xmin, xmax, ymin, ymax]
export const ZONES = {
  loading: { red: [25 * IN, 48 * IN, 61 * IN, 72 * IN], blue: [-48 * IN, -25 * IN, -72 * IN, -61 * IN] },
  garden: { red: [-72 * IN, -70 * IN, 49 * IN, 72 * IN], blue: [70 * IN, 72 * IN, -72 * IN, -49 * IN] },
};
// starting positions touching the alliance wall (y is computed from the robot's real footprint, see Simulation)
export const START_POSES = {
  'Red - audience side': { x: -36 * IN, wall: 'red', heading: -90 },
  'Red - far side': { x: 12 * IN, wall: 'red', heading: -90 },
  'Blue - audience side': { x: -12 * IN, wall: 'blue', heading: 90 },
  'Blue - far side': { x: 36 * IN, wall: 'blue', heading: 90 },
};

const q = (w, x, y, z) => ({ w, x, y, z });
const qAxis = (ax, ay, az, a) => { const s = Math.sin(a / 2); return q(Math.cos(a / 2), ax * s, ay * s, az * s); };
export function qRotate(qq, v) { // rotate vector v by quaternion qq
  const { w, x, y, z } = qq, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
export function qMul(a, b) {
  return q(a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w);
}
export const qConj = a => q(a.w, -a.x, -a.y, -a.z);
export { qAxis };

/** CELL cross-section (Figure 9-11): a "house" pentagon, 20 in flat floor, 7.61 in straight sides, gable up to 14 in.
 *  Returned as [y, z] corners in hive-local coordinates, counter-clockwise from the floor's -Y corner. */
export function cellPentagon(grow = 0) {
  const H = HIVE, z0 = H.cellZ0 - grow, zs = H.cellZ0 + H.cellSideH, zp = H.cellZ1 + grow * 1.2, w = H.cellHalfW + grow;
  return [[-w, z0], [w, z0], [w, zs], [0, zp], [-w, zs]];
}
/** inside the CELL's pentagonal cross-section (y, z hive-local) */
export function inPentagon(y, z) {
  const H = HIVE, ay = Math.abs(y);
  return ay < H.cellHalfW && z > H.cellZ0 && z < H.cellZ0 + H.cellSideH + (H.cellZ1 - H.cellZ0 - H.cellSideH) * (1 - ay / H.cellHalfW);
}
/** Cell panels in hive-local coordinates (sign = +1 far cell, -1 audience cell): [center, halfExtents, rotation about X, part].
 *  The inner end wall is a pentagon and is built separately (cellEndWall). */
export function cellPanels(sign) {
  const H = HIVE, t = 0.12 * IN;
  const cx = sign * (H.cellInner + H.cellOuter) / 2, hx = (H.cellOuter - H.cellInner) / 2;
  const zs = H.cellZ0 + H.cellSideH, rise = H.cellZ1 - zs, roofHalf = Math.hypot(H.cellHalfW, rise) / 2, a = Math.atan2(rise, H.cellHalfW);
  return [
    [[cx, 0, H.cellZ0], [hx, H.cellHalfW, t], 0, 'floor'],                          // floor (AprilTag cluster underneath)
    [[cx, H.cellHalfW, (H.cellZ0 + zs) / 2], [hx, t, H.cellSideH / 2], 0, 'side'],     // straight side walls
    [[cx, -H.cellHalfW, (H.cellZ0 + zs) / 2], [hx, t, H.cellSideH / 2], 0, 'side'],
    [[cx, H.cellHalfW / 2, (zs + H.cellZ1) / 2], [hx, roofHalf, t], -a, 'roof'],       // gable roof
    [[cx, -H.cellHalfW / 2, (zs + H.cellZ1) / 2], [hx, roofHalf, t], a, 'roof'],
    [[sign * H.cellOuter, 0, H.cellZ0 + 0.6 * IN], [t, H.cellHalfW, 0.6 * IN], 0, 'lip'], // red rim across the opening's floor
  ];
}
/** closed inner end of a CELL (towards the pivot): thin pentagonal prism, as hull points */
export function cellEndWall(sign) {
  const x = sign * HIVE.cellInner, t = 0.12 * IN, pts = [];
  for (const [y, z] of cellPentagon()) pts.push(x - t, y, z, x + t, y, z);
  return pts;
}
/** AprilTag poses in hive-local frame. Tag frame: x right, y down (image), z into the tag (AprilTag/OpenCV convention). */
export function cellTags(sign, firstId) {
  const H = HIVE, xs = [-6.5, -2.75, 2.75, 6.5];
  const zTag = H.cellZ0 - 0.13 * IN;
  const tagX = sign * (H.cellOuter - 7.1874 * IN);
  // axes: y_down points to the pivot (-sign*X), z_into = +Z (up into the cell), x_right = y x z
  const ydown = [-sign, 0, 0], zin = [0, 0, 1], xr = [0, sign, 0];
  const tags = xs.map((o, i) => ({ id: firstId + i, pos: [tagX, xr[1] * o * IN, zTag], axes: [xr, ydown, zin], size: 3.25 * IN }));
  const origin = [sign * H.cellOuter, 0, zTag + 5.622 * IN];
  return { tags, cluster: { firstId, pos: origin, axes: [xr, ydown, zin] } };
}

export function buildFieldPhysics(R, world) {
  const F = {};
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const box = (c, h, opts = {}) => {
    const d = R.ColliderDesc.cuboid(h[0], h[1], h[2]).setTranslation(c[0], c[1], c[2])
      .setFriction(opts.friction ?? 0.6).setRestitution(opts.rest ?? 0.2).setCollisionGroups(groups(GROUP.FIELD, 0xffff));
    if (opts.rot) d.setRotation(opts.rot);
    const col = world.createCollider(d, opts.body || fixed);
    col.userData = opts.data || { kind: 'field' };
    return col;
  };
  // tiles (top at z = 0) and perimeter
  box([0, 0, -0.05], [3, 3, 0.05], { friction: 0.9, data: { kind: 'floor' } });
  const W = FIELD_HALF, t = 0.5 * IN;
  box([W + t, 0, WALL_H / 2], [t, W + 2 * t, WALL_H / 2], { data: { kind: 'wall' } });
  box([-W - t, 0, WALL_H / 2], [t, W + 2 * t, WALL_H / 2], { data: { kind: 'wall' } });
  box([0, W + t, WALL_H / 2], [W + 2 * t, t, WALL_H / 2], { data: { kind: 'wall' } });
  box([0, -W - t, WALL_H / 2], [W + 2 * t, t, WALL_H / 2], { data: { kind: 'wall' } });

  // HIVE frame: 4 legs (A-frames 49.46 in wide, 38.95 in deep at the base) and the crossbar
  const legR = 0.6 * IN;
  for (const sy of [1, -1]) for (const sx of [1, -1]) {
    const a = [sx * FRAME.halfDepth, sy * FRAME.halfWidth, 0], b = [0, sy * FRAME.halfWidth, HIVE.pivotZ];
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
    const ang = Math.acos(d[2] / len), ax = [-d[1], d[0], 0], al = Math.hypot(ax[0], ax[1]) || 1;
    const rot = qAxis(ax[0] / al, ax[1] / al, 0, ang);
    const col = world.createCollider(R.ColliderDesc.capsule(len / 2, legR).setTranslation(...c).setRotation(rot)
      .setCollisionGroups(groups(GROUP.FIELD, 0xffff)), fixed);
    col.userData = { kind: 'frame' };
  }
  box([0, 0, HIVE.pivotZ + 1.5 * IN], [0.75 * IN, FRAME.halfWidth + 1 * IN, 0.75 * IN], { data: { kind: 'frame' } });

  // HIVES: dynamic bodies on a revolute joint about +Y, limited to +-30 deg, bistable "detent" torque applied each step
  F.hives = HIVE.hives.map(h => {
    const angle = h.startAngle * HIVE.tilt;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, h.y, HIVE.pivotZ)
      .setRotation(qAxis(0, 1, 0, angle)).setAngularDamping(0.5).setCanSleep(false)
      .setAdditionalMassProperties(HIVE.mass, { x: 0, y: 0, z: 0.1 * IN }, { x: 0.5, y: 0.35, z: 0.5 }, { w: 1, x: 0, y: 0, z: 0 }));
    const add = (desc) => { const col = world.createCollider(desc.setDensity(0).setFriction(0.3).setRestitution(0.1).setCollisionGroups(groups(GROUP.FIELD, 0xffff)), body); col.userData = { kind: 'hive', alliance: h.alliance }; };
    for (const sign of [1, -1]) {
      for (const [c, he, ax] of cellPanels(sign)) add(R.ColliderDesc.cuboid(...he).setTranslation(...c).setRotation(qAxis(1, 0, 0, ax)));
      add(R.ColliderDesc.convexHull(new Float32Array(cellEndWall(sign))));
    }
    const anchorFrame = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, h.y, HIVE.pivotZ));
    const jd = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const joint = world.createImpulseJoint(jd, anchorFrame, body, true);
    joint.setLimits(-HIVE.tilt, HIVE.tilt);
    // the joint is created at the current pose: its zero is the start angle, so remember the offset
    return { ...h, body, joint, angle0: angle, state: h.startAngle, tips: [], cells: { far: 1, audience: -1 } };
  });

  // FLOWERS: four pipes from the middle ring to the top ring, bottom ring on the floor, square post on the wall side
  F.flowers = FLOWERS.map(f => {
    const n = 4, r = FLOWER.pipeR, h = (FLOWER.topZ - FLOWER.midZ) / 2;
    // backstop above the top ring on the wall side (1.25 in tall) guides balls into the opening
    box([f.x - f.out[0] * 2.25 * IN, f.y - f.out[1] * 2.25 * IN, FLOWER.topZ + 0.625 * IN], f.out[0] ? [0.06 * IN, 2 * IN, 0.625 * IN] : [2 * IN, 0.06 * IN, 0.625 * IN], { data: { kind: 'flower' } });
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      world.createCollider(R.ColliderDesc.cylinder(h, 0.42 * IN).setTranslation(f.x + r * Math.cos(a), f.y + r * Math.sin(a), FLOWER.midZ + h)
        .setRotation(qAxis(1, 0, 0, Math.PI / 2)).setCollisionGroups(groups(GROUP.FIELD, 0xffff)), fixed).userData = { kind: 'flower' };
    }
    // bottom ring with a 2.79 in hole: four slabs
    const hr = 2.79 / 2 * IN, ro = 2.6 * IN, th = 0.43 * IN / 2;
    for (const [dx, dy, hx, hy] of [[0, (hr + ro) / 2, ro, (ro - hr) / 2], [0, -(hr + ro) / 2, ro, (ro - hr) / 2], [(hr + ro) / 2, 0, (ro - hr) / 2, hr], [-(hr + ro) / 2, 0, (ro - hr) / 2, hr]])
      box([f.x + dx, f.y + dy, th], [hx, hy, th], { data: { kind: 'flower' } });
    // wall-side square extrusion from the floor to the middle ring
    box([f.x - f.out[0] * 2.2 * IN, f.y - f.out[1] * 2.2 * IN, FLOWER.midZ / 2], [0.5 * IN, 0.5 * IN, FLOWER.midZ / 2], { data: { kind: 'flower' } });
    return f;
  });
  F.fixedBody = fixed;
  return F;
}

/** Bistable HIVE: push towards the nearest stop; record tips. Called every physics step. */
export function stepHives(F, t, dt) {
  for (const h of F.hives) {
    const a = hiveAngle(h);
    const s = Math.sign(a) || h.state;
    // over-centre (bistable) action: holding torque is largest at the stop and fades to zero in the middle, so it snaps over
    const torque = HIVE.tipTorque * Math.max(-1.2, Math.min(1.2, a / HIVE.tilt));
    h.body.applyTorqueImpulse({ x: 0, y: torque * dt, z: 0 }, true);
    if (Math.abs(a) > HIVE.tilt * 0.85 && s !== h.state) { h.state = s; h.tips.push(t); }
  }
}
export function hiveAngle(h) {
  const r = h.body.rotation(); // rotation about Y only
  return 2 * Math.atan2(r.y, r.w);
}
/** which cell (far = +1 / audience = -1, in hive-local x) is facing up */
export function upCellSign(h) { return hiveAngle(h) > 0 ? -1 : 1; }

export function initialBalls() {
  // returns [{type:'pollen'|'nectar', color:'yellow'|'red'|'blue', pos:[x,y,z]}]
  const b = [];
  for (const f of FLOWERS) for (let i = 0; i < 4; i++) b.push({ type: 'pollen', color: 'yellow', pos: [f.x, f.y, POLLEN_R + 0.2 * IN + i * 2 * POLLEN_R] });
  for (let i = 0; i < 4; i++) {
    b.push({ type: 'pollen', color: 'yellow', pos: [-FIELD_HALF + POLLEN_R + 0.1 * IN, FIELD_HALF - POLLEN_R - i * 2 * POLLEN_R - 0.2 * IN, POLLEN_R] });
    b.push({ type: 'pollen', color: 'yellow', pos: [FIELD_HALF - POLLEN_R - 0.1 * IN, -FIELD_HALF + POLLEN_R + i * 2 * POLLEN_R + 0.2 * IN, POLLEN_R] });
  }
  // 3 NECTAR in each upward-facing cell, against the back wall (towards the pivot), in a line
  for (const h of HIVE.hives) {
    const sign = h.startAngle > 0 ? -1 : 1;                 // up cell
    const ang = h.startAngle * HIVE.tilt;
    for (let i = 0; i < 3; i++) {
      const local = [sign * (HIVE.cellInner + NECTAR_R + 0.3 * IN), (i - 1) * (2 * NECTAR_R + 0.2 * IN), HIVE.cellZ0 + NECTAR_R + 0.2 * IN];
      const w = qRotate(qAxis(0, 1, 0, ang), local);
      b.push({ type: 'nectar', color: h.alliance, pos: [w[0], h.y + w[1], HIVE.pivotZ + w[2]] });
    }
  }
  return b;
}

// ------------------------------------------------------------------------------------------ visuals
/** the yellow frame panel: honeycomb print with the game name */
function logoTexture(THREE) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = 'rgba(60,45,0,0.18)'; g.lineWidth = 3;
  const R = 22, hx = R * Math.sqrt(3);
  for (let row = -1; row < 9; row++) for (let col = -1; col < 26; col++) {
    const cx = col * hx + (row % 2 ? hx / 2 : 0), cy = row * R * 1.5;
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy + R * Math.sin(a)); } g.closePath(); g.stroke();
  }
  g.fillStyle = '#1b1b1b'; g.font = '800 150px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BIOBUZZ', 512, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function buildFieldVisual(THREE, scene, F) {
  const V = { hives: [] };
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.1, ...o });
  const W = FIELD_HALF;
  // 36 grey foam tiles: slight shade differences, fine foam grain and the interlocking teeth along every seam
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const N = 2048, T = N / 6, cv =document.createElement('canvas'), bv = document.createElement('canvas');
  cv.width = cv.height = bv.width = bv.height = N;
  const g = cv.getContext('2d'), b = bv.getContext('2d'), rnd = mulberry(7);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const v = 86 + Math.round((rnd() - 0.5) * 7); g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(i * T, j * T, T, T);
  }
  b.fillStyle = '#808080'; b.fillRect(0, 0, N, N);
  for (let k = 0; k < 90000; k++) {                       // foam grain: color and height speckle
    const x = rnd() * N, y = rnd() * N, s = 1 + rnd() * 2.2, l = rnd() < 0.5;
    g.fillStyle = l ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)'; g.fillRect(x, y, s, s);
    b.fillStyle = l ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'; b.fillRect(x, y, s, s);
  }
  const seam = (ctx, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'miter';
    for (let i = 1; i < 6; i++) for (const vertical of [true, false]) {
      const p = i * T, teeth = 9, d = T * 6 / (teeth * 6) / 2, depth = 4.5;
      ctx.beginPath();
      for (let k = 0; k <= teeth * 6 * 2; k++) {
        const q = k * d, o = (k % 4 < 2 ? 1 : -1) * depth * (k % 2 ? 0.7 : 1);   // trapezoid teeth
        vertical ? (k ? ctx.lineTo(p + o, q) : ctx.moveTo(p + o, q)) : (k ? ctx.lineTo(q, p + o) : ctx.moveTo(q, p + o));
      }
      ctx.stroke();
    }
    ctx.strokeRect(width / 2, width / 2, N - width, N - width);
  };
  seam(g, 'rgba(38,41,44,0.6)', 2); seam(b, '#3a3a3a', 3);
  const tex = new THREE.CanvasTexture(cv), bump = new THREE.CanvasTexture(bv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = bump.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * W), mat(0xffffff, { map: tex, bumpMap: bump, bumpScale: 1.2, roughness: 0.93, metalness: 0, envMapIntensity: 0.45 }));
  floor.receiveShadow = true; scene.add(floor);
  // the event floor around the field: dark low-pile carpet
  const cc = document.createElement('canvas'); cc.width = cc.height = 512; const c2 = cc.getContext('2d');
  c2.fillStyle = '#26292d'; c2.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 30000; k++) { c2.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)'; c2.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5); }
  const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(24, 24); ct.anisotropy = 8;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat(0xffffff, { map: ct, roughness: 1, metalness: 0 })); outer.position.z = -0.002; outer.receiveShadow = true; scene.add(outer);
  // tape: loading zones (outline) and gardens (filled)
  const tape = (r, color, fill) => {
    const [x0, x1, y0, y1] = r, w = 1 * IN;
    const add = (cx, cy, sx, sy) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), mat(color, { roughness: 0.5 })); m.position.set(cx, cy, 0.0015); scene.add(m); };
    if (fill) add((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0);
    else { add((x0 + x1) / 2, y0 + w / 2, x1 - x0, w); add((x0 + x1) / 2, y1 - w / 2, x1 - x0, w); add(x0 + w / 2, (y0 + y1) / 2, w, y1 - y0); add(x1 - w / 2, (y0 + y1) / 2, w, y1 - y0); }
  };
  tape(ZONES.loading.red, 0xd32f2f, false); tape(ZONES.loading.blue, 0x1e64d8, false);
  tape(ZONES.garden.red, 0xd32f2f, true); tape(ZONES.garden.blue, 0x1e64d8, true);
  // alliance areas outside the field
  const area = (y, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(97 * IN, 54 * IN), mat(c, { transparent: true, opacity: 0.35 })); m.position.set(0, y, 0.001); scene.add(m); };
  area(W + 0.05 + 27 * IN, 0xd32f2f); area(-W - 0.05 - 27 * IN, 0x1e64d8);
  // walls: aluminium rail + polycarbonate
  // clear polycarbonate: almost invisible head-on, bright where it reflects the lights; brushed aluminium rail on top
  const clearPoly = (o = {}) => new THREE.MeshPhysicalMaterial({ color: 0xdcecff, transparent: true, opacity: 0.07, roughness: 0.08, metalness: 0,
    clearcoat: 0.2, clearcoatRoughness: 0.1, envMapIntensity: 0.3, specularIntensity: 0.45, depthWrite: false, side: THREE.DoubleSide, ...o });
  const poly = clearPoly(), alu = new THREE.MeshStandardMaterial({ color: 0xd3d6d9, metalness: 1, roughness: 0.32 });
  for (const [x, y, sx, sy] of [[W + IN / 2, 0, IN, 2 * W + 2 * IN], [-W - IN / 2, 0, IN, 2 * W + 2 * IN], [0, W + IN / 2, 2 * W, IN], [0, -W - IN / 2, 2 * W, IN]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, WALL_H), poly); p.position.set(x, y, WALL_H / 2); scene.add(p);
    const r = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.6 * IN, sy + 0.6 * IN, 1.2 * IN), alu); r.position.set(x, y, WALL_H); scene.add(r);
  }
  // HIVE frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.3 });
  // Figure 9-8: two upright A-frames of square tube, 38.95 in deep at the base, 49.46 in apart, joined at the top by the crossbar
  for (const sy of [1, -1]) {
    for (const sx of [1, -1]) {
      const a = new THREE.Vector3(sx * FRAME.halfDepth, sy * FRAME.halfWidth, 0), b = new THREE.Vector3(0, sy * FRAME.halfWidth, HIVE.pivotZ);
      const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(1 * IN, len, 1 * IN), frameMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(m);
    }
    // dark mounting strip along the base of each A-frame (it sits under the tiles; only its edge shows)
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2 * FRAME.halfDepth, 1.5 * IN), mat(0x34373b, { roughness: 0.9 }));
    strip.position.set(0, sy * FRAME.halfWidth, 0.003); scene.add(strip);
    // yellow BIOBUZZ panel between the legs, just under the apex
    const z0 = HIVE.pivotZ - 17 * IN, z1 = HIVE.pivotZ - 5 * IN, w = (z) => FRAME.halfDepth * (1 - z / HIVE.pivotZ) - 0.6 * IN;
    const s = new THREE.Shape([new THREE.Vector2(-w(z0), z0), new THREE.Vector2(w(z0), z0), new THREE.Vector2(w(z1), z1), new THREE.Vector2(-w(z1), z1)]);
    const g = new THREE.ShapeGeometry(s), uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w(z0)) / (2 * w(z0)), (p.getY(i) - z0) / (z1 - z0));
    const panel = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: logoTexture(THREE), side: THREE.DoubleSide, roughness: 0.6 }));
    panel.rotation.x = Math.PI / 2; panel.position.y = sy * (FRAME.halfWidth + 0.55 * IN); scene.add(panel);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5 * IN, 2 * FRAME.halfWidth + 2 * IN, 1.5 * IN), frameMat); bar.position.set(0, 0, HIVE.pivotZ + 1.5 * IN); scene.add(bar);
  // HIVES with AprilTag clusters
  const loader = new THREE.TextureLoader();
  for (const h of F.hives) {
    const grp = new THREE.Group(); scene.add(grp);
    const color = h.alliance === 'red' ? 0xd32f2f : 0x1e64d8;
    const clear = clearPoly({ opacity: 0.12 }), edge = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    // pentagon outline in the hive's Y-Z plane; built in a 2D shape (x = hive Y, y = hive Z) and turned so the extrusion runs along hive X
    const toYZ = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    const shape = (pts) => { const s = new THREE.Shape(); pts.forEach(([y, z], i) => i ? s.lineTo(y, z) : s.moveTo(y, z)); s.closePath(); return s; };
    const rimT = 0.25 * IN;
    for (const sign of [1, -1]) {
      // clear polycarbonate floor, sides and gable roof
      for (const [c, he, ax, part] of cellPanels(sign)) {
        if (part === 'lip') continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(2 * he[0], 2 * he[1], 2 * he[2]), clear);
        m.position.set(...c); m.rotation.x = ax; grp.add(m);
      }
      // closed inner end: a clear pentagon panel
      const end = new THREE.Mesh(new THREE.ShapeGeometry(shape(cellPentagon())), clear);
      end.applyMatrix4(toYZ); end.position.x = sign * HIVE.cellInner; grp.add(end);
      // red plate rims (Figure 9-11) around both ends: pentagon ring, about 1 in wide
      for (const x of [HIVE.cellInner, HIVE.cellOuter]) {
        const ring = shape(cellPentagon(1 * IN)); ring.holes.push(new THREE.Path(cellPentagon().map(([y, z]) => new THREE.Vector2(y, z)).reverse()));
        const g = new THREE.ExtrudeGeometry(ring, { depth: rimT, bevelEnabled: false }); g.translate(0, 0, -rimT / 2);
        const m = new THREE.Mesh(g, edge); m.applyMatrix4(toYZ); m.position.x = sign * x; grp.add(m);
      }
      // square arm from the pivot to the floor of the cell, with the mounting tab
      const arm = new THREE.Mesh(new THREE.BoxGeometry(HIVE.cellOuter - 2 * IN, 1 * IN, 1 * IN), frameMat);
      arm.position.set(sign * (HIVE.cellOuter / 2 + 1 * IN), 0, HIVE.cellZ0 - 0.75 * IN); grp.add(arm);
      const first = sign > 0 ? h.tags.far : h.tags.audience;
      const { tags } = cellTags(sign, first);
      const white = new THREE.Mesh(new THREE.PlaneGeometry(17 * IN, 5.5 * IN), mat(0xffffff));
      white.position.set(tags[0].pos[0], 0, tags[0].pos[2] + 0.02 * IN); white.rotation.x = Math.PI; grp.add(white);
      for (const tg of tags) {
        const tx = loader.load(`assets/tags/tag36_11_${String(tg.id).padStart(5, '0')}.png`);
        tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace;
        const s = tg.size * 10 / 8;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: tx }));
        // plane normal must face -z_into (down); image x -> tag x_right, image up -> -y_down
        const xr = new THREE.Vector3(...tg.axes[0]), up = new THREE.Vector3(...tg.axes[1]).negate(), n = new THREE.Vector3(...tg.axes[2]).negate();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xr, up, n));
        m.position.set(...tg.pos); grp.add(m);
      }
    }
    // pivot hub on the frame axis and the two dampers that slow the tip (Figure 9-9)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * IN, 1.1 * IN, 3 * IN, 24), frameMat); grp.add(hub);
    for (const s of [1, -1]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * IN, 0.35 * IN, 6 * IN, 12), mat(0x30343a, { metalness: 0.6, roughness: 0.4 }));
      d.rotation.z = Math.PI / 2 + s * 0.35; d.position.set(s * 3.2 * IN, 0.9 * IN, -1.2 * IN); grp.add(d);
    }
    V.hives.push({ h, grp });
  }
  // FLOWERS
  const green = mat(0x55b43a), orange = mat(0xd98e2a), black = mat(0x222222);
  // Figure 9-12: chamfered square plates with round holes, four green HIPS pipes, curved backstop on the wall side
  const plate = (holeR, thick, color, o = {}) => {
    const h = 2.45 * IN, c = 0.75 * IN, s = new THREE.Shape([[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]].map(([x, y]) => new THREE.Vector2(x, y)));
    s.holes.push(new THREE.Path().absarc(0, 0, holeR, 0, Math.PI * 2, true));
    return new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 24 }), mat(color, o));
  };
  const gold = mat(0xd9a441, { metalness: 0.5, roughness: 0.4 }), grey = mat(0x9ea3a8, { metalness: 0.8, roughness: 0.35 });
  for (const f of F.flowers) {
    const r = FLOWER.pipeR, hh = FLOWER.topZ - FLOWER.midZ, wall = Math.atan2(-f.out[1], -f.out[0]);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, m = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * IN, 0.42 * IN, hh, 16), green);
      m.rotation.x = Math.PI / 2; m.position.set(f.x + r * Math.cos(a), f.y + r * Math.sin(a), FLOWER.midZ + hh / 2); scene.add(m);
    }
    const top = plate(2.0 * IN, 0.25 * IN, 0xd9a441); top.material = gold; top.position.set(f.x, f.y, FLOWER.topZ - 0.25 * IN); scene.add(top);
    const mid = plate(1.6 * IN, 0.4 * IN, 0x1e1f21); mid.position.set(f.x, f.y, FLOWER.midZ - 0.4 * IN); scene.add(mid);
    const low = plate(2.79 / 2 * IN, 0.43 * IN, 0x1e1f21); low.position.set(f.x, f.y, 0); scene.add(low);
    // backstop: 1.25 in curved plate above the top ring, on the wall side
    const arc = 2.6, bs = new THREE.Mesh(new THREE.CylinderGeometry(2.25 * IN, 2.25 * IN, 1.25 * IN, 24, 1, true, wall + Math.PI / 2 - arc / 2, arc), mat(0x6f6488, { side: THREE.DoubleSide, metalness: 0.4 }));
    bs.rotation.x = Math.PI / 2; bs.position.set(f.x, f.y, FLOWER.topZ + 0.625 * IN); scene.add(bs);
    // grey square extrusion from the bottom ring up to the middle ring, wall side, and the base plate under it
    const post = new THREE.Mesh(new THREE.BoxGeometry(IN, IN, FLOWER.midZ), grey); post.position.set(f.x - f.out[0] * 2.2 * IN, f.y - f.out[1] * 2.2 * IN, FLOWER.midZ / 2); scene.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(f.out[0] ? 2.6 * IN : 5.4 * IN, f.out[0] ? 5.4 * IN : 2.6 * IN, 0.12 * IN), grey);
    foot.position.set(f.x - f.out[0] * 1.6 * IN, f.y - f.out[1] * 1.6 * IN, 0.06 * IN); scene.add(foot);
  }
  V.update = () => { for (const { h, grp } of V.hives) { const p = h.body.translation(), r = h.body.rotation(); grp.position.set(p.x, p.y, p.z); grp.quaternion.set(r.x, r.y, r.z, r.w); } };
  return V;
}

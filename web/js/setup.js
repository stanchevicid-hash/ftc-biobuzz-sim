// "Robot" tab: load the user's robot (STEP / GLB / glTF / URDF + meshes / saved JSON), auto-detect parts, mark it up,
// check the 18 in starting size, save / export the configuration.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MOTORS, SERVOS, motorFromSku, servoFromSku } from './motors.js';
import { DEMO_ROBOT } from './robots/demo.js';
import { robotExtents } from './sim.js';
import { setRobot } from './main.js';
import { inspectStatic, inspectDynamic } from './inspect.js';

const IN = 0.0254, LIMIT = 18 * IN;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;

// ------------------------------------------------------------------ tiny IndexedDB store for the model (can be large)
const idb = {
  db: () => new Promise((res, rej) => { const r = indexedDB.open('ftcsim', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
  async set(k, v) { const d = await this.db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(k) { const d = await this.db(); return new Promise((res) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); },
};

// ------------------------------------------------------------------ part detection (names, goBILDA / REV part numbers)
export function detectRole(name) {
  const n = String(name);
  if (/wheel|mecanum|omni|gripforce|traction|3213-|3614-|3606-|3607-|3616-/i.test(n) && !/hub(?!\s*motor)|spacer|axle|shaft/i.test(n)) {
    const type = /omni|3613-|3607-/i.test(n) ? 'omni' : /traction|grip(?!force)|rhino|3614-/i.test(n) ? 'traction' : 'mecanum';
    return { role: 'wheel', type };
  }
  if (/limelight/i.test(n)) return { role: 'sensor', type: 'limelight' };
  if (/webcam|camera|c270|c920|c922|arducam/i.test(n)) return { role: 'sensor', type: 'webcam' };
  if (/colou?r.?sensor|31-1557|31-1154/i.test(n)) return { role: 'sensor', type: 'color' };
  if (/distance|31-1505|\btof\b|2m.?sensor/i.test(n)) return { role: 'sensor', type: 'distance' };
  if (/touch|31-1425|limit.?switch/i.test(n)) return { role: 'sensor', type: 'touch' };
  if (/pinpoint|3110-0002/i.test(n)) return { role: 'sensor', type: 'pinpoint' };
  const m = motorFromSku(n); if (m && !/servo/i.test(n)) return { role: 'motor', model: m };
  const s = servoFromSku(n); if (s) return { role: 'servo', model: s };
  if (/control.?hub|31-1595|expansion.?hub/i.test(n)) return { role: 'chassis', hub: true };
  return { role: 'chassis' };
}

// ------------------------------------------------------------------ loaders -> { parts:[{name, mesh(Object3D in model units)}], urdf? }
async function parseStep(buf, progress) {
  progress('Loading the STEP reader (8 MB). Big assemblies take a few minutes.', 0.2);
  const res = await new Promise((resolve, reject) => {
    const w = new Worker('js/step-worker.js');
    let t = 0.2; const tick = setInterval(() => progress(`Reading STEP… ${Math.round(t * 100)}%`, t = Math.min(0.9, t + 0.01)), 1000);
    w.onmessage = (e) => { if (e.data.progress) return; clearInterval(tick); w.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data); };
    w.onerror = (e) => { clearInterval(tick); w.terminate(); reject(new Error(e.message || 'worker error')); };
    w.postMessage(buf, [buf]);
  });
  progress('Building meshes…', 0.95);
  const parts = res.meshes.map((m, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3)); else g.computeVertexNormals();
    if (m.index) g.setIndex(new THREE.BufferAttribute(m.index, 1));
    const c = m.color ? new THREE.Color(...m.color) : new THREE.Color(0x9aa0a6);
    const segs = m.path ? m.path.split(' / ') : [];
    const name = m.name || segs[segs.length - 1] || `part ${i + 1}`;
    return { name, path: m.path || name, mesh: new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.6 })) };
  });
  return { parts, unit: 1 };   // already in meters
}
async function parseGltf(buf) {
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    let n = o, name = '';
    while (n && !name) { name = n.name; n = n.parent; }
    const m = o.clone(); m.geometry = o.geometry.clone().applyMatrix4(o.matrixWorld); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    parts.push({ name: name || `part ${parts.length + 1}`, mesh: m });
  });
  return { parts, unit: 1 };
}
function parseVec(s, d = [0, 0, 0]) { return s ? s.trim().split(/\s+/).map(Number) : d; }
async function parseUrdf(text, files) {
  const x = new DOMParser().parseFromString(text, 'application/xml');
  const links = {}, joints = [];
  for (const l of x.querySelectorAll('robot > link')) {
    const inert = l.querySelector('inertial');
    links[l.getAttribute('name')] = { name: l.getAttribute('name'), el: l, mass: inert ? +inert.querySelector('mass')?.getAttribute('value') || 0 : 0,
      com: inert ? parseVec(inert.querySelector('origin')?.getAttribute('xyz')) : [0, 0, 0] };
  }
  for (const j of x.querySelectorAll('robot > joint')) joints.push({ name: j.getAttribute('name'), type: j.getAttribute('type'), parent: j.querySelector('parent').getAttribute('link'),
    child: j.querySelector('child').getAttribute('link'), xyz: parseVec(j.querySelector('origin')?.getAttribute('xyz')), rpy: parseVec(j.querySelector('origin')?.getAttribute('rpy')),
    axis: parseVec(j.querySelector('axis')?.getAttribute('xyz'), [1, 0, 0]), lower: +(j.querySelector('limit')?.getAttribute('lower') ?? 0), upper: +(j.querySelector('limit')?.getAttribute('upper') ?? 0) });
  const childOf = Object.fromEntries(joints.map(j => [j.child, j]));
  const root = Object.keys(links).find(n => !childOf[n]);
  const world = {};
  const tf = (name) => {
    if (world[name]) return world[name];
    const j = childOf[name], m = new THREE.Matrix4();
    if (j) { m.copy(tf(j.parent)); m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...j.xyz), new THREE.Quaternion().setFromEuler(new THREE.Euler(j.rpy[0], j.rpy[1], j.rpy[2], 'ZYX')), new THREE.Vector3(1, 1, 1))); }
    return (world[name] = m);
  };
  const stl = new STLLoader(), parts = [];
  for (const L of Object.values(links)) {
    for (const v of L.el.querySelectorAll('visual')) {
      const o = v.querySelector('origin'), geo = v.querySelector('geometry > *');
      const local = new THREE.Matrix4().compose(new THREE.Vector3(...parseVec(o?.getAttribute('xyz'))), new THREE.Quaternion().setFromEuler(new THREE.Euler(...parseVec(o?.getAttribute('rpy')), 'ZYX')), new THREE.Vector3(1, 1, 1));
      let g = null;
      if (geo.tagName === 'box') { const s = parseVec(geo.getAttribute('size')); g = new THREE.BoxGeometry(...s); }
      else if (geo.tagName === 'cylinder') { g = new THREE.CylinderGeometry(+geo.getAttribute('radius'), +geo.getAttribute('radius'), +geo.getAttribute('length'), 24); g.rotateX(Math.PI / 2); }
      else if (geo.tagName === 'sphere') g = new THREE.SphereGeometry(+geo.getAttribute('radius'), 20, 14);
      else if (geo.tagName === 'mesh') {
        const fn = geo.getAttribute('filename').split('/').pop(), f = files.find(ff => ff.name.toLowerCase() === fn.toLowerCase());
        if (f && /\.stl$/i.test(fn)) { g = stl.parse(await f.arrayBuffer()); const sc = parseVec(geo.getAttribute('scale'), [1, 1, 1]); g.scale(...sc); }
      }
      if (!g) continue;
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(tf(L.name), local));
      parts.push({ name: L.name, urdfLink: L.name, mesh: new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.3, roughness: 0.6 })) });
    }
  }
  return { parts, unit: 1, urdf: { links, joints, root, tf } };
}

// ------------------------------------------------------------------ state of the markup screen
const S = { model: null, parts: [], cfg: null, opts: { unit: 1, up: 'z', fwd: '+y' } };

function orientMatrix(o) {
  // model axes -> robot frame (X right, Y forward, Z up)
  const m = new THREE.Matrix4();
  if (o.up === 'y') m.makeRotationX(Math.PI / 2);          // Y-up models (glTF): +Y -> +Z
  const f = { '+y': 0, '-y': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[o.fwd] ?? 0;
  return new THREE.Matrix4().makeRotationZ(f).multiply(m).multiply(new THREE.Matrix4().makeScale(o.unit, o.unit, o.unit));
}
function bboxOf(geo) { geo.computeBoundingBox(); return geo.boundingBox; }

/** CAD tools export in m, mm, cm or in, and files rarely say which. An FTC robot is 0.15-1.2 m across,
 *  so take the first unit (file format's own first) that puts the model in that range. */
function guessUnit(parts, preferred) {
  const all = new THREE.Box3();
  for (const p of parts) all.union(bboxOf(p.mesh.geometry));
  const size = all.getSize(new THREE.Vector3()), d = Math.max(size.x, size.y, size.z);
  if (!(d > 0)) return preferred;
  const order = [preferred, 1, 0.001, 0.0254, 0.01].filter((u, i, a) => a.indexOf(u) === i);
  return order.find(u => d * u >= 0.15 && d * u <= 1.2) ?? preferred;
}
const TURN90 = { '+y': '+x', '+x': '-y', '-y': '-x', '-x': '+y' };
const UNIT_NAME = { 1: 'meters', 0.001: 'millimeters', 0.01: 'centimeters', 0.0254: 'inches' };

/** bake orientation/units, put the robot origin on the floor under the bbox center, measure each part */
function normalize() {
  const M = orientMatrix(S.opts);
  const all = new THREE.Box3();
  for (const p of S.parts) { p.geo = p.mesh.geometry.clone().applyMatrix4(M); p.box = bboxOf(p.geo); all.union(p.box); }
  const c = all.getCenter(new THREE.Vector3());
  S.shiftVec = new THREE.Vector3(-c.x, -c.y, -all.min.z);
  const shift = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -all.min.z);
  for (const p of S.parts) { p.geo.applyMatrix4(shift); p.box = bboxOf(p.geo); p.center = p.box.getCenter(new THREE.Vector3()).toArray(); p.size = p.box.getSize(new THREE.Vector3()).toArray(); }
  S.bounds = new THREE.Box3(); for (const p of S.parts) S.bounds.union(p.box);
}

/** first guess of the configuration from the detected parts */
function autoConfig(baseName) {
  for (const p of S.parts) { const d = detectRole((p.path || '') + ' / ' + p.name); p.role = d.role; p.det = d; p.link = 'chassis'; }
  // URDF: movable joints become links, continuous joints whose child looks like a wheel become wheels
  const joints = [];
  if (S.urdf) {
    for (const j of S.urdf.joints) {
      const childParts = S.parts.filter(p => p.urdfLink === j.child);
      if (j.type === 'continuous' && /wheel/i.test(j.child)) { childParts.forEach(p => { p.role = 'wheel'; p.det = { role: 'wheel', type: /omni/i.test(j.child) ? 'omni' : /mecanum/i.test(j.child) ? 'mecanum' : 'traction' }; }); continue; }
      if (j.type === 'revolute' || j.type === 'prismatic' || j.type === 'continuous') {
        const M = orientMatrix(S.opts), pos = new THREE.Vector3().setFromMatrixPosition(S.urdf.tf(j.child)).applyMatrix4(M).add(S.shiftVec);
        const ax = new THREE.Vector3(...j.axis).applyMatrix4(new THREE.Matrix4().extractRotation(S.urdf.tf(j.child))).applyMatrix4(new THREE.Matrix4().extractRotation(M)).normalize();
        const id = j.name.replace(/\W+/g, '_');
        joints.push({ id, parent: 'chassis', type: j.type === 'prismatic' ? 'prismatic' : 'revolute', anchor: [pos.x, pos.y, pos.z].map(v => +v.toFixed(4)), axis: ax.toArray().map(v => +v.toFixed(4)),
          limits: j.type === 'continuous' ? null : [j.lower, j.upper], mass: S.urdf.links[j.child]?.mass || 0.3, actuator: { kind: 'motor', name: id, model: 'gobilda-117', ratio: 1 } });
        childParts.forEach(p => { p.role = 'link'; p.link = id; });
      }
    }
  }
  // wheels: group by quadrant, one wheel per quadrant (largest part)
  const wheelParts = S.parts.filter(p => p.role === 'wheel');
  const quad = {}; for (const p of wheelParts) { const k = (p.center[1] >= 0 ? 'front' : 'back') + (p.center[0] < 0 ? 'Left' : 'Right'); (quad[k] ||= []).push(p); }
  const motorsIn = S.parts.filter(p => p.role === 'motor');
  const wheels = Object.entries(quad).map(([k, ps]) => {
    const b = new THREE.Box3(); ps.forEach(p => b.union(p.box));
    const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    const near = motorsIn.map(m => ({ m, d: Math.hypot(m.center[0] - c.x, m.center[1] - c.y) })).sort((a, b) => a.d - b.d)[0];
    const left = c.x < 0, front = c.y >= 0;
    ps.forEach(p => p.wheel = k);
    return { motor: k, model: near ? near.m.det.model : 'gobilda-312', type: ps[0].det.type, pos: [c.x, c.y, sz.z / 2], radius: sz.z / 2, width: sz.x,
      roller: (front === left) ? 1 : -1, motorDir: left ? -1 : 1 };
  });
  const sensors = [{ name: 'imu', type: 'imu' }];
  const sc = {}; for (const p of S.parts.filter(p => p.role === 'sensor')) {
    const t = p.det.type; sc[t] = (sc[t] || 0) + 1;
    const nm = t === 'webcam' ? `Webcam ${sc[t]}` : t === 'limelight' ? 'limelight' : t === 'pinpoint' ? 'pinpoint' : `${t}${sc[t] > 1 ? sc[t] : ''}Sensor`;
    sensors.push({ name: nm, type: t, link: 'chassis', pos: p.center, yaw: 0, pitch: t === 'webcam' ? 15 : 0, part: p.name });
  }
  const servos = S.parts.filter(p => p.role === 'servo').map((p, i) => ({ name: `servo${i}`, model: p.det.model, kind: 'servo', part: p.name }));
  const ch = chassisBox();
  const totalMass = S.urdf ? Object.values(S.urdf.links).reduce((s, l) => s + (l.mass || 0), 0) : 0;
  S.cfg = {
    name: baseName || 'My robot', version: 1, source: S.fileName,
    chassis: { size: ch.size, clearance: ch.clearance, mass: totalMass > 0 ? totalMass - joints.reduce((s, j) => s + j.mass, 0) : 12, com: [ch.c[0], ch.c[1], ch.clearance + ch.size[2] * 0.35],
      colliders: [{ c: ch.c, h: ch.size.map(x => x / 2) }] },
    wheels, motors: joints.filter(j => j.actuator.kind === 'motor').map(j => ({ name: j.actuator.name, model: j.actuator.model, load: { type: 'joint', joint: j.id, ratio: j.actuator.ratio } })),
    servos, joints: joints.map(({ actuator, ...j }) => j), holders: [], launchers: [], sensors,
    visual: { type: 'model' },
  };
}
function chassisBox() {
  const b = new THREE.Box3();
  for (const p of S.parts) if (p.role !== 'wheel' && p.link === 'chassis') b.union(p.box);
  if (b.isEmpty()) b.copy(S.bounds);
  const wheelTop = Math.max(0.02, ...S.parts.filter(p => p.role === 'wheel').map(p => p.box.min.z + 0.01));
  const clearance = Math.max(0.01, Math.min(b.min.z, 0.06));
  const size = b.getSize(new THREE.Vector3()).toArray(); size[2] = Math.max(0.03, b.max.z - clearance);
  const c = b.getCenter(new THREE.Vector3()).toArray(); c[2] = clearance + size[2] / 2;
  return { size: size.map(v => +v.toFixed(4)), c: c.map(v => +v.toFixed(4)), clearance: +clearance.toFixed(4), wheelTop };
}

/** visual for the simulator: parts baked in robot frame, wheels spin about their axle, links follow their bodies */
function makeModelVisual() {
  const parts = S.parts.map(p => ({ name: p.name, role: p.role, link: p.link, wheel: p.wheel, geo: p.geo, mat: p.mesh.material }));
  return {
    build(THREE_, robot) {
      const root = new THREE.Group(), links = {}, spins = [];
      for (const id of Object.keys(robot.links)) links[id] = new THREE.Group();
      for (const p of parts) {
        if (p.role === 'ignore') continue;
        const mesh = new THREE.Mesh(p.geo, p.mat); mesh.castShadow = true;
        if (p.role === 'wheel' && p.wheel) {
          const w = robot.wheels.find(x => x.motor === p.wheel) || robot.wheels.find(x => x.cfgName === p.wheel);
          if (w) { const g = new THREE.Group(); g.position.set(...w.pos); mesh.position.set(-w.pos[0], -w.pos[1], -w.pos[2]); g.add(mesh); root.add(g); spins.push({ g, w }); continue; }
        }
        (p.link && links[p.link] ? links[p.link] : root).add(mesh);
      }
      return { root, links, update(r) { for (const { g, w } of spins) g.rotation.x = -w.angle; } };
    },
  };
}

/** bake the marked-up model into a GLB (base64) + per-part metadata, so one file can be shared with the team */
async function packModel() {
  const scene = new THREE.Scene();
  S.parts.forEach((p, i) => { const m = new THREE.Mesh(p.geo, p.mesh.material); m.name = i + '|' + p.name; scene.add(m); });
  const glb = new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }));
  let bin = ''; for (let i = 0; i < glb.length; i += 0x8000) bin += String.fromCharCode.apply(null, glb.subarray(i, i + 0x8000));
  return { glb: btoa(bin), parts: S.parts.map(p => ({ name: p.name, role: p.role, link: p.link, wheel: p.wheel })) };
}
/** apply a config + model: the (large) model goes to IndexedDB, the config to localStorage */
async function applyWithModel(cfg, packed) {
  if (packed) { await idb.set('model', packed.glb); cfg = { ...cfg, visual: { type: 'model', parts: packed.parts } }; }
  setRobot(cfg, makeModelVisual());
}

// ------------------------------------------------------------------ UI
export function initRobotTab(app, el) {
  el.innerHTML = `
    <div class="card"><b id="rbName"></b><div id="rbSummary" class="hidden"></div>
      <div class="row small" title="How the Control Hub sits on the real robot. Must match RevHubOrientationOnRobot in your code, or the IMU reads wrong angles, like on the real robot.">Hub logo <select id="rbHubLogo"><option>UP</option><option>DOWN</option><option>FORWARD</option><option>BACKWARD</option><option>LEFT</option><option>RIGHT</option></select>
        USB <select id="rbHubUsb"><option>UP</option><option>DOWN</option><option>FORWARD</option><option>BACKWARD</option><option>LEFT</option><option>RIGHT</option></select></div>
      <div class="row"><button id="rbDemo">Demo robot</button><button id="rbExport">Export</button>
      <label class="filebtn">Import<input type="file" id="rbImport" accept=".json" hidden></label><button id="rbJsonBtn">JSON</button></div>
      <textarea id="rbJson" class="hidden" style="width:100%;height:260px;font:11px Consolas,monospace"></textarea>
      <div class="row hidden" id="rbJsonRow"><button id="rbJsonApply" class="primary">Apply JSON</button></div></div>
    <div class="card insp-card"><div class="insp-head"><b>Inspection</b><span id="rbInspTally" class="insp-tally"></span><button id="rbInspRun">Run again</button></div>
      <ul id="rbInsp" class="insp"></ul><div id="rbInspState" class="small"></div></div>
    <div class="card"><b>Your robot</b>
      <div class="drop" id="rbDrop" title="STEP from Onshape, SolidWorks or Fusion; GLB/glTF (Onshape: right-click the assembly, Export, GLTF); URDF with its STL files; or a saved .json">
        <label class="filebtn" >Load CAD<input type="file" id="rbFile" multiple hidden accept=".step,.stp,.glb,.gltf,.urdf,.stl,.json"></label></div>
      <progress id="rbProg" class="hidden" max="1" value="0"></progress><div id="rbStatus" class="small"></div>
    </div>
    <div id="rbMarkup" class="hidden">
      <div class="card"><b>1. Orientation and units</b>
        <div class="row"><label>Units <select id="rbUnit">${opt(1, 'meters')}${opt(0.001, 'millimeters')}${opt(0.01, 'centimeters')}${opt(0.0254, 'inches')}</select></label>
        <label>Up axis <select id="rbUp">${opt('z', 'Z (Onshape, STEP)')}${opt('y', 'Y (glTF)')}</select></label>
        <label>Robot forward <select id="rbFwd">${opt('+y', '+Y')}${opt('-y', '−Y')}${opt('+x', '+X')}${opt('-x', '−X')}</select></label>
        <button id="rbReorient">Apply</button></div><div id="rbBounds" class="small"></div>
        <div class="rb-views"><figure><canvas id="rbTop" width="320" height="320"></canvas><figcaption>Top view: the arrow must point to the robot's front</figcaption></figure>
        <figure><canvas id="rbSide" width="320" height="320"></canvas><figcaption>Left side view: wheels must be at the bottom</figcaption></figure></div>
        <div class="row"><button id="rbTurn90" title="Rotate the model a quarter turn">Turn 90°</button><button id="rbTurn180" title="Swap front and back">Turn 180°</button></div></div>
      <div class="card"><b>2. Parts</b>
        <div class="parts"><table class="t" id="rbParts"></table></div></div>
      <div class="card"><b>3. Drive wheels and motors</b> <span class="small">Names are the hardwareMap names.</span><table class="t" id="rbWheels"></table></div>
      <div class="card"><b>4. Joints (arm, lift, turret…)</b><table class="t" id="rbJoints"></table><div class="row"><button id="rbAddJoint">Add joint</button></div></div>
      <div class="card"><b>5. Sensors</b><table class="t" id="rbSensors"></table><div class="row"><select id="rbSensType">${['imu', 'distance', 'color', 'touch', 'webcam', 'limelight', 'pinpoint', 'analog'].map(t => opt(t, t)).join('')}</select><button id="rbAddSensor">Add sensor</button></div></div>
      <div class="card"><b>6. Game mechanisms</b>
        <div class="row"><label class="chk"><input type="checkbox" id="mIntake"> Front intake, motor <input type="text" id="mIntakeMotor" value="intake" size="8"> holds up to <input type="number" id="mIntakeCap" value="4" style="width:44px"> balls</label></div>
        <div class="row"><label class="chk"><input type="checkbox" id="mShooter"> Shooter: flywheel motor <input type="text" id="mFly" value="shooter" size="8"> feeder servo <input type="text" id="mFeed" value="feeder" size="7"> hood servo (optional) <input type="text" id="mHood" value="" size="6"></label></div>
        <div class="row small">Exit point in robot frame, m <input type="text" id="mExit" value="0, 0.05, 0.4" size="14"> pitch range, ° <input type="text" id="mPitch" value="25, 65" size="7"></div></div>
      <div class="card"><b>7. Mass</b><div class="row"><label>Chassis mass, kg <input type="number" id="rbMass" step="0.1" style="width:80px"></label>
        <label>Center of mass (x, y, z), m <input type="text" id="rbCom" size="18"></label><label>Name <input type="text" id="rbNameIn" size="18"></label></div></div>
      <div class="row"><button id="rbApply" class="primary">Use this robot</button><span id="rbApplyMsg" class="small"></span></div>
    </div>`;
  const $ = (id) => el.querySelector('#' + id);

  const summary = () => {
    const c = app.robotCfg;
    $('rbName').textContent = c.name;
    $('rbSummary').textContent = `${(c.wheels || []).length + (c.motors || []).length} motors, ${(c.servos || []).length} servos, ${(c.sensors || []).length} sensors`;
    $('rbSummary').title = 'hardwareMap names: ' + [...(c.wheels || []).map(w => w.motor), ...(c.motors || []).map(m => m.name), ...(c.servos || []).map(s => s.name), ...(c.sensors || []).map(s => s.name)].join(', ');
    inspect();
  };
  // static checks are instant; test drives build their own throw-away worlds, so a newer run simply supersedes an older one
  let inspRun = 0;
  const ORDER = { fail: 0, warn: 1, pass: 2, info: 3 };
  const showInsp = (rows) => {
    rows = [...rows].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    $('rbInsp').innerHTML = rows.map(r => `<li class="insp-${r.level}" title="${esc(r.detail)}"><span class="insp-dot" aria-label="${r.level}"></span><div><b>${esc(r.title)}</b>${r.detail ? `<span>${esc(r.detail)}</span>` : ''}</div></li>`).join('');
    const ok = rows.filter(r => r.level === 'pass' || r.level === 'info').length;
    if (ok) $('rbInsp').insertAdjacentHTML('beforeend', `<li class="insp-more"><span class="insp-dot"></span><div><b>${ok} passed</b></div></li>`);
    $('rbInsp').querySelectorAll('li').forEach(li => li.onclick = () => li.classList.contains('insp-more') ? $('rbInsp').classList.toggle('all') : li.classList.toggle('open'));
    const n = (l) => rows.filter(r => r.level === l).length;
    $('rbInspTally').innerHTML = n('fail') ? `<span class="badc">${n('fail')} to fix</span>` : n('warn') ? `<span class="warnc">${n('warn')} to check</span>` : '<span class="okc">Ready</span>';
  };
  const inspect = async () => {
    const id = ++inspRun, c = app.robotCfg;
    let rows;
    try { rows = inspectStatic(c); } catch (e) { rows = [{ level: 'fail', title: 'Inspection could not read this robot', detail: e.message }]; }
    showInsp(rows);
    $('rbInspState').textContent = 'Test driving…';
    await new Promise(r => setTimeout(r, 50));
    if (id !== inspRun) return;
    try {
      const dyn = await inspectDynamic(app.R, c, (msg) => { if (id === inspRun) $('rbInspState').textContent = msg + '…'; });
      if (id !== inspRun) return;
      showInsp([...rows, ...dyn]);
      $('rbInspState').textContent = '';
    } catch (e) { if (id === inspRun) $('rbInspState').textContent = 'Test drive failed: ' + e.message; }
  };
  $('rbInspRun').onclick = inspect;
  summary();
  app.onRobotChanged = summary;
  const imuCfg = () => (app.robotCfg.sensors || []).find(x => x.type === 'imu');
  const showHub = () => { const i = imuCfg() || {}; $('rbHubLogo').value = i.hubLogo || 'UP'; $('rbHubUsb').value = i.hubUsb || 'FORWARD'; };
  showHub();
  $('rbHubLogo').onchange = $('rbHubUsb').onchange = () => {
    const logo = $('rbHubLogo').value, usb = $('rbHubUsb').value;
    const opposite = { UP: 'DOWN', DOWN: 'UP', FORWARD: 'BACKWARD', BACKWARD: 'FORWARD', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    if (logo === usb || opposite[logo] === usb) { alert('The logo and the USB ports cannot face the same or opposite directions.'); showHub(); return; }
    const cfg = JSON.parse(JSON.stringify(app.robotCfg));
    let i = (cfg.sensors ||= []).find(x => x.type === 'imu'); if (!i) { i = { name: 'imu', type: 'imu' }; cfg.sensors.push(i); }
    i.hubLogo = logo; i.hubUsb = usb;
    setRobot(cfg, app.robotModel);
  };

  $('rbDemo').onclick = () => { setRobot(DEMO_ROBOT); summary(); };
  $('rbExport').onclick = async () => {
    const cfg = JSON.parse(JSON.stringify(app.robotCfg));
    if (app.robotModel && S.parts.length) { const p = await packModel(); cfg.visual = { type: 'model', glb: p.glb, parts: p.parts }; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 1)], { type: 'application/json' }));
    a.download = (cfg.name || 'robot').replace(/[^\w-]+/g, '_') + '.ftcsim.json'; a.click();
  };
  $('rbImport').onchange = async (e) => { const f = e.target.files[0]; if (f) await importJson(await f.text()); e.target.value = ''; };
  $('rbJsonBtn').onclick = () => { $('rbJson').classList.toggle('hidden'); $('rbJsonRow').classList.toggle('hidden'); $('rbJson').value = JSON.stringify({ ...app.robotCfg, visual: app.robotCfg.visual?.glb ? { ...app.robotCfg.visual, glb: '(embedded)' } : app.robotCfg.visual }, null, 1); };
  $('rbJsonApply').onclick = () => { try { const c = JSON.parse($('rbJson').value); if (c.visual?.glb === '(embedded)') c.visual = app.robotCfg.visual; setRobot(c, app.robotModel); summary(); } catch (e) { alert('JSON: ' + e.message); } };

  async function importJson(text) {
    const cfg = JSON.parse(text);
    if (cfg.visual?.glb) {
      const bin = Uint8Array.from(atob(cfg.visual.glb), c => c.charCodeAt(0)).buffer;
      const r = await parseGltf(bin);
      S.parts = r.parts.map((p, i) => { const meta = cfg.visual.parts?.[i] || {}; return { ...p, ...meta, geo: p.mesh.geometry }; });
      S.fileName = cfg.source;
      await applyWithModel(cfg, { glb: cfg.visual.glb, parts: cfg.visual.parts || S.parts.map(p => ({ name: p.name, role: p.role, link: p.link, wheel: p.wheel })) });
    } else setRobot(cfg);
    summary();
  }

  // ---- upload
  const drop = $('rbDrop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); };
  $('rbFile').onchange = (e) => { handleFiles([...e.target.files]); e.target.value = ''; };
  const progress = (msg, v) => { $('rbProg').classList.remove('hidden'); $('rbProg').value = v; $('rbStatus').textContent = msg; };

  async function handleFiles(files) {
    try {
      const json = files.find(f => /\.json$/i.test(f.name));
      if (json) { await importJson(await json.text()); progress('Configuration loaded', 1); return; }
      const main = files.find(f => /\.(step|stp|glb|gltf|urdf)$/i.test(f.name));
      if (!main) throw new Error('Choose a .step, .glb, .gltf, .urdf (with .stl files) or .json file');
      S.fileName = main.name; progress(`Reading ${main.name} (${(main.size / 1e6).toFixed(1)} MB)…`, 0.05);
      let r;
      if (/\.(step|stp)$/i.test(main.name)) { r = await parseStep(await main.arrayBuffer(), progress); S.opts = { unit: 1, up: 'z', fwd: '+y' }; }
      else if (/\.(glb|gltf)$/i.test(main.name)) { r = await parseGltf(await main.arrayBuffer()); S.opts = { unit: 1, up: 'y', fwd: '-y' }; }   // glTF: the front of an asset faces +Z
      else { r = await parseUrdf(await main.text(), files); S.opts = { unit: 1, up: 'z', fwd: '+x' }; }
      S.parts = r.parts; S.urdf = r.urdf || null;
      if (!S.parts.length) throw new Error('No parts (meshes) found in this file');
      const unit = guessUnit(S.parts, S.opts.unit), unitNote = unit !== S.opts.unit ? ` Units auto-detected: ${UNIT_NAME[unit]}.` : '';
      S.opts.unit = unit;
      rebuild(main.name.replace(/\.[^.]+$/, ''));
      // wheel axles always run left-right: if the detected wheels are thin front-to-back, the model is turned 90°
      const wh = S.parts.filter(p => p.role === 'wheel'), avg = (i) => wh.reduce((s, p) => s + p.size[i], 0) / (wh.length || 1);
      let turned = '';
      if (wh.length && avg(0) > avg(1) * 1.3) {
        S.opts.fwd = TURN90[S.opts.fwd]; rebuild(S.cfg.name);
        turned = ' Model was sideways, rotated 90°. Check the arrow points forward.';
      }
      $('rbUnit').value = S.opts.unit; $('rbUp').value = S.opts.up; $('rbFwd').value = S.opts.fwd;
      progress(`Found ${S.parts.length} parts.${unitNote}${turned} Check the setup below, then press Use this robot.`, 1);
    } catch (e) { progress('Could not load: ' + e.message, 0); console.error(e); }
  }
  function rebuild(name) { normalize(); autoConfig(name); renderMarkup(); $('rbMarkup').classList.remove('hidden'); }
  const turn = (map) => { S.opts.fwd = map[S.opts.fwd]; $('rbFwd').value = S.opts.fwd; rebuild(S.cfg?.name); };
  $('rbTurn90').onclick = () => turn(TURN90);
  $('rbTurn180').onclick = () => turn({ '+y': '-y', '-y': '+y', '+x': '-x', '-x': '+x' });
  $('rbReorient').onclick = () => { S.opts = { unit: +$('rbUnit').value, up: $('rbUp').value, fwd: $('rbFwd').value }; rebuild(S.cfg?.name); };

  // ---- top and side views of the parsed model, so orientation mistakes are visible before anything is simulated
  const ROLE_COLOR = { chassis: '#8a929b', wheel: '#f2a900', motor: '#e8d36a', servo: '#5aa0e0', sensor: '#7ccf8a', link: '#d87a4a', ignore: 'rgba(120,120,120,0.25)' };
  function drawViews() {
    const c = S.cfg, b = S.bounds;
    const view = (id, ax, ay, flipY) => {
      const cv = $(id), g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 34;
      const span = Math.max(b.max[ax] - b.min[ax], b.max[ay] - b.min[ay], 0.05), k = (W - 2 * pad) / span;
      const cx = (b.min[ax] + b.max[ax]) / 2, cy = (b.min[ay] + b.max[ay]) / 2;
      const X = (v) => W / 2 + (v - cx) * k, Y = (v) => H / 2 - (v - cy) * k * (flipY ? -1 : 1);
      g.fillStyle = '#23272b'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(242,169,0,0.35)'; g.setLineDash([4, 4]);                     // 18 in limit around the center
      const L = 18 * IN * k; g.strokeRect(W / 2 - L / 2, H / 2 - L / 2, L, L); g.setLineDash([]);
      const order = ['ignore', 'chassis', 'motor', 'servo', 'sensor', 'link', 'wheel'];
      for (const p of [...S.parts].sort((p, q) => order.indexOf(p.role) - order.indexOf(q.role))) {
        const x0 = X(p.box.min[ax]), x1 = X(p.box.max[ax]), y0 = Y(p.box.min[ay]), y1 = Y(p.box.max[ay]);
        g.fillStyle = ROLE_COLOR[p.role] || '#888'; g.globalAlpha = p.role === 'chassis' ? 0.55 : 0.9;
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1); g.globalAlpha = 1;
      }
      g.font = '600 11px Barlow, sans-serif'; g.textAlign = 'center';
      if (ax === 'x') for (const w of c.wheels || []) { g.fillStyle = '#fff'; g.fillText(w.motor, X(w.pos[0]), Y(w.pos[1]) + (w.pos[1] > 0 ? -16 : 24)); }
      // FRONT arrow: +Y in the top view (up), +Y in the side view (right)
      g.strokeStyle = g.fillStyle = '#f2a900'; g.lineWidth = 2; g.beginPath();
      if (ax === 'x') { g.moveTo(W / 2, 26); g.lineTo(W / 2, 6); g.stroke(); g.beginPath(); g.moveTo(W / 2 - 6, 13); g.lineTo(W / 2, 4); g.lineTo(W / 2 + 6, 13); g.fill(); g.fillText('FRONT', W / 2 + 30, 16); }
      else { g.moveTo(W - 30, H - 10); g.lineTo(W - 8, H - 10); g.stroke(); g.beginPath(); g.moveTo(W - 15, H - 16); g.lineTo(W - 5, H - 10); g.lineTo(W - 15, H - 4); g.fill(); g.fillText('FRONT', W - 60, H - 6); }
      g.fillStyle = '#5b6168'; g.fillRect(0, Y(0), W, ax === 'y' ? 2 : 0);                    // floor line in the side view
    };
    view('rbTop', 'x', 'y', false);
    view('rbSide', 'y', 'z', false);
  }

  // ---- markup tables
  function renderMarkup() {
    const c = S.cfg, b = S.bounds.getSize(new THREE.Vector3());
    drawViews();
    $('rbBounds').textContent = `Model size: ${(b.x / IN).toFixed(1)} × ${(b.y / IN).toFixed(1)} × ${(b.z / IN).toFixed(1)} in (X × Y × Z). If this looks wrong, change the units.`;
    const linkOpts = (sel) => ['chassis', ...c.joints.map(j => j.id)].map(id => opt(id, id === 'chassis' ? 'chassis' : 'joint ' + id, id === sel)).join('');
    $('rbParts').innerHTML = '<tr><th>Part</th><th>Size, mm</th><th>Role</th><th>Moves with</th></tr>' + S.parts.map((p, i) =>
      `<tr><td title="${esc(p.path || p.name)}">${esc(p.name.slice(0, 38))}</td><td>${p.size.map(v => Math.round(v * 1000)).join('×')}</td>
       <td><select data-i="${i}" data-k="role">${['chassis', 'wheel', 'motor', 'servo', 'sensor', 'link', 'ignore'].map(r => opt(r, { chassis: 'chassis', wheel: 'wheel', motor: 'motor', servo: 'servo', sensor: 'sensor', link: 'joint link', ignore: 'ignore' }[r], p.role === r)).join('')}</select></td>
       <td><select data-i="${i}" data-k="link">${linkOpts(p.link)}</select></td></tr>`).join('');
    $('rbParts').querySelectorAll('select').forEach(s => s.onchange = () => {
      const p = S.parts[+s.dataset.i]; p[s.dataset.k] = s.value;
      if (s.dataset.k === 'role' && s.value !== 'link') p.link = 'chassis';
      if (s.dataset.k === 'role' && s.value === 'wheel') { normalizeWheels(); }
      drawViews();
      const ch = chassisBox(); c.chassis.size = ch.size; c.chassis.clearance = ch.clearance; c.chassis.colliders = [{ c: ch.c, h: ch.size.map(x => x / 2) }];
      renderMarkup();
    });
    const motorOpts = (sel) => Object.entries(MOTORS).map(([k, m]) => opt(k, m.name, k === sel)).join('');
    $('rbWheels').innerHTML = '<tr><th>hardwareMap name</th><th>Type</th><th>Motor</th><th>Positive power</th><th>Rollers</th><th>Ø, mm</th></tr>' + c.wheels.map((w, i) =>
      `<tr><td><input type="text" data-i="${i}" data-k="motor" value="${esc(w.motor)}" size="10"></td>
       <td><select data-i="${i}" data-k="type">${['mecanum', 'omni', 'traction'].map(t => opt(t, t, w.type === t)).join('')}</select></td>
       <td><select data-i="${i}" data-k="model">${motorOpts(w.model)}</select></td>
       <td><select data-i="${i}" data-k="motorDir">${opt(1, 'wheel forward', w.motorDir === 1)}${opt(-1, 'wheel backward', w.motorDir === -1)}</select></td>
       <td><select data-i="${i}" data-k="roller">${opt(1, '/ (FL, BR)', w.roller === 1)}${opt(-1, '\\ (FR, BL)', w.roller === -1)}</select></td>
       <td><input type="number" data-i="${i}" data-k="radius" value="${Math.round(w.radius * 2000)}" style="width:60px"></td></tr>`).join('') +
      (c.wheels.length ? '' : '<tr><td colspan="6" class="badc">No wheels found. Set the role of the wheel parts to wheel in the table above.</td></tr>');
    $('rbWheels').querySelectorAll('input,select').forEach(s => s.onchange = () => {
      const w = c.wheels[+s.dataset.i], k = s.dataset.k;
      if (k === 'motor') { S.parts.forEach(p => { if (p.wheel === w.motor) p.wheel = s.value; }); w.motor = s.value; }
      else if (k === 'radius') { w.radius = +s.value / 2000; w.pos[2] = w.radius; }
      else w[k] = (k === 'motorDir' || k === 'roller') ? +s.value : s.value;
    });
    const servoOpts = (sel) => Object.entries(SERVOS).map(([k, m]) => opt(k, m.name, k === sel)).join('');
    $('rbJoints').innerHTML = '<tr><th>id</th><th>Type</th><th>Axis</th><th>Pivot, m</th><th>Limits</th><th>Driven by</th><th>Device</th><th>Mass</th><th></th></tr>' + c.joints.map((j, i) => {
      const mot = c.motors.find(m => m.load?.joint === j.id), sv = c.servos.find(s => s.joint === j.id);
      return `<tr><td>${esc(j.id)}</td><td><select data-i="${i}" data-k="type">${opt('revolute', 'rotating', j.type === 'revolute')}${opt('prismatic', 'sliding', j.type === 'prismatic')}</select></td>
       <td><select data-i="${i}" data-k="axis">${[['1,0,0', '+X'], ['-1,0,0', '−X'], ['0,1,0', '+Y'], ['0,-1,0', '−Y'], ['0,0,1', '+Z'], ['0,0,-1', '−Z']].map(([v, l]) => opt(v, l, j.axis.map(Math.round).join(',') === v)).join('')}</select></td>
       <td><input type="text" data-i="${i}" data-k="anchor" value="${j.anchor.map(v => v.toFixed(3)).join(', ')}" size="16"></td>
       <td><input type="text" data-i="${i}" data-k="limits" value="${j.limits ? j.limits.map(v => +v.toFixed(3)).join(', ') : ''}" size="9" title="radians or meters; empty means no limits"></td>
       <td><select data-i="${i}" data-k="act">${opt('motor', 'motor', !!mot)}${opt('servo', 'servo', !!sv)}${opt('none', 'nothing', !mot && !sv)}</select>
           ${mot ? `<select data-i="${i}" data-k="amodel">${motorOpts(mot.model)}</select>` : sv ? `<select data-i="${i}" data-k="smodel">${servoOpts(sv.model)}</select>` : ''}</td>
       <td><input type="text" data-i="${i}" data-k="dev" value="${esc(mot?.name || sv?.name || '')}" size="8"></td>
       <td><input type="number" data-i="${i}" data-k="mass" value="${j.mass}" step="0.05" style="width:56px"></td><td><button data-i="${i}" data-k="del">✖</button></td></tr>`;
    }).join('');
    $('rbJoints').querySelectorAll('input,select,button').forEach(s => (s.tagName === 'BUTTON' ? s.onclick = s.onchange : null, s[s.tagName === 'BUTTON' ? 'onclick' : 'onchange'] = () => {
      const j = c.joints[+s.dataset.i], k = s.dataset.k;
      const mot = c.motors.find(m => m.load?.joint === j.id), sv = c.servos.find(x => x.joint === j.id);
      if (k === 'del') { c.joints.splice(+s.dataset.i, 1); c.motors = c.motors.filter(m => m !== mot); c.servos = c.servos.filter(x => x !== sv); S.parts.forEach(p => { if (p.link === j.id) { p.link = 'chassis'; p.role = 'chassis'; } }); }
      else if (k === 'type') j.type = s.value;
      else if (k === 'axis') j.axis = s.value.split(',').map(Number);
      else if (k === 'anchor') j.anchor = s.value.split(',').map(Number);
      else if (k === 'limits') j.limits = s.value.trim() ? s.value.split(',').map(Number) : null;
      else if (k === 'mass') j.mass = +s.value;
      else if (k === 'act') {
        c.motors = c.motors.filter(m => m !== mot); c.servos = c.servos.filter(x => x !== sv);
        const name = mot?.name || sv?.name || j.id;
        if (s.value === 'motor') c.motors.push({ name, model: 'gobilda-117', load: { type: 'joint', joint: j.id, ratio: j.type === 'prismatic' ? 1 / 0.019 : 1 } });
        if (s.value === 'servo') c.servos.push({ name, model: 'gobilda-torque', kind: 'servo', joint: j.id, zero: j.limits ? j.limits[0] : 0, dir: 1 });
      }
      else if (k === 'amodel' && mot) mot.model = s.value;
      else if (k === 'smodel' && sv) sv.model = s.value;
      else if (k === 'dev') { if (mot) mot.name = s.value; if (sv) sv.name = s.value; }
      updateLinkBoxes(); renderMarkup();
    }));
    $('rbSensors').innerHTML = '<tr><th>Name</th><th>Type</th><th>Mounted on</th><th>Position, m</th><th>Yaw°</th><th>Pitch°</th><th></th></tr>' + c.sensors.map((s, i) =>
      `<tr><td><input type="text" data-i="${i}" data-k="name" value="${esc(s.name)}" size="10"></td><td>${esc(s.type)}</td>
       <td><select data-i="${i}" data-k="link">${linkOpts(s.link || 'chassis')}</select></td>
       <td><input type="text" data-i="${i}" data-k="pos" value="${(s.pos || [0, 0, 0]).map(v => (+v).toFixed(3)).join(', ')}" size="16"></td>
       <td><input type="number" data-i="${i}" data-k="yaw" value="${s.yaw || 0}" style="width:50px"></td><td><input type="number" data-i="${i}" data-k="pitch" value="${s.pitch || 0}" style="width:50px"></td>
       <td><button data-i="${i}" data-k="del">✖</button></td></tr>`).join('');
    $('rbSensors').querySelectorAll('input,select,button').forEach(s => s[s.tagName === 'BUTTON' ? 'onclick' : 'onchange'] = () => {
      const x = c.sensors[+s.dataset.i], k = s.dataset.k;
      if (k === 'del') { c.sensors.splice(+s.dataset.i, 1); renderMarkup(); return; }
      x[k] = k === 'pos' ? s.value.split(',').map(Number) : (k === 'yaw' || k === 'pitch') ? +s.value : s.value;
    });
    $('rbMass').value = (+c.chassis.mass).toFixed(2); $('rbCom').value = c.chassis.com.map(v => (+v).toFixed(3)).join(', '); $('rbNameIn').value = c.name;
  }
  function normalizeWheels() { const keep = S.cfg; autoConfig(keep.name); S.cfg.joints = keep.joints; S.cfg.motors = keep.motors; S.cfg.servos = keep.servos; S.cfg.sensors = keep.sensors; }
  function updateLinkBoxes() {
    for (const j of S.cfg.joints) {
      const b = new THREE.Box3(); S.parts.filter(p => p.link === j.id).forEach(p => b.union(p.box));
      if (!b.isEmpty()) j.box = { c: b.getCenter(new THREE.Vector3()).toArray(), h: b.getSize(new THREE.Vector3()).multiplyScalar(0.5).toArray() };
    }
  }
  $('rbAddJoint').onclick = () => {
    const id = prompt('Joint id, for example arm, lift or turret', 'arm'); if (!id) return;
    const sel = S.parts.filter(p => p.role === 'link' && p.link === 'chassis');
    S.cfg.joints.push({ id, parent: 'chassis', type: 'revolute', anchor: sel[0] ? sel[0].center : [0, 0, 0.2], axis: [1, 0, 0], limits: [0, 2], mass: 0.4 });
    sel.forEach(p => p.link = id);
    S.cfg.motors.push({ name: id, model: 'gobilda-117', load: { type: 'joint', joint: id, ratio: 1 } });
    updateLinkBoxes(); renderMarkup();
  };
  $('rbAddSensor').onclick = () => { const t = $('rbSensType').value; S.cfg.sensors.push({ name: t === 'webcam' ? 'Webcam 1' : t + 'Sensor', type: t, link: 'chassis', pos: [0, S.bounds.max.y * 0.9, 0.1], yaw: 0, pitch: 0 }); renderMarkup(); };

  $('rbApply').onclick = async () => {
    const c = S.cfg;
    c.name = $('rbNameIn').value || c.name;
    c.chassis.mass = +$('rbMass').value || 12; c.chassis.com = $('rbCom').value.split(',').map(Number);
    updateLinkBoxes();
    for (const j of c.joints) if (!j.box) j.box = { c: j.anchor, h: [0.03, 0.03, 0.03] };
    // game mechanisms from the simple form
    c.holders = []; c.launchers = []; c.motors = c.motors.filter(m => m.load?.type !== 'spinner'); c.servos = c.servos.filter(s => s.joint || !s.mech);
    const e = robotExtents({ ...c, joints: [] });
    if ($('mIntake').checked) {
      const name = $('mIntakeMotor').value || 'intake';
      c.motors.push({ name, model: 'gobilda-1150', load: { type: 'spinner', inertia: 2e-4, radius: 0.03 } });
      c.holders.push({ id: 'storage', link: 'chassis', zone: { c: [0, e.y1 + 0.02, 0.05], h: [Math.min(0.15, (e.x1 - e.x0) / 2 - 0.03), 0.035, 0.06] }, capacity: +$('mIntakeCap').value || 4,
        accepts: ['pollen', 'nectar'], intake: { device: name, op: '>', value: 0.3 }, eject: { device: name, op: '<', value: -0.3, dirVec: [0, 1, 0], speed: 1.5 },
        slots: Array.from({ length: +$('mIntakeCap').value || 4 }, (_, i) => [0, e.y1 - 0.05 - i * 0.06, 0.12 + i * 0.05]) });
    }
    if ($('mShooter').checked) {
      const fly = $('mFly').value || 'shooter', feed = $('mFeed').value || 'feeder', hood = $('mHood').value.trim();
      const [p0, p1] = $('mPitch').value.split(',').map(Number);
      c.motors.push({ name: fly, model: 'gobilda-6000', load: { type: 'spinner', inertia: 6e-4, radius: 0.048 } });
      if (!c.servos.some(s => s.name === feed)) c.servos.push({ name: feed, model: 'gobilda-speed', kind: 'servo', mech: true });
      if (hood && !c.servos.some(s => s.name === hood)) c.servos.push({ name: hood, model: 'gobilda-torque', kind: 'servo', mech: true });
      if (!c.holders.length) c.holders.push({ id: 'storage', link: 'chassis', zone: { c: [0, 0, 0.1], h: [0.01, 0.01, 0.01] }, capacity: 4, accepts: ['pollen', 'nectar'], slots: [[0, 0, 0.2]] });
      c.launchers.push({ holder: c.holders[0].id, link: 'chassis', flywheel: fly, feed: { device: feed, op: '>', value: 0.5 }, exit: $('mExit').value.split(',').map(Number),
        hood: hood ? { device: hood, min: p0 || 25, max: p1 || 65 } : undefined, pitchDeg: p0 || 45, speedFactor: 0.5 });
    }
    $('rbApplyMsg').textContent = 'Saving the model…';
    await applyWithModel(JSON.parse(JSON.stringify(c)), await packModel());
    summary();
    $('rbApplyMsg').textContent = 'Robot updated. Devices: ' + [...c.wheels.map(w => w.motor), ...c.motors.map(m => m.name), ...c.servos.map(s => s.name), ...c.sensors.map(s => s.name)].join(', ');
  };

  // restore an uploaded model saved in the browser
  (async () => {
    if (app.robotCfg?.visual?.type === 'model' && !app.robotModel) {
      const glb = app.robotCfg.visual.glb || await idb.get('model');
      if (glb) { try { await importJson(JSON.stringify({ ...app.robotCfg, visual: { ...app.robotCfg.visual, glb } })); } catch (e) { console.warn(e); } }
    }
  })();
}

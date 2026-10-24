// three.js view of a Simulation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { buildArena } from './arena.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** final look in display space: gentle S-curve, a touch more saturation, vignette and fine film grain */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vignette, grain; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.28);                    // contrast S-curve
      float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, 1.08);  // saturation
      float d = distance(vUv, vec2(0.5)); col *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      col += (hash(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(col, c.a);
    }`,
};
import { buildFieldVisual, qRotate } from './field.js';
import { buildDemoVisual } from './robots/demo.js';
import { sensorWorld } from './sensors.js';

export class Renderer {
  constructor(canvas, overlay) {
    this.canvas = canvas; this.overlay = overlay;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.shadowMap.enabled = true;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 0.9;
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0e10);
    this.scene.fog = new THREE.Fog(0x0c0e10, 11, 30);
    // image-based light: a studio room reflected in metal, polycarbonate and plastic, like the hall lights at an event
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(this.r), 0.04).texture; pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2622, 0.35));
    // key light high above the scoring-table side; the shadow box is sized to the field
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e6, 2.4); sun.position.set(-2.2, 1.4, 5.5); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -2.3, right: 2.3, top: 2.3, bottom: -2.3, near: 1, far: 12 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015; sun.shadow.radius = 3; this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6); fill.position.set(3, -2.5, 3.5); this.scene.add(fill);
    // alliance-coloured rim light from behind each driver station, like an event's side wash
    const rimR = new THREE.DirectionalLight(0xff6a5a, 0.55); rimR.position.set(0, 6, 1.6); this.scene.add(rimR);
    const rimB = new THREE.DirectionalLight(0x5a8cff, 0.55); rimB.position.set(0, -6, 1.6); this.scene.add(rimB);
    this.arena = buildArena(THREE, this.scene);
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.02, 60);
    this.cam.position.set(-3.6, 0, 2.6);
    this.controls = new OrbitControls(this.cam, canvas);
    this.controls.target.set(0, 0, 0.3);
    this.robotCam = new THREE.PerspectiveCamera(42, 4 / 3, 0.02, 20);
    this.mode = 'free'; this.showCam = true;
    // preset views keep the whole field in frame when the viewport changes size, until the user orbits
    this.controls.addEventListener('start', () => { this.userMoved = true; });
    this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    let q = 'ultra'; try { q = localStorage.getItem('ftcsim.quality') || 'ultra'; } catch { }
    this.setQuality(q);
  }

  /** low: plain shading for weak PCs. high: soft shadows, reflections, MSAA. ultra: + ambient occlusion, bloom, sharper shadows. */
  setQuality(q, save = true) {
    this.quality = q; this.slowFrames = 0;
    if (save) try { localStorage.setItem('ftcsim.quality', q); } catch { }
    const dpr = window.devicePixelRatio || 1;
    this.r.setPixelRatio(q === 'low' ? 1 : Math.min(q === 'ultra' ? 2 : 1.5, dpr));
    this.r.shadowMap.type = q === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const size = { low: 1024, high: 2048, ultra: 4096 }[q] || 2048;
    this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    this.composer?.dispose?.(); this.composer = null;
    if (q === 'ultra') {
      const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const c = this.composer = new EffectComposer(this.r, rt);
      c.addPass(new RenderPass(this.scene, this.cam));
      const ao = new GTAOPass(this.scene, this.cam, w, h);
      ao.updateGtaoMaterial({ radius: 0.18, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.9; c.addPass(ao);
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.5, 0.92));
      c.addPass(new OutputPass());
      this.bokeh = new BokehPass(this.scene, this.cam, { focus: 5, aperture: 0.0025, maxblur: 0.008 }); this.bokeh.enabled = false; c.addPass(this.bokeh);
      this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
      this.composerSize = '';
    }
  }

  /** Ultra on a slow GPU also slows the physics (same thread): step down one level after ~3 s under 30 fps */
  watchFps() {
    const now = performance.now(), dt = now - (this.lastT || now); this.lastT = now;
    if (document.hidden || dt > 500) return;
    this.slowFrames = dt > 34 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.quality !== 'low') { this.setQuality(this.quality === 'ultra' ? 'high' : 'low', false); this.onAutoQuality?.(this.quality); }
  }

  setSim(sim, robotModel) {
    this.sim = sim;
    this.scene.remove(this.dyn); this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    const holder = new THREE.Group(); this.dyn.add(holder);
    const prev = this.scene; this.scene = holder;            // build into the dynamic group
    this.fieldV = buildFieldVisual(THREE, holder, sim.field);
    this.scene = prev;
    this.ballMeshes = new Map();
    this.ballGeo = { pollen: new THREE.SphereGeometry(sim.balls.find(b => b.type === 'pollen')?.r || 0.0356, 32, 20), nectar: new THREE.SphereGeometry(0.0457, 32, 20) };
    // molded plastic balls: diffuse color under a thin glossy coat that catches the hall lights
    const plastic = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: 0xffffff });
    this.ballMat = { yellow: plastic(0xf5cf1c), red: plastic(0xd0262a), blue: plastic(0x1f53d0) };
    this.robotV = this.buildRobotVisual(sim.robot, robotModel);
    this.otherVs = (sim.others || []).map(o => ({ robot: o, v: this.buildRobotVisual(o, null) }));
    for (const { robot, v } of [{ robot: sim.robot, v: this.robotV }, ...this.otherVs]) {
      this.dyn.add(v.root); for (const l of Object.values(v.links)) this.dyn.add(l);
      // alliance flag on top of each robot
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.01), new THREE.MeshBasicMaterial({ color: robot.alliance === 'blue' ? 0x2a6be0 : 0xe03030 }));
      flag.position.set(0, -0.12, 0.5); v.root.add(flag);
    }
    // every solid part casts and receives shadows; see-through parts (polycarbonate, zone tint) only receive
    this.dyn.traverse(o => { if (o.isMesh) { const t = [].concat(o.material).some(m => m.transparent); o.castShadow = !t && !o.userData.noShadow; o.receiveShadow = true; } });
    // robot path (true pose) drawn on the tiles
    this.trailGeo = new THREE.BufferGeometry(); this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 20000), 3)); this.trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffd54a })); this.trail.visible = this.showTrail ?? true; this.dyn.add(this.trail);
  }

  buildRobotVisual(robot, model) {
    if (robot.cfg.visual?.type === 'demo') return buildDemoVisual(THREE, robot, { RoundedBoxGeometry });
    if (model) return model.build(THREE, robot);
    // fallback: boxes from the colliders, cylinders for the wheels
    const root = new THREE.Group(), links = {}, mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.3, roughness: 0.6 });
    const ch = robot.cfg.chassis;
    for (const c of ch.colliders || [{ c: [0, 0, ch.clearance + ch.size[2] / 2], h: ch.size.map(x => x / 2) }]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...c.h.map(x => 2 * x)), mat); m.position.set(...c.c); root.add(m);
    }
    const wheels = robot.wheels.map(w => { const g = new THREE.Group(); g.position.set(...w.pos); const m = new THREE.Mesh(new THREE.CylinderGeometry(w.radius, w.radius, w.width || 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x222222 })); m.rotation.z = Math.PI / 2; g.add(m); root.add(g); return { g, w }; });
    for (const [id, L] of Object.entries(robot.links)) {
      const g = new THREE.Group(); links[id] = g;
      for (const b of L.cfg.colliders || [{ c: L.cfg.box?.c || L.cfg.anchor, h: L.cfg.box?.h || [0.02, 0.02, 0.02] }]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...b.h.map(x => 2 * x)), new THREE.MeshStandardMaterial({ color: 0xe0a030 })); m.position.set(...b.c); g.add(m);
      }
    }
    return { root, links, update() { for (const { g, w } of wheels) g.rotation.x = -robot.wheels.find(x => x.motor === w.motor).angle; } };
  }

  sync() {
    const sim = this.sim; if (!sim) return;
    this.fieldV.update();
    for (const b of sim.balls) {
      let m = this.ballMeshes.get(b);
      if (!m) { m = new THREE.Mesh(this.ballGeo[b.type], this.ballMat[b.color]); m.castShadow = m.receiveShadow = true; this.dyn.add(m); this.ballMeshes.set(b, m); }
      const p = b.body.translation(), q = b.body.rotation(); m.position.set(p.x, p.y, p.z); m.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const r = sim.robot, setT = (o, body) => { const p = body.translation(), q = body.rotation(); o.position.set(p.x, p.y, p.z); o.quaternion.set(q.x, q.y, q.z, q.w); };
    for (const { robot, v } of [{ robot: r, v: this.robotV }, ...(this.otherVs || [])]) {
      setT(v.root, robot.body);
      for (const [id, g] of Object.entries(v.links)) if (robot.links[id]) setT(g, robot.links[id].body);
      v.update(robot);
    }
  }

  /** mission gates and target zones drawn on the tiles: [{ x, y, r }] rings or [{ rect: [x0, x1, y0, y1] }]; done ones turn green */
  setMarkers(list = []) {
    if (this.markers) { this.scene.remove(this.markers); this.markers.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
    this.markers = new THREE.Group(); this.scene.add(this.markers);
    list.forEach((m, i) => {
      const color = m.done ? 0x3f9b4a : (m.next ? 0xf2a900 : 0x8a9096);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: m.done ? 0.55 : 0.85, toneMapped: false });
      let mesh;
      if (m.rect) { const [x0, x1, y0, y1] = m.rect; mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat); mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.005); mat.opacity = 0.35; }
      else { mesh = new THREE.Mesh(new THREE.RingGeometry((m.r ?? 0.2) - 0.03, m.r ?? 0.2, 40), mat); mesh.position.set(m.x, m.y, 0.006); }
      this.markers.add(mesh);
    });
  }

  /** predicted flight of the next ball, as a dashed line; null hides it */
  setArc(pts) {
    if (!this.arc) {
      this.arcGeo = new THREE.BufferGeometry(); this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 260), 3));
      this.arc = new THREE.Line(this.arcGeo, new THREE.LineDashedMaterial({ color: 0xf2a900, dashSize: 0.05, gapSize: 0.035, toneMapped: false }));
      this.arc.frustumCulled = false; this.scene.add(this.arc);
    }
    this.arc.visible = !!(pts && pts.length > 1); if (!this.arc.visible) return;
    const a = this.arcGeo.attributes.position, n = Math.min(pts.length, 260);
    for (let i = 0; i < n; i++) a.setXYZ(i, pts[i][0], pts[i][1], pts[i][2]);
    a.needsUpdate = true; this.arcGeo.setDrawRange(0, n); this.arc.computeLineDistances();
  }

  setTrail(points) {
    if (!this.trailGeo) return;
    const a = this.trailGeo.attributes.position, n = Math.min(points.length, 20000);
    for (let i = 0; i < n; i++) { a.array[3 * i] = points[i][0]; a.array[3 * i + 1] = points[i][1]; a.array[3 * i + 2] = 0.004; }
    a.needsUpdate = true; this.trailGeo.setDrawRange(0, n);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * this.r.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.r.getPixelRatio())) {
      this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
      if (!this.userMoved && this.mode !== 'robot') this.frame();
    }
  }

  /** move the camera along its current direction until the field (radius R around the target) fits the free part of the view */
  frame() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; if (!W || !H) return;
    const R = this.mode === 'top' ? 1.9 : 1.8, free = Math.max(0.4, (H - 140) / H);        // scoreboard + dock take ~140 px
    const tv = Math.tan(this.cam.fov * Math.PI / 360) * free, th = Math.tan(this.cam.fov * Math.PI / 360) * W / H;
    const d = R / Math.min(tv, th), c = this.cam.position, t = this.controls.target;
    const dir = c.clone().sub(t).normalize(); c.copy(t).addScaledVector(dir, Math.min(14, Math.max(3, d)));
    this.controls.update();
  }

  setMode(m) {
    this.mode = m; this.userMoved = false; const c = this.cam, t = this.controls.target;
    if (m === 'free') { c.position.set(-3.6, 0, 2.6); t.set(0, 0, 0.3); }
    if (m === 'top') { c.position.set(0, -0.001, 6.2); t.set(0, 0, 0); }
    if (m === 'side') { c.position.set(-4.2, 0, 1.7); t.set(0, 0, 0.4); }
    if (m === 'driverRed') { c.position.set(0, 3.3, 1.7); t.set(0, 0, 0.2); }
    if (m === 'driverBlue') { c.position.set(0, -3.3, 1.7); t.set(0, 0, 0.2); }
    this.controls.enabled = m !== 'robot';
    if (m !== 'robot') this.frame(); else this.controls.update();
  }

  render(tagView) {
    this.resize(); this.sync();
    const sim = this.sim;
    if (this.mode === 'robot' && sim) {
      const p = sim.robot.body.translation(), f = qRotate(sim.robot.body.rotation(), [0, 1, 0]);
      const want = new THREE.Vector3(p.x - f[0] * 1.1, p.y - f[1] * 1.1, 0.75);
      this.cam.position.lerp(want, 0.15); this.controls.target.set(p.x + f[0] * 0.5, p.y + f[1] * 0.5, 0.25); this.cam.lookAt(this.controls.target);
    } else this.controls.update();
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.r.setScissorTest(false); this.r.setViewport(0, 0, W, H);
    if (this.composer) {
      const key = W + 'x' + H + '@' + this.r.getPixelRatio();
      if (this.composerSize !== key) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(W, H); this.composerSize = key; }
      if (this.grade) this.grade.uniforms.time.value = (performance.now() / 1000) % 100;
      if (this.bokeh) { this.bokeh.enabled = !!this.dof; if (this.dof) this.bokeh.uniforms.focus.value = this.cam.position.distanceTo(this.controls.target); }
      this.composer.render();
    } else this.r.render(this.scene, this.cam);
    this.watchFps();
    // robot camera inset (bottom-left)
    const camS = sim && (sim.robot.cfg.sensors || []).find(s => s.type === 'webcam' || s.type === 'limelight');
    const ctx = this.overlay.getContext('2d');
    if (this.overlay.width !== W || this.overlay.height !== H) { this.overlay.width = W; this.overlay.height = H; }
    ctx.clearRect(0, 0, W, H);
    if (this.showCam && camS) {
      const iw = Math.min(300, W * 0.3, (H - 150) * 0.45 / 0.75), ih = iw * 0.75, x0 = 12, yb = 52, y0 = H - ih - yb;   // above the dock
      const cw = sensorWorld(sim.robot, camS);
      this.robotCam.position.set(...cw.pos);
      this.robotCam.up.set(...cw.up);
      this.robotCam.lookAt(cw.pos[0] + cw.fwd[0], cw.pos[1] + cw.fwd[1], cw.pos[2] + cw.fwd[2]);
      this.robotCam.fov = 2 * Math.atan(240 / (camS.fy || 622)) * 180 / Math.PI; this.robotCam.updateProjectionMatrix();
      this.robotV.root.visible = false; for (const l of Object.values(this.robotV.links)) l.visible = false;
      this.r.setScissorTest(true); this.r.setScissor(x0, yb, iw, ih); this.r.setViewport(x0, yb, iw, ih);
      this.r.render(this.scene, this.robotCam);
      this.r.setScissorTest(false);
      this.robotV.root.visible = true; for (const l of Object.values(this.robotV.links)) l.visible = true;
      ctx.strokeStyle = '#4a5158'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, iw - 1, ih - 1);
      ctx.fillStyle = 'rgba(22,25,28,.8)'; ctx.fillRect(x0, y0, Math.min(iw, 12 + ctx.measureText(camS.name).width * 1.2), 20); ctx.fillStyle = '#eef0ec'; ctx.font = '600 12px Barlow, sans-serif'; ctx.fillText(camS.name, x0 + 6, y0 + 14);
      const tv = tagView && tagView[camS.name];
      if (tv) {
        const sx = iw / 640, sy = ih / 480;
        for (const t of tv.tags) {
          ctx.beginPath(); t.corners.forEach(([u, v], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x0 + u * sx, y0 + v * sy)); ctx.closePath(); ctx.stroke();
          ctx.fillText(String(t.id), x0 + t.cx * sx - 6, y0 + t.cy * sy + 4);
        }
      }
    }
  }
}

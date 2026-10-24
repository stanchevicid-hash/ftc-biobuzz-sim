// The event hall around the field: black pipe-and-drape, lighting trusses, bleachers with spectators,
// the scoring table and the drive team stations. Visual only, built once; nothing here touches the physics.
const IN = 0.0254;

function canvasTex(THREE, w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export function buildArena(THREE, scene, opts = {}) {
  const g = new THREE.Group(); g.name = 'arena'; scene.add(g);
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });
  const add = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = false; g.add(m); return m; };

  // hall floor beyond the carpet
  add(new THREE.PlaneGeometry(60, 60), M({ color: 0x0e1012, roughness: 0.95 }), 0, 0, -0.004);

  // pipe-and-drape: folds as vertical light/dark bands, with a sheen like stage fabric
  const drapeTex = canvasTex(THREE, 256, 8, (c, w) => { for (let x = 0; x < w; x++) { const v = 14 + 10 * Math.sin(x / w * Math.PI * 8) ** 2; c.fillStyle = `rgb(${v},${v},${v + 4})`; c.fillRect(x, 0, 1, 8); } }, [6, 1]);
  const drape = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: drapeTex, roughness: 0.92, sheen: 0.6, sheenColor: 0x334455, sheenRoughness: 0.5 });
  const H = 3.6, X = 7.2, Y = 6.4;
  // every panel faces the field and stands upright (Object3D.DEFAULT_UP is +Z in this app)
  for (const [x, y, len] of [[X, 0, 2 * Y], [-X - 3.2, 0, 2 * Y], [-1.6, Y, 2 * X + 3.2], [-1.6, -Y, 2 * X + 3.2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), drape); m.position.set(x, y, H / 2);
    m.lookAt(x === -1.6 ? x : 0, x === -1.6 ? 0 : y, H / 2); g.add(m);
  }
  // banners on the far drape
  const banner = canvasTex(THREE, 256, 1024, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2a900'); gr.addColorStop(1, '#c47f00'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#1b1b1b'; c.font = '800 150px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BIOBUZZ', 0, 0); c.restore();
  });
  for (const y of [-3.2, 0, 3.2]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.0), M({ map: banner, roughness: 0.7 })); b.position.set(X - 0.05, y, 1.9); b.lookAt(0, y, 1.9); g.add(b); }

  // lighting trusses over the field with hanging lamps
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.35 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d6, emissiveIntensity: 6, toneMapped: true });
  const body = M({ color: 0x15171a, metalness: 0.4, roughness: 0.5 });
  const chord = new THREE.CylinderGeometry(0.025, 0.025, 9, 8), diag = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6);
  for (const y of [-2.2, 2.2]) {
    const z = 4.3, s = 0.15;
    for (const [dy, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) { const c = add(chord, steel, 0, y + dy, z + dz); c.rotation.z = Math.PI / 2; }
    const n = 30, inst = new THREE.InstancedMesh(diag, steel, n * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
      e.set(0, (i % 2 ? 1 : -1) * Math.PI / 4, Math.PI / 2); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(-4.35 + i * 0.3, y + side * s, z), q, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m4);
    }
    g.add(inst);
    for (let i = 0; i < 6; i++) {
      const x = -3.2 + i * 1.28, lamp = new THREE.Group(); lamp.position.set(x, y, z - 0.32);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 20), body); lamp.add(can);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), lens); face.position.y = -0.151; face.rotation.x = Math.PI / 2; lamp.add(face);
      lamp.rotation.x = Math.PI / 2 + (y > 0 ? -0.35 : 0.35);                      // aimed down at the field
      g.add(lamp);
    }
  }

  // bleachers on the audience side with spectators
  const bench = M({ color: 0x2b2f34, roughness: 0.7 }), rows = 5;
  for (let r = 0; r < rows; r++) add(new THREE.BoxGeometry(0.75, 9, 0.45 * (r + 1)), bench, -X - 0.4 - r * 0.75, 0, 0.225 * (r + 1));
  if (opts.people !== false) {
    const n = 130, body = new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), inst = new THREE.InstancedMesh(body, M({ roughness: 0.75 }), n);
    const colors = [0xd8433a, 0x2c6cd4, 0xf2a900, 0x3f9b4a, 0xe8e8e8, 0x6b6f76, 0x8a4fd8, 0xff7a1a], m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(rnd() * rows), y = -4.2 + rnd() * 8.4, x = -X - 0.4 - r * 0.75 + (rnd() - 0.5) * 0.2;
      m4.compose(new THREE.Vector3(x, y, 0.45 * (r + 1) + 0.38), q, new THREE.Vector3(1, 1, 0.9 + rnd() * 0.25)); inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.setHex(colors[Math.floor(rnd() * colors.length)]));
    }
    g.add(inst);
  }

  // scoring table on the audience side, monitors facing the field
  const table = M({ color: 0x1a1c1f, roughness: 0.6 });
  const TX = -2.6, TY = -3.9;                                  // corner between the audience and the blue alliance
  add(new THREE.BoxGeometry(2.4, 0.8, 0.06), table, TX, TY, 0.74);
  add(new THREE.BoxGeometry(2.3, 0.75, 0.7), M({ color: 0x0f1113, roughness: 0.9 }), TX, TY, 0.36);
  const screen = canvasTex(THREE, 512, 288, (c, w, h) => {
    c.fillStyle = '#101418'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8433a'; c.fillRect(0, 70, w / 2 - 50, 150); c.fillStyle = '#2c6cd4'; c.fillRect(w / 2 + 50, 70, w / 2 - 50, 150);
    c.fillStyle = '#fff'; c.font = '700 64px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.fillText('2:30', w / 2, 170);
    c.font = '600 30px "Barlow Condensed", sans-serif'; c.fillText('BIOBUZZ', w / 2, 46);
  });
  for (const dx of [-0.6, 0.6]) {
    const x = TX + dx, y = TY + 0.1;
    add(new THREE.BoxGeometry(0.62, 0.05, 0.36), M({ color: 0x0b0c0e }), x, y, 1.05);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.33), new THREE.MeshStandardMaterial({ map: screen, emissive: 0xffffff, emissiveMap: screen, emissiveIntensity: 1.4 }));
    scr.position.set(x, y + 0.027, 1.05); scr.lookAt(x, 0, 1.05); g.add(scr);
  }

  // drive team stations behind each alliance wall: cart, Driver Hub, gamepad
  const hubScreen = canvasTex(THREE, 256, 160, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2a900'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2 + 10, 40, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#9aa0a6'; c.fillRect(16, 14, w - 32, 16); });
  for (const [side, col] of [[1, 0xd8433a], [-1, 0x2c6cd4]]) for (const x of [-0.75, 0.75]) {
    const y = side * 2.75;
    add(new THREE.BoxGeometry(0.6, 0.42, 0.04), M({ color: 0x2a2d31 }), x, y, 0.92);                 // top
    add(new THREE.BoxGeometry(0.56, 0.38, 0.82), M({ color: 0x1c1e21, roughness: 0.8 }), x, y, 0.5); // cabinet
    add(new THREE.BoxGeometry(0.58, 0.02, 0.1), M({ color: col, roughness: 0.6 }), x, y - side * 0.2, 0.75); // alliance stripe
    for (const dx of [-0.24, 0.24]) for (const dy of [-0.15, 0.15]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), M({ color: 0x0a0a0a }), x + dx, y + dy, 0.03);
    add(new THREE.BoxGeometry(0.22, 0.14, 0.015), M({ color: 0x0b0c0e }), x, y - side * 0.05, 0.99);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125), new THREE.MeshStandardMaterial({ map: hubScreen, emissive: 0xffffff, emissiveMap: hubScreen, emissiveIntensity: 1.2 }));
    scr.position.set(x, y - side * 0.05, 0.9985); scr.lookAt(x, y - side * 0.05, 3); g.add(scr);   // lying on the cart, screen up
  }
  return g;
}

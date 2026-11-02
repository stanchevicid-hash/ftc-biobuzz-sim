// Reads STL (binary or text) and OBJ files of any size off the main thread. Files up to EXACT bytes are read as they
// are; bigger ones are streamed twice (bounds, then triangles merged on a grid as they arrive), so a 1.5 GB file
// never sits in memory. Every result then fits MeshReduce's triangle budget.
importScripts('mesh-reduce.js');
const EXACT = 150e6, CHUNK = 16 << 20;
const say = (progress, v) => self.postMessage({ progress, v });

class Grow {
  constructor(T) { this.a = new T(1 << 16); this.n = 0; }
  push(v) { if (this.n === this.a.length) { const b = new this.a.constructor(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
  trim() { return this.a.slice(0, this.n); }
}
/** collects triangles; with h > 0 vertices in the same grid cell merge on the way in */
class Sink {
  constructor(name, h) { this.name = name; this.h = h; this.pos = new Grow(Float32Array); this.idx = new Grow(Uint32Array); this.map = new Map(); }
  vert(x, y, z) {
    if (!this.h) { this.pos.push(x); this.pos.push(y); this.pos.push(z); return -1; }
    const inv = 1 / this.h, K = 131072;
    const key = ((Math.floor(x * inv) + 65536) * K + (Math.floor(y * inv) + 65536)) * K + (Math.floor(z * inv) + 65536);
    let i = this.map.get(key);
    if (i === undefined) { i = this.pos.n / 3; this.map.set(key, i); this.pos.push(x); this.pos.push(y); this.pos.push(z); }
    return i;
  }
  tri(a, b, c) {   // each: [x, y, z]
    const i = this.vert(...a), j = this.vert(...b), k = this.vert(...c);
    if (this.h && i !== j && j !== k && i !== k) { this.idx.push(i); this.idx.push(j); this.idx.push(k); }
  }
  done() { return this.pos.n ? { name: this.name, position: this.pos.trim(), index: this.h ? this.idx.trim() : null } : null; }
}
const box = () => ({ lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], add(x, y, z) { const p = [x, y, z]; for (let k = 0; k < 3; k++) { if (p[k] < this.lo[k]) this.lo[k] = p[k]; if (p[k] > this.hi[k]) this.hi[k] = p[k]; } } });
const cellOf = (b) => Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) / 1500 || 1e-3;

async function lines(file, fn, label, v0, v1) {
  const dec = new TextDecoder(); let rest = '';
  for (let at = 0; at < file.size; at += CHUNK) {
    const text = rest + dec.decode(new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer()), { stream: at + CHUNK < file.size });
    const ls = text.split('\n'); rest = ls.pop();
    for (const l of ls) fn(l);
    say(`${label} ${Math.round(100 * Math.min(1, (at + CHUNK) / file.size))}%`, v0 + (v1 - v0) * Math.min(1, (at + CHUNK) / file.size));
  }
  if (rest) fn(rest);
}

async function stl(file) {
  const name = file.name.replace(/\.stl$/i, ''), head = new DataView(await file.slice(0, 84).arrayBuffer());
  const count = file.size >= 84 ? head.getUint32(80, true) : 0;
  if (count && 84 + 50 * count === file.size) {   // binary
    const big = file.size > EXACT, b = box();
    const each = async (fn, label, v0, v1) => {
      const per = 50 * Math.floor(CHUNK / 50);
      for (let at = 84; at < file.size; at += per) {
        const d = new DataView(await file.slice(at, Math.min(file.size, at + per)).arrayBuffer());
        for (let o = 0; o + 50 <= d.byteLength; o += 50) fn(d, o + 12);
        say(`${label} ${Math.round(100 * (at - 84) / (file.size - 84))}%`, v0 + (v1 - v0) * (at - 84) / (file.size - 84));
      }
    };
    if (big) await each((d, o) => { for (let k = 0; k < 3; k++) b.add(d.getFloat32(o + 12 * k, true), d.getFloat32(o + 12 * k + 4, true), d.getFloat32(o + 12 * k + 8, true)); }, 'Measuring', 0.05, 0.3);
    const s = new Sink(name, big ? cellOf(b) : 0), f = (d, o, k) => [d.getFloat32(o + 12 * k, true), d.getFloat32(o + 12 * k + 4, true), d.getFloat32(o + 12 * k + 8, true)];
    await each((d, o) => s.tri(f(d, o, 0), f(d, o, 1), f(d, o, 2)), 'Reading STL', big ? 0.3 : 0.05, 0.9);
    return [s.done()];
  }
  // text STL: "vertex x y z" lines, three per facet
  const big = file.size > EXACT, b = box(), num = (l) => l.trim().split(/\s+/).slice(1, 4).map(Number);
  if (big) await lines(file, (l) => { if (/^\s*vertex/.test(l)) b.add(...num(l)); }, 'Measuring', 0.05, 0.3);
  const s = new Sink(name, big ? cellOf(b) : 0); let tri = [];
  await lines(file, (l) => { if (/^\s*vertex/.test(l)) { tri.push(num(l)); if (tri.length === 3) { s.tri(...tri); tri = []; } } }, 'Reading STL', big ? 0.3 : 0.05, 0.9);
  return [s.done()];
}

async function obj(file) {
  const big = file.size > EXACT, b = box();
  if (big) await lines(file, (l) => { if (l.startsWith('v ')) { const p = l.trim().split(/\s+/); b.add(+p[1], +p[2], +p[3]); } }, 'Measuring', 0.05, 0.3);
  const h = big ? cellOf(b) : 0, v = new Grow(Float32Array), parts = [];
  let s = new Sink(file.name.replace(/\.obj$/i, ''), h);
  const at = (i) => { i = i < 0 ? v.n / 3 + i : i - 1; return [v.a[3 * i], v.a[3 * i + 1], v.a[3 * i + 2]]; };
  await lines(file, (l) => {
    if (l.startsWith('v ')) { const p = l.trim().split(/\s+/); v.push(+p[1]); v.push(+p[2]); v.push(+p[3]); }
    else if (l.startsWith('f ')) {
      const f = l.trim().split(/\s+/).slice(1).map(t => at(parseInt(t, 10)));
      for (let k = 1; k + 1 < f.length; k++) s.tri(f[0], f[k], f[k + 1]);
    } else if (/^[og]\s/.test(l)) { const r = s.done(); if (r) parts.push(r); s = new Sink(l.slice(2).trim() || `part ${parts.length + 1}`, h); }
  }, 'Reading OBJ', big ? 0.3 : 0.05, 0.9);
  const r = s.done(); if (r) parts.push(r);
  return parts;
}

self.onmessage = async (e) => {
  try {
    const parts = [];
    for (const f of e.data) parts.push(...(/\.obj$/i.test(f.name) ? await obj(f) : await stl(f)).filter(Boolean));
    if (!parts.length) throw new Error('no triangles in this file');
    say('Fitting the triangle budget…', 0.93);
    MeshReduce.fit(parts);
    const transfer = []; for (const p of parts) { transfer.push(p.position.buffer); if (p.index) transfer.push(p.index.buffer); }
    self.postMessage({ meshes: parts }, transfer);
  } catch (err) { self.postMessage({ error: String(err?.message || err) }); }
};

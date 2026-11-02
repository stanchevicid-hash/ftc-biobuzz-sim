// Triangle budget for huge CAD models: vertex clustering (vertices in the same grid cell merge, triangles that
// collapse disappear). Keeps the outline and the big faces, which is all the simulator needs from a robot model.
// Classic script for the CAD workers (importScripts) and node tests (vm). Defines self.MeshReduce.
(function (g) {
  const BUDGET = 3e6;   // triangles for the whole robot: smooth on a laptop GPU

  /** one mesh -> clustered mesh. pos: xyz floats, index: triangle vertex indices or null (pos already per triangle) */
  function cluster(pos, index, h) {
    const map = new Map(), outPos = [], remap = new Uint32Array(pos.length / 3);
    const K = 131072, inv = 1 / h;
    for (let v = 0; v < remap.length; v++) {
      const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
      const key = ((Math.floor(x * inv) + 65536) * K + (Math.floor(y * inv) + 65536)) * K + (Math.floor(z * inv) + 65536);
      let i = map.get(key);
      if (i === undefined) { i = outPos.length / 3; map.set(key, i); outPos.push(x, y, z); }
      remap[v] = i;
    }
    const nt = index ? index.length / 3 : remap.length / 3, out = new Uint32Array(nt * 3); let p = 0;
    for (let t = 0; t < nt; t++) {
      const a = remap[index ? index[3 * t] : 3 * t], b = remap[index ? index[3 * t + 1] : 3 * t + 1], c = remap[index ? index[3 * t + 2] : 3 * t + 2];
      if (a === b || b === c || a === c) continue;
      out[p++] = a; out[p++] = b; out[p++] = c;
    }
    return { position: new Float32Array(outPos), index: out.slice(0, p) };
  }
  const tris = (m) => (m.index ? m.index.length : m.position.length / 3) / 3;
  function bounds(meshes) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const m of meshes) for (let i = 0; i < m.position.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.position[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    return { lo, hi, diag: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1 };
  }
  /** shrink meshes in place until the total fits the budget; returns the cell size used (0: nothing to do) */
  function fit(meshes, budget = BUDGET) {
    let total = 0; for (const m of meshes) total += tris(m);
    if (total <= budget) return 0;
    let h = bounds(meshes).diag / 2000;
    for (let pass = 0; pass < 12 && total > budget; pass++, h *= 1.5) {
      total = 0;
      for (const m of meshes) { const r = cluster(m.position, m.index, h); m.position = r.position; m.index = r.index; m.normal = null; total += tris(m); }
    }
    return h;
  }
  g.MeshReduce = { BUDGET, cluster, fit, tris, bounds };
})(typeof self !== 'undefined' ? self : globalThis);

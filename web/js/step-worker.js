// Parses STEP files off the main thread with OpenCascade (occt-import-js), so the page stays responsive.
importScripts('../vendor/occt/occt-import-js.js');
const load = () => occtimportjs({ locateFile: (f) => '../vendor/occt/' + f });
// fine mesh first; if OpenCascade throws (out of memory, a face it cannot mesh), retry coarser in a fresh module,
// since a C++ exception can leave the old heap full
const PASSES = [
  { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.002, angularDeflection: 0.5 },
  { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.01, angularDeflection: 1.0 },
];
// a C++ exception reaches JS as a WebAssembly.Exception with no message; the build does not export its tag, so name it ourselves
const describe = (err) => (typeof WebAssembly.Exception === 'function' && err instanceof WebAssembly.Exception) || /WebAssembly\.Exception/.test(String(err))
  ? 'OpenCascade crashed inside the STEP reader (usually out of memory, or geometry it cannot mesh)'
  : String(err?.message || err);
self.onmessage = async (e) => {
  try {
    const bytes = new Uint8Array(e.data);
    let res = null, last = null;
    for (let i = 0; i < PASSES.length && !res; i++) {
      try {
        self.postMessage({ progress: i ? 'Retrying with a coarser mesh…' : 'Reading STEP (OpenCascade)…' });
        const occt = await load();
        const r = occt.ReadStepFile(bytes, PASSES[i]);
        if (!r.success) { last = new Error('OpenCascade could not read this STEP file (not AP203/AP214/AP242, or damaged)'); break; }
        res = r;
      } catch (err) { last = err; }
    }
    if (!res) throw last;
    // assembly path of every mesh (product names carry the vendor part numbers, e.g. "5203-2402-0019 assembly")
    const paths = [];
    const walk = (node, path) => {
      const p = node.name ? [...path, node.name] : path;
      for (const m of node.meshes || []) paths[m] = p;
      for (const c of node.children || []) walk(c, p);
    };
    if (res.root) walk(res.root, []);
    const meshes = res.meshes.map((m, i) => ({
      name: m.name, path: (paths[i] || []).join(' / '), color: m.color,
      position: new Float32Array(m.attributes.position.array), normal: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
      index: m.index ? new Uint32Array(m.index.array) : null,
    }));
    const transfer = [];
    for (const m of meshes) { transfer.push(m.position.buffer); if (m.normal) transfer.push(m.normal.buffer); if (m.index) transfer.push(m.index.buffer); }
    self.postMessage({ meshes }, transfer);
  } catch (err) { self.postMessage({ error: describe(err) }); }
};

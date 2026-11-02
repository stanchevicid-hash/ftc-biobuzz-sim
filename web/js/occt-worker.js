// One OpenCascade instance in its own worker: the page runs several of these in parallel on the small STEP files
// step-worker.js cuts a huge one into (OpenCascade parses about 2.5 MB/s per core).
importScripts('../vendor/occt/occt-import-js.js');
let occt = null, wasm = null;
const load = () => occtimportjs({ wasmBinary: wasm, locateFile: (f) => '../vendor/occt/' + f });
self.onmessage = async (e) => {
  const { id, bytes, params } = e.data;
  try {
    wasm ||= e.data.wasm;
    occt ||= await load();
    const r = occt.ReadStepFile(bytes, params);
    if (!r.success) throw new Error('not read');
    const paths = [];
    const walk = (node, path) => {
      const p = node.name ? [...path, node.name] : path;
      for (const m of node.meshes || []) paths[m] = p;
      for (const c of node.children || []) walk(c, p);
    };
    if (r.root) walk(r.root, []);
    const meshes = r.meshes.map((m, i) => ({ name: m.name, path: (paths[i] || []).join(' / '), color: m.color,
      position: new Float32Array(m.attributes.position.array), index: m.index ? new Uint32Array(m.index.array) : null }));
    self.postMessage({ id, meshes }, meshes.flatMap(m => m.index ? [m.position.buffer, m.index.buffer] : [m.position.buffer]));
  } catch (err) {
    occt = null;   // a C++ exception can leave the heap full: next batch gets a fresh instance
    self.postMessage({ id, error: String(err?.message || err) });
  }
};

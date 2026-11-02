// Parses STEP files off the main thread with OpenCascade (occt-import-js), so the page stays responsive.
// Files over BIG are never read whole: step-split.js indexes them in a streaming pass and cuts them into small
// self-contained STEP files, meshed one after another, then mesh-reduce.js fits the result into a triangle budget.
importScripts('../vendor/occt/occt-import-js.js', 'step-split.js', 'mesh-reduce.js');
const BIG = 48e6, BATCH = 12e6;
let wasm = null;
const load = async () => {
  wasm ||= await (await fetch('../vendor/occt/occt-import-js.wasm')).arrayBuffer();
  return occtimportjs({ wasmBinary: wasm, locateFile: (f) => '../vendor/occt/' + f });
};
// fine mesh first; if OpenCascade throws (out of memory, a face it cannot mesh), retry coarser in a fresh module,
// since a C++ exception can leave the old heap full
const PASSES = [
  { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.002, angularDeflection: 0.5 },
  { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.01, angularDeflection: 1.0 },
];
const BIG_PASS = { linearUnit: 'meter', linearDeflectionType: 'absolute_value', linearDeflection: 0.001, angularDeflection: 0.5 };
// a C++ exception reaches JS as a WebAssembly.Exception with no message; the build does not export its tag, so name it ourselves
const describe = (err) => (typeof WebAssembly.Exception === 'function' && err instanceof WebAssembly.Exception) || /WebAssembly\.Exception/.test(String(err))
  ? 'OpenCascade crashed inside the STEP reader (usually out of memory, or geometry it cannot mesh)'
  : String(err?.message || err);
const say = (progress, v) => self.postMessage({ progress, v });

/** meshes of one OpenCascade result, with the assembly path of each (product names carry vendor part numbers) */
function collect(res, out, normals) {
  const paths = [];
  const walk = (node, path) => {
    const p = node.name ? [...path, node.name] : path;
    for (const m of node.meshes || []) paths[m] = p;
    for (const c of node.children || []) walk(c, p);
  };
  if (res.root) walk(res.root, []);
  res.meshes.forEach((m, i) => out.push({
    name: m.name, path: (paths[i] || []).join(' / '), color: m.color,
    position: new Float32Array(m.attributes.position.array), normal: normals && m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
    index: m.index ? new Uint32Array(m.index.array) : null,
  }));
}

async function small(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), out = [];
  let last = null;
  for (let i = 0; i < PASSES.length; i++) {
    try {
      say(i ? 'Retrying with a coarser mesh…' : 'Reading STEP (OpenCascade)…');
      const r = (await load()).ReadStepFile(bytes, PASSES[i]);
      if (!r.success) throw new Error('OpenCascade could not read this STEP file (not AP203/AP214/AP242, or damaged)');
      collect(r, out, true); return { meshes: out };
    } catch (err) { last = err; if (/could not read/.test(err.message)) break; }
  }
  throw last;
}

async function big(file) {
  const mb = (file.size / 1e6).toFixed(0), t0 = Date.now();
  const idx = await StepSplit.scan(file, (f) => say(`Indexing ${mb} MB… ${Math.round(f * 100)}%`, 0.03 + 0.12 * f));
  if (!idx.solids.length) throw new Error('no solids in this STEP file');
  const queue = idx.plan(BATCH, 300), out = [], total = idx.solids.length, t1 = Date.now();
  let done = 0, skipped = 0, nextId = 0, gate = Promise.resolve();
  const build = (b) => (gate = gate.catch(() => {}).then(() => idx.build(b)));   // one at a time: builds share the index's marks
  // the page runs the OpenCascade workers (nested workers are not available everywhere): hand it each batch
  const run = (b) => new Promise(async (resolve) => {
    const id = nextId++, bytes = await build(b);
    jobs.set(id, resolve);
    self.postMessage({ job: id, bytes, params: BIG_PASS }, [bytes.buffer]);
  });
  const lane = async () => {
    while (queue.length) {
      const b = queue.shift(), r = await run(b);
      if (r.error) {
        if (b.length > 1) { const h = b.length >> 1; queue.push(b.slice(0, h), b.slice(h)); }
        else { skipped++; done++; }
      } else { for (const m of r.meshes) out.push(m); done += b.length; }
      const eta = done ? Math.round((Date.now() - t1) / done * (total - done) / 1000) : 0;
      say(`Meshing ${done} / ${total} solids${eta ? `, about ${eta > 90 ? Math.round(eta / 60) + ' min' : eta + ' s'} left` : ''}…`, 0.15 + 0.78 * done / total);
    }
  };
  // a lane can find the queue empty while another is about to split a failed batch: repeat until all are idle
  while (queue.length) await Promise.all(Array.from({ length: lanes }, lane));
  if (!out.length) throw new Error('OpenCascade could not mesh any solid of this file');
  say('Fitting the triangle budget…', 0.94);
  MeshReduce.fit(out);
  console.log(`STEP ${mb} MB: ${total} solids in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { meshes: out, note: skipped ? ` ${skipped} solids could not be meshed and were left out.` : '' };
}

const jobs = new Map();
let lanes = 1;
self.onmessage = async (e) => {
  if (e.data.jobDone !== undefined) { const f = jobs.get(e.data.jobDone); jobs.delete(e.data.jobDone); return f(e.data); }
  try {
    lanes = e.data.lanes || 1;
    const file = e.data.file;
    const res = file.size > BIG ? await big(file) : await small(file);
    const transfer = [];
    for (const m of res.meshes) { transfer.push(m.position.buffer); if (m.normal) transfer.push(m.normal.buffer); if (m.index) transfer.push(m.index.buffer); }
    self.postMessage(res, transfer);
  } catch (err) { self.postMessage({ error: describe(err) }); }
};

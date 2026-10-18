// Parses STEP files off the main thread with OpenCascade (occt-import-js), so the page stays responsive.
importScripts('../vendor/occt/occt-import-js.js');
let occtPromise = null;
self.onmessage = async (e) => {
  try {
    occtPromise ||= occtimportjs({ locateFile: (f) => '../vendor/occt/' + f });
    const occt = await occtPromise;
    self.postMessage({ progress: 'Reading STEP (OpenCascade)…' });
    const res = occt.ReadStepFile(new Uint8Array(e.data), { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.002, angularDeflection: 0.5 });
    if (!res.success) throw new Error('Could not read this STEP file');
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
  } catch (err) { self.postMessage({ error: String(err.message || err) }); }
};

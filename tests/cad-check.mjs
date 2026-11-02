// Huge-CAD import check (no browser):  node tests/cad-check.mjs
// - a STEP cut into small self-contained batches meshes to the same parts as the whole file
// - several assemblies in one file: each batch carries only its own assembly's structure
// - the triangle budget shrinks a dense mesh but keeps its size
// Uses the team robot ../cad_28284/STEP/robot.step when it is there; the budget check always runs.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url)), web = path.join(here, '..', 'web');
for (const f of ['js/step-split.js', 'js/mesh-reduce.js']) vm.runInThisContext(fs.readFileSync(path.join(web, f), 'utf8'), { filename: f });
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}  ${info}`); if (!ok) failed++; };

// triangle budget: a sphere of 2 million triangles, 0.4 m across
{
  const N = 1000, pos = [], idx = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const th = Math.PI * i / N, ph = 2 * Math.PI * j / N;
    pos.push(0.2 * Math.sin(th) * Math.cos(ph), 0.2 * Math.sin(th) * Math.sin(ph), 0.2 * Math.cos(th));
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const m = { position: new Float32Array(pos), index: new Uint32Array(idx) };
  MeshReduce.fit([m], 200000);
  const b = MeshReduce.bounds([m]);
  check('triangle budget', MeshReduce.tris(m) <= 200000 && Math.abs(b.hi[0] - b.lo[0] - 0.4) < 0.01, `${MeshReduce.tris(m)} triangles, ${(b.hi[0] - b.lo[0]).toFixed(3)} m wide`);
}

const robot = path.join(here, '..', '..', 'cad_28284', 'STEP', 'robot.step');
if (!fs.existsSync(robot)) console.log('skip  STEP split checks: ../cad_28284/STEP/robot.step not found');
else {
  // occt-import-js is a UMD script: run it with a CommonJS shim and hand it the wasm bytes
  const mod = { exports: {} };
  vm.runInThisContext(`(function (module, exports, require, __dirname) {${fs.readFileSync(path.join(web, 'vendor/occt/occt-import-js.js'), 'utf8')}\n})`)(mod, mod.exports, createRequire(import.meta.url), path.join(web, 'vendor/occt'));
  const occt = await mod.exports({ wasmBinary: fs.readFileSync(path.join(web, 'vendor/occt/occt-import-js.wasm')) });
  const P = { linearUnit: 'meter', linearDeflectionType: 'absolute_value', linearDeflection: 0.001, angularDeflection: 0.5 };
  const meshOf = (bytes) => { const r = occt.ReadStepFile(bytes, P); return r.success ? r.meshes.length : -1; };
  const text = fs.readFileSync(robot, 'latin1');
  const whole = meshOf(new Uint8Array(Buffer.from(text, 'latin1')));
  const split = async (blob, limit) => {
    const idx = await StepSplit.scan(blob), plan = idx.plan(limit, 300);
    let n = 0, maxStruct = 0;
    for (const b of plan) { const bytes = await idx.build(b); maxStruct = Math.max(maxStruct, bytes.length); const k = meshOf(bytes); if (k < 0) return { n: -1 }; n += k; }
    return { n, batches: plan.length, idx, maxStruct };
  };
  const one = await split(new Blob([fs.readFileSync(robot)]), 300e3);
  check('STEP split in batches = whole file', one.n === whole && one.batches > 5, `${one.n} meshes in ${one.batches} batches, whole file ${whole}`);
  // three copies of the robot as separate assemblies (ids renumbered): every part found, batches carry one copy's structure
  const a = text.search(/\bDATA\s*;/), d0 = text.indexOf(';', a) + 1, d1 = text.lastIndexOf('ENDSEC');
  let maxId = 0; for (const m of text.slice(d0, d1).matchAll(/#(\d+)/g)) maxId = Math.max(maxId, +m[1]);
  const copies = [0, 1, 2].map(k => k ? text.slice(d0, d1).replace(/#(\d+)/g, (_, n) => '#' + (+n + k * maxId)) : text.slice(d0, d1));
  const three = new Blob([Buffer.from(text.slice(0, d0) + copies.join('') + text.slice(d1), 'latin1')]);
  const r3 = await split(three, 2e6);
  check('three assemblies in one file', r3.n === 3 * whole, `${r3.n} meshes, expected ${3 * whole}`);
  check('a batch carries one assembly\'s structure', r3.idx.structBytes > 2.5 * one.idx.structBytes && r3.maxStruct < 2e6 + 1.5 * one.idx.structBytes,
    `structure ${(r3.idx.structBytes / 1e6).toFixed(2)} MB in the file, biggest batch ${(r3.maxStruct / 1e6).toFixed(2)} MB`);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);

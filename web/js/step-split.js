// Splits a STEP file of any size into small, self-contained STEP files (a batch of solids each) without ever
// holding the whole file: OpenCascade's 32-bit heap (2 GB) cannot take a 1.5 GB assembly at once.
// Every batch keeps the product structure (products, placements, contexts: small) and only its own solids' geometry;
// references to other solids are taken out of lists, and entities that point straight at one are dropped.
// Classic script: used by the STEP worker (importScripts) and by node tests (vm). Defines self.StepSplit.
(function (g) {
  const SOLID = new Set(['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'SHELL_BASED_SURFACE_MODEL', 'GEOMETRIC_CURVE_SET', 'GEOMETRIC_SET',
    'TESSELLATED_SOLID', 'TESSELLATED_SHELL', 'TRIANGULATED_SURFACE_SET', 'COMPLEX_TRIANGULATED_SURFACE_SET']);
  // topology: structure (colors, PMI) may point at faces and edges, but must not drag their geometry into every batch
  const STOP = new Set([...SOLID, 'CLOSED_SHELL', 'OPEN_SHELL', 'ORIENTED_CLOSED_SHELL', 'ORIENTED_OPEN_SHELL', 'CONNECTED_FACE_SET', 'ADVANCED_FACE',
    'FACE_SURFACE', 'ORIENTED_FACE', 'FACE_BOUND', 'FACE_OUTER_BOUND', 'EDGE_LOOP', 'POLY_LOOP', 'VERTEX_LOOP', 'ORIENTED_EDGE', 'EDGE_CURVE', 'SUBEDGE',
    'VERTEX_POINT', 'TRIANGULATED_FACE', 'COMPLEX_TRIANGULATED_FACE']);
  const CHUNK = 32 << 20, FOOTER = new TextEncoder().encode('ENDSEC;\nEND-ISO-10303-21;\n');

  class Grow {   // growable typed array
    constructor(T, n = 1 << 16) { this.T = T; this.a = new T(n); this.n = 0; }
    push(v) { if (this.n === this.a.length) this.grow(this.n + 1); this.a[this.n++] = v; }
    grow(min) { let l = this.a.length * 2; while (l < min) l *= 2; const b = new this.T(l); b.set(this.a); this.a = b; }
    trim() { return this.a.subarray(0, this.n); }
  }

  /** one streaming pass: offset, length, type and references of every entity */
  async function scan(blob, progress = () => {}) {
    const size = blob.size;
    const head = new Uint8Array(await blob.slice(0, Math.min(size, 1 << 20)).arrayBuffer());
    const headText = new TextDecoder('latin1').decode(head), m = /\bDATA\s*;/.exec(headText);
    if (!/ISO-10303-21/.test(headText) || !m) throw new Error('not a STEP (ISO 10303-21) file');
    const typeCode = new Map(), typeName = [];
    const code = (s) => { let c = typeCode.get(s); if (c === undefined) { c = typeName.length; typeName.push(s); typeCode.set(s, c); } return c; };
    code('');   // 0: complex entity "(A(..) B(..))"
    const ids = new Grow(Uint32Array, 1 << 18);            // entity id of each ord (ords run in file order)
    const start = new Grow(size < 2 ** 32 ? Uint32Array : Float64Array, 1 << 18), len = new Grow(Uint32Array, 1 << 18);
    const type = new Grow(Uint16Array, 1 << 18), refStart = new Grow(Uint32Array, 1 << 18), pool = new Grow(Uint32Array, 1 << 20);
    // byte state machine: 0 between entities, 1 id, 2 before '=', 3 type name, 4 body, 5 string, 6 ref, 7 comment
    let st = 0, ret = 0, prev = 0, id = 0, s0 = 0, r0 = 0, tname = '', ref = 0, done = false;
    for (let base = m.index + m[0].length; base < size && !done; base += CHUNK) {
      const buf = new Uint8Array(await blob.slice(base, Math.min(size, base + CHUNK)).arrayBuffer());
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        switch (st) {
          case 0:
            if (c === 35) { st = 1; id = 0; s0 = base + i; r0 = pool.n; }
            else if (prev === 47 && c === 42) { ret = 0; st = 7; }
            else if (c === 69 || c === 101) { done = true; i = buf.length; }   // ENDSEC
            break;
          case 1: if (c >= 48 && c <= 57) id = id * 10 + c - 48; else { st = 2; i--; } break;
          case 2: if (c === 61) { st = 3; tname = ''; } break;
          case 3:
            if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) { if (tname.length < 64) tname += String.fromCharCode(c); }
            else if ((c === 32 || c === 10 || c === 13 || c === 9) && !tname) { /* spaces before the name */ }
            else { st = 4; i--; }
            break;
          case 4:
            if (c === 39) st = 5;
            else if (c === 35) { st = 6; ref = 0; }
            else if (prev === 47 && c === 42) { ret = 4; st = 7; }
            else if (c === 59) {   // end of the entity
              ids.push(id); start.push(s0); len.push(base + i + 1 - s0); type.push(code(tname.toUpperCase())); refStart.push(r0);
              st = 0;
            }
            break;
          case 5: if (c === 39) st = 4; break;   // '' inside a string toggles twice
          case 6:
            if (c >= 48 && c <= 57) ref = ref * 10 + c - 48;
            else { pool.push(ref); st = 4; i--; }
            break;
          case 7: if (prev === 42 && c === 47) { st = ret; prev = 0; continue; } break;
        }
        prev = c;
      }
      progress(Math.min(1, (base + CHUNK) / size));
    }
    refStart.push(pool.n);
    return new Index(blob, head.slice(0, m.index + m[0].length), typeName, ids.trim(), start.trim(), len.trim(), type.trim(), refStart.trim(), pool.trim());
  }

  class Index {
    constructor(blob, header, typeName, ids, start, len, type, refStart, pool) {
      Object.assign(this, { blob, header, typeName, start, len, type, refStart, pool });
      const n = this.n = start.length;
      // id -> ord: ids are sparse (Onshape) and usually ascending; a sorted table and binary search, then refs become ords once
      let sorted = true; for (let o = 1; o < n && sorted; o++) sorted = ids[o] > ids[o - 1];
      if (sorted) { this.sid = ids; this.sord = null; }
      else {
        const perm = Uint32Array.from({ length: n }, (_, o) => o).sort((a, b) => ids[a] - ids[b]);
        this.sid = Uint32Array.from(perm, o => ids[o]); this.sord = perm;
      }
      for (let k = 0; k < pool.length; k++) pool[k] = this.ord(pool[k]) + 1;   // pool now holds ord + 1 (0: missing)
      const isSolid = typeName.map(t => SOLID.has(t)), isStop = typeName.map(t => STOP.has(t));
      this.flag = new Uint8Array(n);   // 1 geometry (under a solid), 2 structure (kept in every batch)
      this.keep = new Uint32Array(n); this.drop = new Uint32Array(n); this.stamp = 0;
      this.solids = [];
      for (let o = 0; o < n; o++) if (isSolid[type[o]]) this.solids.push(o);
      const stack = new Grow(Uint32Array);
      const walk = (roots, bit, stop) => {
        for (const r of roots) { if (this.flag[r] & bit) continue; this.flag[r] |= bit; stack.push(r); }
        while (stack.n) {
          const o = stack.a[--stack.n];
          for (let k = refStart[o]; k < refStart[o + 1]; k++) {
            const q = pool[k] - 1;
            if (q < 0 || (this.flag[q] & bit) || (stop && isStop[type[q]])) continue;
            this.flag[q] |= bit; stack.push(q);
          }
        }
      };
      walk(this.solids, 1, false);
      const roots = []; for (let o = 0; o < n; o++) if (!(this.flag[o] & 1) && !isStop[type[o]]) roots.push(o);
      walk(roots, 2, true);
      this.structBytes = 0; for (let o = 0; o < n; o++) if (this.flag[o] & 2) this.structBytes += len[o] + 1;
      // connected parts of the structure, so a batch only carries the assemblies its solids belong to. Entities many
      // others point at (contexts, units, a part placed hundreds of times) would join everything: they go in every
      // batch with what they point at (flag 4) and do not connect.
      const indeg = new Uint32Array(n);
      for (let k = 0; k < pool.length; k++) { const q = pool[k] - 1; if (q >= 0) indeg[q]++; }
      // whole words only: SHAPE_DEFINITION_REPRESENTATION is not a PRESENTATION, CONTEXT_DEPENDENT_SHAPE_REPRESENTATION not a CONTEXT
      const hubType = typeName.map(t => /CONTEXT$|UNIT|(^|_)PRESENTATION(_|$)|DRAUGHTING|COLOUR|STYLE/.test(t));
      const isHub = (o) => indeg[o] > 256 || hubType[type[o]];
      const comp = this.comp = new Int32Array(n).fill(-1);
      const find = (o) => { let r = o; while (comp[r] !== r) r = comp[r]; while (comp[o] !== r) { const nx = comp[o]; comp[o] = r; o = nx; } return r; };
      const hubs = [];
      for (let o = 0; o < n; o++) if (this.flag[o] & 2) { if (isHub(o)) hubs.push(o); else comp[o] = o; }
      for (let o = 0; o < n; o++) {
        if (comp[o] < 0) continue;
        for (let k = refStart[o]; k < refStart[o + 1]; k++) {
          const q = pool[k] - 1;
          if (q < 0 || comp[q] < 0) continue;
          const a = find(o), b = find(q); if (a !== b) comp[a] = b;
        }
      }
      for (let o = 0; o < n; o++) if (comp[o] >= 0) comp[o] = find(o);
      // hubs and everything structural under them: always kept
      for (const h of hubs) this.flag[h] |= 4;
      for (const h of hubs) stack.push(h);
      while (stack.n) {
        const o = stack.a[--stack.n];
        for (let k = refStart[o]; k < refStart[o + 1]; k++) {
          const q = pool[k] - 1;
          if (q < 0 || !(this.flag[q] & 2) || (this.flag[q] & 4)) continue;
          this.flag[q] |= 4; stack.push(q);
        }
      }
      // which structure parts point at each solid
      this.solidComps = new Map();
      for (let o = 0; o < n; o++) {
        if (comp[o] < 0) continue;
        for (let k = refStart[o]; k < refStart[o + 1]; k++) {
          const q = pool[k] - 1;
          if (q >= 0 && isSolid[type[q]]) { let a = this.solidComps.get(q); if (!a) this.solidComps.set(q, a = []); if (!a.includes(comp[o])) a.push(comp[o]); }
        }
      }
      this.inBatch = new Uint32Array(n);
    }
    ord(id) {
      const a = this.sid; let lo = 0, hi = a.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >>> 1, v = a[mid]; if (v === id) return this.sord ? this.sord[mid] : mid; if (v < id) lo = mid + 1; else hi = mid - 1; }
      return -1;
    }
    /** geometry bytes each solid brings (structure excluded) */
    solidBytes() {
      const out = new Float64Array(this.solids.length);
      this.solids.forEach((s, i) => { this.mark([s]); let b = 0; for (const o of this.marked) b += this.len[o] + 1; out[i] = b; });
      return out;
    }
    /** keep[] = stamp for the closure of the given solids; marked = their non-structure entities, in file order */
    mark(solids) {
      const S = ++this.stamp, stack = [...solids], marked = [];
      for (const s of solids) this.keep[s] = S;
      while (stack.length) {
        const o = stack.pop();
        if (!(this.flag[o] & 2)) marked.push(o);
        for (let k = this.refStart[o]; k < this.refStart[o + 1]; k++) {
          const q = this.pool[k] - 1;
          if (q < 0 || this.keep[q] === S) continue;
          this.keep[q] = S; stack.push(q);
        }
      }
      this.marked = marked.sort((a, b) => a - b);
      return S;
    }
    /** consecutive solids grouped so each batch carries about `limit` bytes of geometry and at most maxSolids
     *  solids (OpenCascade slows down faster than linearly with the size of one file) */
    plan(limit, maxSolids = Infinity) {
      const sb = this.solidBytes(), batches = []; let cur = [], b = 0;
      this.solids.forEach((s, i) => {
        if (cur.length && (b + sb[i] > limit || cur.length >= maxSolids)) { batches.push(cur); cur = []; b = 0; }
        cur.push(s); b += sb[i];
      });
      if (cur.length) batches.push(cur);
      return batches;
    }
    /** structure text, read once */
    async loadStructure() {
      if (this.st) return;
      const ords = []; for (let o = 0; o < this.n; o++) if (this.flag[o] & 2) ords.push(o);
      const buf = new Uint8Array(this.structBytes), off = new Uint32Array(ords.length + 1);
      let p = 0, i = 0;
      await this.read(ords, (o, bytes) => { off[i++] = p; buf.set(bytes, p); p += bytes.length; });
      off[i] = p;
      this.st = { ords, buf, off };
    }
    /** calls fn(ord, bytes) for the given ords (sorted by file position), reading the file in merged ranges */
    async read(ords, fn) {
      for (let i = 0; i < ords.length;) {
        let j = i; const a = this.start[ords[i]];
        while (j + 1 < ords.length && this.start[ords[j + 1]] - (this.start[ords[j]] + this.len[ords[j]]) < (1 << 20) && this.start[ords[j + 1]] + this.len[ords[j + 1]] - a < (48 << 20)) j++;
        const b = this.start[ords[j]] + this.len[ords[j]];
        const chunk = new Uint8Array(await this.blob.slice(a, b).arrayBuffer());
        for (let k = i; k <= j; k++) { const s = this.start[ords[k]] - a; fn(ords[k], chunk.subarray(s, s + this.len[ords[k]])); }
        i = j + 1;
      }
    }
    /** a complete STEP file with the structure and only these solids */
    async build(solids) {
      await this.loadStructure();
      const S = this.mark(solids), st = this.st;
      for (const s of solids) for (const c of this.solidComps.get(s) || []) this.inBatch[c] = S;
      const used = (q) => (this.flag[q] & 4) || this.inBatch[this.comp[q]] === S;   // structure this batch needs
      for (const o of st.ords) if (!used(o) && this.keep[o] !== S) this.drop[o] = S;
      const kept = (q) => q < 0 || this.keep[q] === S || ((this.flag[q] & 2) && this.drop[q] !== S);
      // structure entities pointing at other solids' geometry: drop them if the pointer is a plain attribute,
      // otherwise take the reference out of its list. Dropping can orphan others, so repeat until nothing changes.
      const edited = new Map();
      for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < st.ords.length; i++) {
          const o = st.ords[i];
          if (this.drop[o] === S) continue;
          let bad = false;
          for (let k = this.refStart[o]; k < this.refStart[o + 1] && !bad; k++) bad = !kept(this.pool[k] - 1);
          if (!bad) continue;
          const out = this.edit(st.buf.subarray(st.off[i], st.off[i + 1]), kept);
          if (out) edited.set(i, out); else { this.drop[o] = S; edited.delete(i); changed = true; }
        }
      }
      let total = this.header.length + 1 + FOOTER.length;
      for (let i = 0; i < st.ords.length; i++) if (this.drop[st.ords[i]] !== S) total += (edited.get(i) || st.buf.subarray(st.off[i], st.off[i + 1])).length + 1;
      for (const o of this.marked) total += this.len[o] + 1;
      const out = new Uint8Array(total); let p = 0;
      const put = (b) => { out.set(b, p); p += b.length; out[p++] = 10; };
      put(this.header);
      for (let i = 0; i < st.ords.length; i++) if (this.drop[st.ords[i]] !== S) put(edited.get(i) || st.buf.subarray(st.off[i], st.off[i + 1]));
      await this.read(this.marked, (o, bytes) => put(bytes));
      out.set(FOOTER, p); p += FOOTER.length;
      return out.subarray(0, p);
    }
    /** the entity without references to entities that are not kept, or null when one of them is a plain attribute */
    edit(src, kept) {
      const out = new Uint8Array(src.length); let p = 0, i = 0, depth = 0, base = 0, inStr = false;
      while (i < src.length && src[i] !== 61) out[p++] = src[i++];   // "#12" up to '='
      let k = i + 1; while (src[k] === 32 || src[k] === 10 || src[k] === 13) k++;
      base = src[k] === 40 ? 2 : 1;   // complex entity: "(A(..) B(..))", attributes one level deeper
      for (; i < src.length; i++) {
        const c = src[i];
        if (inStr) { out[p++] = c; if (c === 39) inStr = false; continue; }
        if (c === 39) { inStr = true; out[p++] = c; continue; }
        if (c === 40) { depth++; out[p++] = c; continue; }
        if (c === 41) { depth--; out[p++] = c; continue; }
        if (c === 35) {
          let j = i + 1, id = 0; while (j < src.length && src[j] >= 48 && src[j] <= 57) id = id * 10 + src[j++] - 48;
          if (kept(this.ord(id))) { out.set(src.subarray(i, j), p); p += j - i; i = j - 1; continue; }
          if (depth <= base) return null;
          // drop "#id" and one neighbouring comma
          while (j < src.length && (src[j] === 32 || src[j] === 10 || src[j] === 13)) j++;
          if (src[j] === 44) j++;
          else { while (p && (out[p - 1] === 32 || out[p - 1] === 10 || out[p - 1] === 13)) p--; if (out[p - 1] === 44) p--; }
          i = j - 1; continue;
        }
        out[p++] = c;
      }
      return out.slice(0, p);
    }
  }
  g.StepSplit = { scan };
})(typeof self !== 'undefined' ? self : globalThis);

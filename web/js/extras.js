// UI helpers: Java syntax highlighting, telemetry graph, picking a start pose on the field.
import * as THREE from 'three';

// ------------------------------------------------------------------ Java highlighting (overlay under a transparent textarea)
const KW = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if ' +
  'implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this ' +
  'throw throws transient try void volatile while var true false null').split(' '));
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@\w+)|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?\b)|(\b[A-Za-z_]\w*\b)/g;
const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function highlightJava(src) {
  let out = '', last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index)); last = m.index + m[0].length;
    const t = esc(m[0]);
    if (m[1]) out += `<span class="c">${t}</span>`;
    else if (m[2]) out += `<span class="s">${t}</span>`;
    else if (m[3]) out += `<span class="a">${t}</span>`;
    else if (m[4]) out += `<span class="n">${t}</span>`;
    else if (KW.has(m[5])) out += `<span class="k">${t}</span>`;
    else if (/^[A-Z]/.test(m[5])) out += `<span class="t">${t}</span>`;
    else out += t;
  }
  return out + esc(src.slice(last)) + '\n';
}

// ------------------------------------------------------------------ telemetry graph: numbers after "caption : " are plotted over sim time
export class TeleGraph {
  constructor(canvas, list) { this.c = canvas; this.list = list; this.series = new Map(); this.on = new Set(); this.window = 15; }
  reset() { this.series.clear(); this.list.innerHTML = ''; }
  push(t, lines) {
    for (const line of lines) {
      const m = line.match(/^\s*([^:|]{1,40}?)\s*:\s*(-?\d+(?:\.\d+)?)/);
      if (!m) continue;
      let s = this.series.get(m[1]);
      if (!s) {
        s = []; this.series.set(m[1], s);
        const lab = document.createElement('label'), cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = this.on.size < 2; if (cb.checked) this.on.add(m[1]);
        cb.onchange = () => cb.checked ? this.on.add(m[1]) : this.on.delete(m[1]);
        lab.append(cb, document.createTextNode(m[1])); this.list.appendChild(lab);
      }
      s.push([t, +m[2]]);
      while (s.length && s[0][0] < t - this.window) s.shift();
    }
  }
  draw() {
    const c = this.c, g = c.getContext('2d'), W = c.width = c.clientWidth || 400, H = c.height = c.clientHeight || 140;
    g.clearRect(0, 0, W, H);
    const sel = [...this.on].map(k => [k, this.series.get(k) || []]).filter(([, s]) => s.length > 1);
    if (!sel.length) { g.fillStyle = '#6b7785'; g.font = '12px system-ui'; g.fillText('Tick the values above. Any telemetry.addData with a number shows up here.', 8, 20); return; }
    const colors = ['#f2c230', '#4fc3f7', '#ef5350', '#9ccc65', '#ce93d8', '#ffab40'];
    const tMax = Math.max(...sel.map(([, s]) => s[s.length - 1][0])), tMin = tMax - this.window;
    sel.forEach(([name, s], i) => {
      let lo = Math.min(...s.map(p => p[1])), hi = Math.max(...s.map(p => p[1])); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      g.strokeStyle = colors[i % colors.length]; g.lineWidth = 1.5; g.beginPath();
      s.forEach(([t, v], k) => { const x = (t - tMin) / this.window * W, y = H - 6 - (v - lo) / (hi - lo) * (H - 22); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      g.fillStyle = g.strokeStyle; g.font = '11px Consolas, monospace';
      g.fillText(`${name}: ${s[s.length - 1][1]}  [${+lo.toFixed(3)} .. ${+hi.toFixed(3)}]`, 6, 13 + i * 13);
    });
  }
}

// ------------------------------------------------------------------ click on the field (z = 0) -> field coordinates
export function fieldPointFromClick(renderer, ev) {
  const r = renderer.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, renderer.cam);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p) ? p : null;
}

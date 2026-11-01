// Bridge to Java (compiles and runs the OpMode). With the local server (start.bat) everything goes over HTTP except the
// per-tick sync, which uses a WebSocket when the server offers one: a fetch costs 1-6 ms in the browser, a socket ~0.1 ms.
// Without it (the hosted site) the same Java code runs in the page on CheerpJ, a JVM in WebAssembly: docs/browser-java.md.
async function post(path, body) {
  if (mode === 'browser') return inBrowser(path, body);
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return check(await r.json());
}
function check(j) {
  if (j.fatal) throw new Error(j.fatal + (j.cause ? ' / ' + j.cause : ''));
  return j;
}

const ws = { sock: null, port: null, next: 1, waiting: new Map() };
function openSocket(port) {
  if (ws.sock || port == null || port < 0) return;
  const s = new WebSocket(`ws://${location.hostname}:${port}/`);
  ws.port = port;
  s.onopen = () => { ws.sock = s; };
  s.onmessage = (e) => {
    const i = e.data.indexOf('\n'), p = ws.waiting.get(+e.data.slice(0, i));
    if (!p) return;
    ws.waiting.delete(+e.data.slice(0, i));
    try { p.res(check(JSON.parse(e.data.slice(i + 1)))); } catch (err) { p.rej(err); }
  };
  s.onclose = () => {                     // server restarted: fail what is pending, the next status poll reconnects
    if (ws.sock === s) ws.sock = null;
    for (const p of ws.waiting.values()) p.rej(new Error('connection to the simulator closed'));
    ws.waiting.clear();
  };
}
function viaSocket(path, body) {
  return new Promise((res, rej) => { const id = ws.next++; ws.waiting.set(id, { res, rej }); ws.sock.send(`${id}\n${path}\n${JSON.stringify(body)}`); });
}

// in-browser JVM: loaded on first use, ftcsim.jar (SDK + bridge + examples) and ecj.jar come from web/java/
const CHEERPJ = 'https://cjrtnc.leaningtech.com/5.0/loader.js';
let mode = null, cj = null;                 // mode: 'local' (start.bat answers) | 'browser'
// the JRE parts a build + run needs, fetched in parallel at start instead of one by one later (a cold build took
// 74 s, mostly waiting): refresh with cjGetRuntimeResources() in the console after Build + Init + Start
const PRELOAD = {"/lt/8/jre/lib/rt.jar":[0,131072,10223616,10878976,11272192,11665408,11927552,12058624,12320768,12582912,15073280,15335424,15466496,15597568,17694720,17956864,18350080,18612224,18743296,18874368,19005440,19136512,20840448,20971520,21233664,21364736,21495808,21626880,21757952,21889024,22151168,23461888,23724032,27000832],"/lt/etc/users":[0,131072],"/lt/etc/localtime":[],"/lt/8/jre/lib/cheerpj-awt.jar":[0,131072],"/lt/8/lib/ext/meta-index":[0,131072],"/lt/8/lib/ext":[],"/lt/8/lib/ext/index.list":[],"/lt/8/lib/ext/localedata.jar":[],"/lt/8/jre/lib/jsse.jar":[0,131072,786432,917504],"/lt/8/jre/lib/jce.jar":[0,131072],"/lt/8/jre/lib/charsets.jar":[0,131072,1703936,1835008],"/lt/8/jre/lib/resources.jar":[0,131072,1048576,1179648],"/lt/8/jre/lib/javaws.jar":[0,131072,1441792,1703936],"/lt/8/lib/ext/sunec.jar":[],"/lt/8/lib/ext/sunjce_provider.jar":[],"/lt/8/lib/ext/zipfs.jar":[],"/lt/8/jre/lib/meta-index":[0,131072],"/lt/8/jre/lib":[]};
const step = (s) => console.info(`[java] ${s} ${Math.round(performance.now())} ms`);
function cheerpj() {
  return cj ||= (async () => {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = CHEERPJ; s.onload = res; s.onerror = () => rej(new Error('could not load CheerpJ')); document.head.appendChild(s); });
    step('loader');
    await cheerpjInit({ version: 8, status: 'none', preloadResources: PRELOAD });
    step('jvm');
    const base = '/app' + new URL('java/', location.href).pathname;     // CheerpJ sees the web server under /app/
    const lib = await cheerpjRunLibrary(`${base}ftcsim.jar:${base}ecj.jar`);
    const api = await lib.ftcsim.server.BrowserApi;
    await api.setup(base);
    step('ready');
    return api;
  })();
}
let queue = Promise.resolve();               // CheerpJ takes one JS -> Java call at a time ("Java code still running")
function inBrowser(path, body) {
  const run = queue.then(async () => check(JSON.parse(await (await cheerpj()).call(path, JSON.stringify(body || {})))));
  queue = run.catch(() => {});
  return run;
}

export const bridge = {
  compile: (files) => post('/api/compile', { files }),
  init: (cls, name, devices, t, sensors) => post('/api/init', { cls, name, devices, t, sensors }),
  start: () => post('/api/start'),
  stop: () => post('/api/stop'),
  async status() { const s = await post('/api/status'); openSocket(s.wsPort); return s; },
  examples: () => post('/api/examples'),
  sync: (t, sensors, gp, timeout) => ws.sock?.readyState === 1 ? viaSocket('/api/sync', { t, sensors, gp, timeout }) : post('/api/sync', { t, sensors, gp, timeout }),
  async online() {
    if (mode === 'browser') return true;
    try { await this.status(); mode = 'local'; return true; }
    catch { if (mode === 'local' || location.protocol === 'file:') return false; mode = 'browser'; cheerpj().catch(() => {}); return true; }
  },
  get transport() { return mode === 'browser' ? 'browser' : ws.sock?.readyState === 1 ? 'websocket' : 'http'; },
};

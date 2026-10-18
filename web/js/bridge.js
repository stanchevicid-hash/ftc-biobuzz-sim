// Bridge to the local Java server (compiles and runs the OpMode). Everything goes over HTTP except the per-tick sync,
// which uses a WebSocket when the server offers one: a fetch costs 1-6 ms in the browser, a socket message ~0.1 ms.
async function post(path, body) {
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

export const bridge = {
  compile: (files) => post('/api/compile', { files }),
  init: (cls, name, devices, t, sensors) => post('/api/init', { cls, name, devices, t, sensors }),
  start: () => post('/api/start'),
  stop: () => post('/api/stop'),
  async status() { const s = await post('/api/status'); openSocket(s.wsPort); return s; },
  examples: () => post('/api/examples'),
  sync: (t, sensors, gp, timeout) => ws.sock?.readyState === 1 ? viaSocket('/api/sync', { t, sensors, gp, timeout }) : post('/api/sync', { t, sensors, gp, timeout }),
  async online() { try { await this.status(); return true; } catch { return false; } },
  get transport() { return ws.sock?.readyState === 1 ? 'websocket' : 'http'; },
};

// Serves web/ the way Netlify does (static files only, no Java server, Range requests for CheerpJ):
//   node tests/serve-static.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = normalize(join(import.meta.dirname, '..', 'web'));
const port = +(process.argv[2] || process.env.PORT || 8752);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.jar': 'application/java-archive' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!f.startsWith(root) || !(await stat(f).catch(() => null))?.isFile()) { res.writeHead(404).end('not found'); return; }
  const body = await readFile(f), m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const head = { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (!m) { res.writeHead(200, head).end(body); return; }
  const a = +m[1], b = Math.min(m[2] ? +m[2] : body.length - 1, body.length - 1);
  res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${body.length}` }).end(body.subarray(a, b + 1));
}).listen(port, () => console.log(`static web/ on http://localhost:${port}/`));

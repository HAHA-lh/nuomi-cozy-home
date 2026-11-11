import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.NUOMI_COZY_PORT || 8770);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.txt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8' };
const server = createServer((req, res) => {
  let path;
  try { path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end('Invalid URL'); return; }
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const info = statSync(path);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') res.end(); else createReadStream(path).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} already in use. Open http://127.0.0.1:${port}/` : error); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Nuomi cozy prototype: http://127.0.0.1:${port}/`));

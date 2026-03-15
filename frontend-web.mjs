import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3211);
const DIST_DIR = path.join(process.cwd(), 'dist');

function detectMime(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(DIST_DIR, requested);
  const safePath = filePath.startsWith(DIST_DIR) ? filePath : DIST_DIR;
  const target = await fs.stat(safePath).then(() => safePath).catch(() => path.join(DIST_DIR, 'index.html'));
  res.statusCode = 200;
  res.setHeader('Content-Type', detectMime(target));
  res.end(await fs.readFile(target));
}

const server = createServer(async (req, res) => {
  if (!DIST_DIR) {
    res.statusCode = 500;
    res.end('Missing dist directory.');
    return;
  }

  try {
    await serveStatic(res, new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`).pathname);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(String(error?.message || error));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[web-ui] listening on:`);
  console.log(`  - Local:   http://localhost:${PORT}`);

  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  - Network: http://${net.address}:${PORT}`);
      }
    }
  }
});

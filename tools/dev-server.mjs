/**
 * dev-server.mjs — local stand-in for the Netlify layer.
 *
 * In production, Netlify publishes public/ and rewrites /api/* to the Render
 * API (netlify.toml). The Express server in server/ is API-only and never
 * serves the frontend, so running it alone gives you no UI. This reproduces
 * the Netlify half:
 *
 *   public/          -> served statically
 *   /api/*           -> proxied to the API (default http://127.0.0.1:3000,
 *                        matching server/.env.example's PORT)
 *
 * Proxying rather than pointing the frontend at a second origin keeps every
 * request same-origin from the browser's point of view, exactly as in
 * production — so CORS never enters the picture.
 *
 * Copied from the same-named tool in TM Admin / TM Story (both already
 * ported the shared design-token layer; see ../../design-token-port.md).
 * TM Game's own registered Discord redirect is localhost:8080 (see
 * .env.example's DISCORD_REDIRECT_URI), same as TM Admin's, and its
 * playwright.config.js already assumes 8080 too — so this defaults there
 * rather than picking a fresh port to avoid a collision the way TM Story's
 * variant (8081) had to.
 *
 *   node tools/dev-server.mjs          # then start the API: npm start
 *
 * Env: PORT (default 8080), API_TARGET (default http://127.0.0.1:3000)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 8080;
const API = new URL(process.env.API_TARGET || 'http://127.0.0.1:3000');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  // ── /api/* and /auth/* -> the Express API ──
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) {
    const proxied = http.request(
      { hostname: API.hostname, port: API.port, path: req.url, method: req.method, headers: { ...req.headers, host: API.host } },
      (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); },
    );
    proxied.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'DEV_PROXY', message: `API not reachable at ${API.origin} — start it with: npm start`, detail: e.code,
      }));
    });
    return req.pipe(proxied);
  }

  // ── everything else -> static file from public/ ──
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 ' + rel); }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',   // always serve the CSS you just edited
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  TM Game dev server`);
  console.log(`  frontend  http://localhost:${PORT}`);
  console.log(`  login     http://localhost:${PORT}/login.html`);
  console.log(`  /api,/auth -> ${API.origin}  (start separately: npm start)\n`);
});

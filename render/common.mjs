// 渲染脚本共用：本地静态服务器 + 打开渲染页
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node-tools/node_modules/playwright');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.css': 'text/css',
};

// onFrame(query, buffer) → Promise：渲染页把原始像素 POST 到 /frame
export function startServer(onFrame = null) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/frame' && onFrame) {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          try {
            await onFrame(Object.fromEntries(url.searchParams), Buffer.concat(chunks));
            res.writeHead(200);
            res.end('ok');
          } catch (e) {
            res.writeHead(500);
            res.end(String(e));
          }
        });
        return;
      }
      const p = decodeURIComponent(url.pathname);
      const f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(f, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

export async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-vsync'] });
}

export async function openFilm(browser, port, width) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text());
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/film/index.html?w=${width}`);
  await page.waitForFunction(() => window.FILM && (window.FILM.isReady || window.FILM.error), null, { timeout: 180000 });
  const err = await page.evaluate(() => window.FILM.error);
  if (err) throw new Error(err);
  return page;
}

export function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[key] = v;
    }
  }
  return a;
}

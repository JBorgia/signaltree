#!/usr/bin/env node
/**
 * serve-dist.mjs — dependency-free static server for the built demo.
 *
 * Serves dist/apps/demo/browser (override with DEMO_DIST) with an SPA
 * fallback to index.html so deep links like /entity-collection resolve.
 * Used by the route-smoke Playwright suite (route-smoke.config.ts) locally
 * and in CI (validate.yml demo-route-smoke job).
 *
 * Usage: node scripts/playwright/serve-dist.mjs [port]   (default 4173)
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DIST_DIR = path.resolve(
  REPO_ROOT,
  process.env.DEMO_DIST ?? 'dist/apps/demo/browser'
);
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.normalize(path.join(DIST_DIR, clean));
  if (!candidate.startsWith(DIST_DIR)) return null; // path traversal guard
  try {
    const s = await stat(candidate);
    if (s.isFile()) return candidate;
    if (s.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      await stat(index);
      return index;
    }
  } catch {
    /* fall through to SPA fallback */
  }
  return null;
}

// Verify the dist exists up front so the failure mode is obvious.
try {
  await stat(path.join(DIST_DIR, 'index.html'));
} catch {
  console.error(`[serve-dist] No index.html in ${DIST_DIR}`);
  console.error('[serve-dist] Build the demo first: npx nx build demo --configuration=production');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const file =
    (await resolveFile(req.url ?? '/')) ?? path.join(DIST_DIR, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('serve-dist error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-dist] serving ${DIST_DIR} at http://127.0.0.1:${PORT}`);
});

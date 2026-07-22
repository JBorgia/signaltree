#!/usr/bin/env node
/**
 * GitHub Pages SPA fallback with real HTTP 200s.
 *
 * GitHub Pages can only serve files that exist; the classic 404.html trick
 * makes deep links *render* but still return HTTP 404 — which search engines
 * and AI crawlers treat as a dead page. This script copies the built
 * index.html into <route>/index.html for every static route in the demo's
 * route config, so deep links return 200 with real content shells.
 *
 * Run after `nx build demo` and before deploying:
 *   node scripts/generate-spa-route-shells.mjs [distDir]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(
  repoRoot,
  process.argv[2] ?? 'dist/apps/demo/browser'
);
const routesFile = join(repoRoot, 'apps/demo/src/app/app.routes.ts');

const indexHtml = join(distDir, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`No index.html at ${indexHtml} — build the demo first.`);
  process.exit(1);
}

const source = readFileSync(routesFile, 'utf8');
const paths = [...source.matchAll(/path:\s*'([^']*)'/g)]
  .map((m) => m[1])
  .filter((p) => p !== '' && p !== '**' && !p.includes(':'));

let created = 0;
for (const routePath of paths) {
  const dir = join(distDir, routePath);
  mkdirSync(dir, { recursive: true });
  copyFileSync(indexHtml, join(dir, 'index.html'));
  created++;
}

// Keep 404.html as the fallback for anything not covered (wildcard redirect).
copyFileSync(indexHtml, join(distDir, '404.html'));

console.log(
  `SPA route shells: ${created} routes now return HTTP 200 (plus 404.html fallback).`
);

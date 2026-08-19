#!/usr/bin/env node
/**
 * CROSS-REVIEW — entry point.
 *
 *   node tools/cross-review.mjs --self-test [--model <provider/model>]
 *   node tools/cross-review.mjs M3 --rfc "DERIVATION M3" [--spec p] [--src p]
 *   node tools/cross-review.mjs --dry-run M3
 *
 * Accepts <target> as a row id, RFC heading, spec path, or file path.
 * Delegates to tools/cross-review/review.mjs for packet construction and transport.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const REVIEW = resolve(ROOT, 'tools/cross-review/review.mjs');

const args = process.argv.slice(2);
const forward = [];

// Detect the positional <target> (first non-flag arg)
let target = null;
let i = 0;
while (i < args.length) {
  const a = args[i];
  if (a.startsWith('--')) {
    // Flags and their values
    forward.push(a);
    if (['--model', '--rfc', '--row'].includes(a) && i + 1 < args.length) {
      forward.push(args[++i]);
    }
  } else if (!target) {
    target = a;
  } else {
    forward.push(a);
  }
  i++;
}

// Map <target> to --row. Derivation rows like M3, A1, S1 go directly.
// Spec/file paths get listed as --spec.
if (target) {
  const isRow = /^[A-Z]\d+$/.test(target);
  if (isRow) {
    forward.push('--row', target);
  } else if (/\.(spec|test)\.(ts|js|mjs)$/.test(target)) {
    // Infer row from filename or just use it as a spec
    if (!forward.includes('--row')) {
      forward.push('--row', 'ROW');
    }
    forward.push('--spec', target);
  } else if (existsSync(resolve(ROOT, target))) {
    if (!forward.includes('--row')) {
      forward.push('--row', 'ROW');
    }
    forward.push('--src', target);
  } else {
    // Treat as a row id or RFC heading
    if (!forward.includes('--row')) {
      forward.push('--row', target);
    }
  }
}

// Default model
if (!forward.includes('--model')) {
  forward.push('--model', 'openai/gpt-5');
}

// Run review.mjs
try {
  execFileSync('node', [REVIEW, ...forward], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
} catch (e) {
  process.exit(e.status || 1);
}

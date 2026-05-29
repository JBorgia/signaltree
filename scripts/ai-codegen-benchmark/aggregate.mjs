#!/usr/bin/env node
/**
 * aggregate.mjs — Produce a side-by-side scorecard comparing N runs
 * (cold, primed-llms, primed-llms+myths). Each run is a directory written
 * by runner.mjs containing summary.json.
 *
 * Usage:
 *   node aggregate.mjs <run-dir-1> <run-dir-2> ... > RESULTS-<date>.md
 *
 * The first run is treated as the baseline; subsequent runs show deltas
 * against it.
 */
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const runDirs = process.argv.slice(2);
if (runDirs.length === 0) {
  console.error('Usage: aggregate.mjs <run-dir-1> <run-dir-2> ...');
  process.exit(1);
}

const runs = runDirs.map((d) => {
  const summary = JSON.parse(readFileSync(join(d, 'summary.json'), 'utf8'));
  return { dir: d, name: basename(d), summary };
});

const baseline = runs[0];
const libraries = baseline.summary.libraries;
const agents = baseline.summary.agents;
const prompts = Object.keys(baseline.summary.results);

function avg(arr) {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function pickCombined(run, prompt, lib, agent) {
  const r = run.summary.results[prompt]?.[lib]?.[agent];
  if (!r || typeof r.combinedScore !== 'number') return null;
  return r.combinedScore;
}

function pickIdiomatic(run, prompt, lib, agent) {
  const r = run.summary.results[prompt]?.[lib]?.[agent];
  if (!r || typeof r.idiomaticScore !== 'number') return null;
  return r.idiomaticScore;
}

// Per-library averages per run (combined score)
const libAverages = {};
for (const run of runs) {
  libAverages[run.name] = {};
  for (const lib of libraries) {
    const allCells = [];
    for (const p of prompts) for (const a of agents) {
      const s = pickCombined(run, p, lib, a);
      if (s !== null) allCells.push(s);
    }
    libAverages[run.name][lib] = avg(allCells);
  }
}

// Output
const lines = [];
lines.push(`# AI-codegen benchmark — multi-mode scorecard`);
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`## Runs compared`);
lines.push('');
for (const r of runs) {
  lines.push(`- **${r.name}** — ${r.summary.startedAt} (${r.summary.agents.length} agents, ${Object.keys(r.summary.results).length} prompts)`);
}
lines.push('');

lines.push(`## Per-library combined score (averaged across all agents × prompts)`);
lines.push('');
lines.push(`| Library | ${runs.map((r) => r.name).join(' | ')} | Δ baseline→last |`);
lines.push(`|---|${runs.map(() => '---').join('|')}|---|`);
for (const lib of libraries) {
  const scores = runs.map((r) => libAverages[r.name][lib]);
  const first = scores[0];
  const last = scores[scores.length - 1];
  const delta = first !== null && last !== null ? `${last - first > 0 ? '+' : ''}${last - first}pp` : '–';
  const bold = lib === 'signaltree' ? '**' : '';
  lines.push(`| ${bold}${lib}${bold} | ${scores.map((s) => s ?? '–').join(' | ')} | ${delta} |`);
}
lines.push('');

lines.push(`## SignalTree-specific deep dive (per prompt × agent)`);
lines.push('');
for (const prompt of prompts) {
  lines.push(`### ${prompt}`);
  lines.push('');
  lines.push(`| Agent | ${runs.map((r) => r.name).join(' | ')} | Δ |`);
  lines.push(`|---|${runs.map(() => '---').join('|')}|---|`);
  for (const a of agents) {
    const scores = runs.map((r) => pickCombined(r, prompt, 'signaltree', a));
    const first = scores[0];
    const last = scores[scores.length - 1];
    const delta = first !== null && last !== null ? `${last - first > 0 ? '+' : ''}${last - first}` : '–';
    lines.push(`| ${a} | ${scores.map((s) => s ?? '–').join(' | ')} | ${delta} |`);
  }
  lines.push('');
}

lines.push(`## SignalTree per-agent average across all prompts`);
lines.push('');
lines.push(`| Agent | ${runs.map((r) => r.name).join(' | ')} | Δ baseline→last |`);
lines.push(`|---|${runs.map(() => '---').join('|')}|---|`);
for (const a of agents) {
  const perRun = runs.map((r) => {
    const cells = [];
    for (const p of prompts) {
      const s = pickCombined(r, p, 'signaltree', a);
      if (s !== null) cells.push(s);
    }
    return avg(cells);
  });
  const first = perRun[0];
  const last = perRun[perRun.length - 1];
  const delta = first !== null && last !== null ? `${last - first > 0 ? '+' : ''}${last - first}pp` : '–';
  lines.push(`| ${a} | ${perRun.map((s) => s ?? '–').join(' | ')} | ${delta} |`);
}
lines.push('');

// Headline lift
const finalSignaltree = libAverages[runs[runs.length - 1].name].signaltree;
const coldSignaltree = libAverages[runs[0].name].signaltree;
if (finalSignaltree !== null && coldSignaltree !== null) {
  const lift = finalSignaltree - coldSignaltree;
  lines.push(`## Headline lift`);
  lines.push('');
  lines.push(`SignalTree combined score: **${coldSignaltree}% (cold)** → **${finalSignaltree}% (fully primed)** — **+${lift} percentage points**.`);
  lines.push('');
}

// Failure-mode breakdown — list every invalid import / invalid method seen
lines.push(`## Failure-mode breakdown (final run — what's still wrong)`);
lines.push('');
const finalRun = runs[runs.length - 1];
const invalidImports = new Map();
const invalidMethods = new Map();
for (const p of prompts) {
  for (const a of agents) {
    const r = finalRun.summary.results[p]?.['signaltree']?.[a];
    if (!r) continue;
    if (r.imports?.invalid?.length) {
      for (const spec of r.imports.invalid) {
        invalidImports.set(spec, (invalidImports.get(spec) ?? 0) + 1);
      }
    }
    if (r.methods?.invalid?.length) {
      for (const call of r.methods.invalid) {
        invalidMethods.set(call, (invalidMethods.get(call) ?? 0) + 1);
      }
    }
  }
}

if (invalidImports.size === 0 && invalidMethods.size === 0) {
  lines.push(`No residual failures detected in SignalTree code after priming. 🎯`);
} else {
  if (invalidImports.size > 0) {
    lines.push(`### Hallucinated imports (still appearing in primed runs)`);
    lines.push('');
    lines.push(`| Spec | Count |`);
    lines.push(`|---|---|`);
    for (const [spec, count] of [...invalidImports.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| \`${spec}\` | ${count} |`);
    }
    lines.push('');
  }
  if (invalidMethods.size > 0) {
    lines.push(`### Hallucinated marker methods (still appearing in primed runs)`);
    lines.push('');
    lines.push(`| Call | Count |`);
    lines.push(`|---|---|`);
    for (const [call, count] of [...invalidMethods.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| \`${call}\` | ${count} |`);
    }
    lines.push('');
  }
}

console.log(lines.join('\n'));

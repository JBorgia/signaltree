#!/usr/bin/env node
/**
 * ai-codegen-benchmark/runner.mjs
 *
 * Dispatches prompts × libraries × agents and produces a score matrix.
 * Reproducible: prompts are fixed YAML files, library versions are pinned in
 * libraries/*.json, agent model versions are recorded per result.
 *
 * Status: scaffolding-only. Adapters are stubs; wire to real APIs before
 * running. See README.md for the full execution plan.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Minimal YAML parser — avoids adding a runtime dependency. Supports the
// subset of YAML used in our prompts: scalars, multiline `|` strings, nested
// maps, and string arrays. Throw early on unsupported syntax.
function parseYAMLPrompt(src) {
  const lines = src.split('\n');
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      // Array item (only string-array shape supported)
      if (line.startsWith('- ')) {
        const last = stack[stack.length - 1];
        if (!Array.isArray(last.obj)) {
          throw new Error(`Unexpected array item at line ${i + 1}: ${line}`);
        }
        last.obj.push(stripQuotes(line.slice(2).trim()));
        i++;
        continue;
      }
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (rest === '|') {
      // Multiline string. Capture lines with greater indent.
      const lines2 = [];
      i++;
      while (i < lines.length) {
        const nl = lines[i];
        const nlIndent = nl.length - nl.trimStart().length;
        if (nl.trim() && nlIndent <= indent) break;
        lines2.push(nl.slice(indent + 2));
        i++;
      }
      parent[key] = lines2.join('\n');
      continue;
    }
    if (rest === '') {
      // Nested map or array follows
      // Peek next non-empty line to decide
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = lines[j] ?? '';
      if (next.trim().startsWith('- ')) {
        parent[key] = [];
        stack.push({ obj: parent[key], indent });
      } else {
        parent[key] = {};
        stack.push({ obj: parent[key], indent });
      }
      i++;
      continue;
    }
    parent[key] = parseScalar(rest);
    i++;
  }
  return root;
}

function stripQuotes(s) {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}
function parseScalar(s) {
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map((x) => stripQuotes(x.trim())).filter(Boolean);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return stripQuotes(s);
}

// CLI args
const { values: args } = parseArgs({
  options: {
    library: { type: 'string' },
    agent: { type: 'string' },
    prompt: { type: 'string' },
    dryRun: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

const SELF_DIR = fileURLToPath(new URL('.', import.meta.url));
const PROMPTS_DIR = join(SELF_DIR, 'prompts');
const RESULTS_DIR = args.out ?? join(SELF_DIR, 'results', new Date().toISOString().replace(/[:.]/g, '-'));

const ALL_LIBRARIES = ['signaltree', 'ngrx-signals', 'ngrx-store', 'akita', 'elf'];
const ALL_AGENTS = ['claude', 'openai', 'gemini', 'perplexity']; // copilot has no public API

const libs = args.library ? [args.library] : ALL_LIBRARIES;
const agents = args.agent ? [args.agent] : ALL_AGENTS;

// Discover prompts
const promptFiles = readdirSync(PROMPTS_DIR)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  .filter((f) => !args.prompt || basename(f, extname(f)) === args.prompt);

if (!promptFiles.length) {
  console.error(`No prompts found (filter: ${args.prompt ?? '(none)'})`);
  process.exit(1);
}

console.log(`AI-codegen benchmark — runner`);
console.log(`Prompts: ${promptFiles.length}`);
console.log(`Libraries: ${libs.join(', ')}`);
console.log(`Agents: ${agents.join(', ')}`);
console.log(`Output: ${RESULTS_DIR}`);
console.log(`Dry-run: ${args.dryRun}`);
console.log('');

mkdirSync(RESULTS_DIR, { recursive: true });
mkdirSync(join(RESULTS_DIR, 'raw'), { recursive: true });
mkdirSync(join(RESULTS_DIR, 'compile'), { recursive: true });
mkdirSync(join(RESULTS_DIR, 'behavior'), { recursive: true });

// Load adapters. Strategy:
// - If OPENROUTER_API_KEY is set, ALL agents are routed through the single
//   OpenRouter adapter (which maps the agent alias to its OR model slug).
// - Otherwise, fall back to per-provider adapters (which require their own
//   API keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, etc.).
async function loadAdapter(name) {
  try {
    const mod = await import(`./adapters/${name}.mjs`);
    return mod.default ?? mod;
  } catch (err) {
    console.warn(`[adapter] ${name}: not implemented (${err.message}) — skipping`);
    return null;
  }
}

const useOpenRouter = !!process.env.OPENROUTER_API_KEY && !process.env.FORCE_DIRECT_ADAPTERS;
const adapters = {};
if (useOpenRouter) {
  console.log('[runner] Using OpenRouter for all agents (set FORCE_DIRECT_ADAPTERS=1 to use per-provider adapters instead).');
  const orAdapter = await loadAdapter('openrouter');
  if (!orAdapter) {
    console.error('[runner] OpenRouter adapter failed to load — aborting');
    process.exit(1);
  }
  for (const agent of agents) {
    // Wrap so the runner's per-cell call site can pass agent alias to OR adapter.
    adapters[agent] = (prompt, ctx) => orAdapter(prompt, { ...ctx, agent });
  }
} else {
  for (const agent of agents) {
    adapters[agent] = await loadAdapter(agent);
  }
}

// Main matrix
const summary = {
  startedAt: new Date().toISOString(),
  prompts: promptFiles.length,
  libraries: libs,
  agents: agents,
  results: {},
};

for (const file of promptFiles) {
  const promptId = basename(file, extname(file));
  const yaml = readFileSync(join(PROMPTS_DIR, file), 'utf8');
  const prompt = parseYAMLPrompt(yaml);
  summary.results[promptId] = {};

  for (const lib of libs) {
    summary.results[promptId][lib] = {};
    for (const agent of agents) {
      const cellKey = `${promptId}.${lib}.${agent}`;
      if (!adapters[agent]) {
        summary.results[promptId][lib][agent] = { skipped: 'adapter-not-implemented' };
        continue;
      }
      if (args.dryRun) {
        console.log(`[dry] would run ${cellKey}`);
        summary.results[promptId][lib][agent] = { dryRun: true };
        continue;
      }
      try {
        // Substitute <LIBRARY> token in the prompt text
        const libName =
          { signaltree: 'SignalTree', 'ngrx-signals': '@ngrx/signals', 'ngrx-store': '@ngrx/store', akita: 'Akita', elf: 'Elf' }[lib] ?? lib;
        const promptText = prompt.prompt.replaceAll('<LIBRARY>', libName);
        const generated = await adapters[agent](promptText, { library: lib });

        writeFileSync(join(RESULTS_DIR, 'raw', `${cellKey}.ts`), generated.code);

        // Score: idiomatic pattern matching
        const patterns = (prompt.expected_patterns || {})[lib] || {};
        const mustInclude = patterns.must_include || [];
        const mustNotInclude = patterns.must_not_include || [];
        const shouldIncludeOneOf = patterns.should_include_one_of || [];

        const includesAll = mustInclude.every((p) => generated.code.includes(p));
        const excludesAll = mustNotInclude.every((p) => !generated.code.includes(p));
        const includesOne =
          shouldIncludeOneOf.length === 0 ||
          shouldIncludeOneOf.some((p) => generated.code.includes(p));

        const idiomaticScore = (includesAll ? 50 : 0) + (excludesAll ? 25 : 0) + (includesOne ? 25 : 0);

        // (compile + behavior scoring left as TODO — requires Angular workspace harness)
        const result = {
          model: generated.model,
          idiomaticScore,
          mustInclude: { ok: includesAll, missing: mustInclude.filter((p) => !generated.code.includes(p)) },
          mustNotInclude: { ok: excludesAll, present: mustNotInclude.filter((p) => generated.code.includes(p)) },
          shouldIncludeOneOf: { ok: includesOne },
          compileScore: 'TODO',
          behaviorScore: 'TODO',
        };
        writeFileSync(join(RESULTS_DIR, 'compile', `${cellKey}.json`), JSON.stringify(result, null, 2));
        summary.results[promptId][lib][agent] = result;
        console.log(`✓ ${cellKey}  idiomatic=${idiomaticScore}/100`);
      } catch (err) {
        console.error(`✗ ${cellKey}: ${err.message}`);
        summary.results[promptId][lib][agent] = { error: err.message };
      }
    }
  }
}

summary.endedAt = new Date().toISOString();
writeFileSync(join(RESULTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

// Markdown summary
const md = renderMarkdownSummary(summary);
writeFileSync(join(RESULTS_DIR, 'summary.md'), md);
console.log(`\nDone. Results: ${RESULTS_DIR}`);

function renderMarkdownSummary(s) {
  const out = [];
  out.push(`# AI-codegen benchmark — ${s.startedAt}\n`);
  out.push(`Prompts: ${s.prompts} | Libraries: ${s.libraries.join(', ')} | Agents: ${s.agents.join(', ')}\n`);
  out.push(`## Idiomatic-pattern scores (compile + behavior TODO)\n`);
  out.push(`| Prompt | Library | ${s.agents.join(' | ')} |`);
  out.push(`|---|---|${s.agents.map(() => '---').join('|')}|`);
  for (const [pid, libs] of Object.entries(s.results)) {
    for (const [lib, agents] of Object.entries(libs)) {
      const cells = s.agents.map((a) => {
        const r = agents[a];
        if (!r) return '–';
        if (r.skipped) return `_${r.skipped}_`;
        if (r.error) return '❌';
        return `${r.idiomaticScore ?? '?'}`;
      });
      out.push(`| ${pid} | ${lib} | ${cells.join(' | ')} |`);
    }
  }
  return out.join('\n');
}

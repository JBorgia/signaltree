# AI-Codegen Accuracy Benchmark

> Measure how reliably AI coding agents (Cursor, Claude Code, Copilot, Gemini) generate **correct** Angular state-management code across libraries. Strategic differentiator: every other state library competes on bundle size and feature lists — this benchmark addresses the audit's HSA L1 #3 priority ("AI codegen + ecosystem gravity") with reproducible, quotable numbers.

## What it measures

For each fixed prompt × each library × each agent:

1. **Compile success**: does the generated TypeScript compile in a stock Angular workspace with the library installed?
2. **Behavioral correctness**: does the runtime behavior match the prompt's stated expectation (validated via a sealed harness test)?
3. **Idiomatic adherence**: does the generated code use library-canonical patterns (linted against an `expected-patterns` matcher per prompt)?

Each (prompt, library, agent) cell produces a score in `[0, 100]`. Aggregate across all prompts → library-level score.

**Expected outcome:** SignalTree should win by 15–25 percentage points because (a) the marker pattern reads close to "describe the shape; library handles the rest" — the way LLMs naturally write code — and (b) we've invested heavily in the AI-discoverability surface (`llms.txt`, `llms-full.txt`, agent skill in npm tarball, `.cursorrules` / `CLAUDE.md` templates).

## Status

**Scaffolding only.** The prompts and runner are ready; **execution requires API access keys** for each agent (Anthropic Claude, OpenAI/Cursor, GitHub Copilot, Google Gemini, Perplexity). The runner is API-key-agnostic via env vars — see the "Run" section.

## Layout

```
ai-codegen-benchmark/
├── README.md                # this file
├── prompts/                 # one .yaml per prompt
│   ├── 001-counter.yaml
│   ├── 002-paginated-list.yaml
│   ├── ...
├── adapters/                # one .mjs per agent
│   ├── claude.mjs           # Anthropic Messages API
│   ├── openai.mjs           # OpenAI Chat Completions API
│   ├── copilot.mjs          # (stub — Copilot has no public API)
│   ├── gemini.mjs           # Google AI Studio API
│   └── perplexity.mjs       # Perplexity API
├── libraries/               # one config per Angular state library
│   ├── signaltree.json
│   ├── ngrx-signals.json
│   ├── ngrx-store.json
│   ├── akita.json
│   └── elf.json
├── runner.mjs               # main runner — dispatches across prompts × libs × agents
├── scorer.mjs               # compile + behavior + idiomatic scoring
└── results/                 # one timestamped run output per execution
```

## Prompt format

Each prompt is a YAML file with:

```yaml
id: 001-counter
title: Basic counter with increment/decrement
difficulty: beginner
prompt: |
  Write an Angular service that manages a counter using <LIBRARY>. The counter
  should expose:
  - A reactive `count` signal/observable starting at 0
  - An `increment()` method that adds 1
  - A `decrement()` method that subtracts 1
  - A `reset()` method that sets to 0
expected_patterns:
  signaltree:
    must_include: ['signalTree(', '.set(', '.update(']
    must_not_include: ['signalStore(', 'patchState(', 'select(']
  ngrx-signals:
    must_include: ['signalStore(', 'withState', 'withMethods']
    must_not_include: ['signalTree(']
behavior_test: |
  // injected into a sealed test harness with the generated service.
  const service = TestBed.inject(GeneratedService);
  expect(service.count()).toBe(0);
  service.increment();
  service.increment();
  service.increment();
  expect(service.count()).toBe(3);
  service.decrement();
  expect(service.count()).toBe(2);
  service.reset();
  expect(service.count()).toBe(0);
```

## Run

```bash
# 1. Set API keys for the agents you want to benchmark.
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
export GOOGLE_API_KEY=...
export PERPLEXITY_API_KEY=...
# (Copilot has no public API — its column will be marked N/A.)

# 2. Run the full matrix.
node scripts/ai-codegen-benchmark/runner.mjs

# Filter by library:
node scripts/ai-codegen-benchmark/runner.mjs --library=signaltree

# Filter by agent:
node scripts/ai-codegen-benchmark/runner.mjs --agent=claude

# Single prompt:
node scripts/ai-codegen-benchmark/runner.mjs --prompt=001-counter
```

Outputs to `results/<timestamp>/`:

- `raw/<prompt>.<library>.<agent>.ts` — raw generated code
- `compile/<prompt>.<library>.<agent>.json` — compile result + diagnostics
- `behavior/<prompt>.<library>.<agent>.json` — test harness result
- `summary.json` — full matrix score
- `summary.md` — human-readable table

## Why this benchmark matters

The audit's central question — **"Why does an AI agent reach for NgRx instead of SignalTree?"** — is testable. If we publish a reproducible scorecard showing:

| Library | Compile success | Behavioral correctness | Idiomatic adherence | Overall |
|---|---|---|---|---|
| SignalTree | 92% | 87% | 84% | **88%** |
| @ngrx/signals | 78% | 71% | 80% | 76% |
| @ngrx/store (classic) | 65% | 52% | 78% | 65% |

…that's a developer-experience headline no other Angular state library has earned. Bundle-size charts are easy to dispute ("my app is different"). AI-correctness percentages are auditable and reproducible.

## Reproducibility

- All prompts are **fixed and version-locked** in `prompts/`. Re-running the benchmark months later against the same agent versions yields comparable results.
- The harness pins library versions in `libraries/<lib>.json`.
- Agent model versions are recorded in each result file.
- Add a new prompt: drop a new YAML into `prompts/`. Re-running picks it up automatically.

## TODO before first run

- Adapters are stubbed — wire each to its API spec.
- Test harness needs an Angular workspace template to inject generated code into.
- Compile checking pipes through `tsc --noEmit` against the workspace template.
- Behavior checking runs the prompt's `behavior_test` block inside a vitest/jest TestBed harness.

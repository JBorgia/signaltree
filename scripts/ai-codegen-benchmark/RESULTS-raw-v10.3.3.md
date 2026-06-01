# AI-codegen benchmark — multi-mode scorecard

Generated: 2026-06-01T12:39:28.871Z

## Runs compared

- **run-2026-05-29-cold** — 2026-05-29T20:58:31.612Z (6 agents, 8 prompts)
- **run-2026-06-01-cold** — 2026-06-01T07:17:11.859Z (6 agents, 8 prompts)
- **run-2026-05-29-primed-llms** — 2026-05-29T20:58:34.606Z (6 agents, 8 prompts)
- **run-2026-06-01-primed-llms** — 2026-06-01T07:17:14.367Z (6 agents, 8 prompts)
- **run-2026-05-29-primed-llms-myths** — 2026-05-29T20:58:36.897Z (6 agents, 8 prompts)
- **run-2026-06-01-primed-llms-myths** — 2026-06-01T07:17:16.865Z (6 agents, 8 prompts)

## Per-library combined score (averaged across all agents × prompts)

| Library | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ baseline→last |
|---|---|---|---|---|---|---|---|
| **signaltree** | 49 | 54 | 91 | 95 | 87 | 98 | +49pp |
| ngrx-signals | 86 | 87 | 80 | 75 | 82 | 76 | -10pp |
| ngrx-store | 91 | 93 | 88 | 89 | 88 | 95 | +4pp |
| akita | 94 | 94 | 85 | 92 | 85 | 91 | -3pp |
| elf | 94 | 99 | 87 | 92 | 87 | 94 | 0pp |

## SignalTree-specific deep dive (per prompt × agent)

### 001-counter

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 50 | 50 | 100 | 100 | 100 | 100 | +50 |
| openai | 63 | 75 | 100 | 100 | 100 | 100 | +37 |
| gemini | 50 | 50 | 100 | 100 | 100 | 100 | +50 |
| perplexity | 50 | 75 | 75 | 100 | 75 | 100 | +50 |
| haiku | 75 | 75 | 100 | 100 | 100 | 100 | +25 |
| gpt-mini | 75 | 50 | 100 | 100 | 100 | 100 | +25 |

### 002-paginated-users

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | 38 | 100 | 100 | 100 | 100 | +62 |
| openai | 50 | 50 | 92 | 100 | 100 | 100 | +50 |
| gemini | 38 | 38 | 63 | 63 | 25 | 63 | +25 |
| perplexity | 34 | 38 | 100 | 100 | 83 | 100 | +66 |
| haiku | 38 | 38 | 100 | 100 | 100 | 100 | +62 |
| gpt-mini | 38 | 38 | 100 | 92 | 83 | 100 | +62 |

### 003-debounced-search

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | 38 | 100 | 100 | 100 | 100 | +62 |
| openai | 84 | 50 | 100 | 100 | 100 | 100 | +16 |
| gemini | 38 | – | 100 | 75 | 75 | 100 | +62 |
| perplexity | 46 | 63 | 100 | 100 | 83 | – | – |
| haiku | 75 | 75 | 100 | 100 | 100 | 100 | +25 |
| gpt-mini | 38 | 75 | 100 | 100 | 100 | 100 | +62 |

### 004-derived-state

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 50 | 50 | 100 | 100 | 100 | 100 | +50 |
| openai | 50 | 50 | 100 | 100 | 100 | 100 | +50 |
| gemini | 50 | 50 | 75 | 75 | 63 | 100 | +50 |
| perplexity | 50 | 59 | 75 | 100 | 100 | – | – |
| haiku | 63 | 63 | 100 | 100 | 100 | 100 | +37 |
| gpt-mini | 63 | 50 | 100 | 100 | 88 | 100 | +37 |

### 005-form-marker

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | – | 100 | – | 100 | – | – |
| openai | 63 | – | 78 | – | 78 | – | – |
| gemini | 38 | – | 100 | – | 25 | – | – |
| perplexity | 75 | – | 63 | – | 63 | – | – |
| haiku | 63 | – | 74 | 83 | 75 | 83 | +20 |
| gpt-mini | 63 | – | 100 | 75 | 92 | 100 | +37 |

### 006-undo-redo

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | – | 100 | – | 100 | – | – |
| openai | 38 | – | 100 | – | 100 | – | – |
| gemini | 38 | – | 100 | – | 100 | – | – |
| perplexity | 59 | – | 83 | – | 75 | – | – |
| haiku | 38 | – | 100 | – | 75 | – | – |
| gpt-mini | 38 | – | 75 | – | 100 | – | – |

### 007-deep-state

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | – | 100 | – | 100 | – | – |
| openai | 71 | – | 92 | – | 92 | – | – |
| gemini | 46 | – | 63 | – | 63 | – | – |
| perplexity | 53 | – | 88 | – | 83 | – | – |
| haiku | 46 | – | 100 | – | 100 | – | – |
| gpt-mini | 38 | – | 100 | – | 88 | – | – |

### 008-multi-marker

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ |
|---|---|---|---|---|---|---|---|
| claude | 38 | – | 92 | – | 92 | – | – |
| openai | 29 | – | 92 | – | 92 | – | – |
| gemini | 38 | – | 63 | – | 63 | – | – |
| perplexity | 46 | – | 53 | – | 75 | – | – |
| haiku | 38 | – | 100 | – | 92 | – | – |
| gpt-mini | 46 | – | 92 | – | 100 | – | – |

## SignalTree per-agent average across all prompts

| Agent | run-2026-05-29-cold | run-2026-06-01-cold | run-2026-05-29-primed-llms | run-2026-06-01-primed-llms | run-2026-05-29-primed-llms-myths | run-2026-06-01-primed-llms-myths | Δ baseline→last |
|---|---|---|---|---|---|---|---|
| claude | 41 | 44 | 99 | 100 | 99 | 100 | +59pp |
| openai | 56 | 56 | 94 | 100 | 95 | 100 | +44pp |
| gemini | 42 | 46 | 83 | 78 | 64 | 91 | +49pp |
| perplexity | 52 | 59 | 80 | 100 | 80 | 100 | +48pp |
| haiku | 55 | 63 | 97 | 97 | 93 | 97 | +42pp |
| gpt-mini | 50 | 53 | 96 | 93 | 94 | 100 | +50pp |

## Headline lift

SignalTree combined score: **49% (cold)** → **98% (fully primed)** — **+49 percentage points**.

## Failure-mode breakdown (final run — what's still wrong)

### Hallucinated marker methods (still appearing in primed runs)

| Call | Count |
|---|---|
| `loginForm (form).data()` | 2 |


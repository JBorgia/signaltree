# AI-codegen benchmark — v10.2 final scorecard

**Date:** 2026-05-29
**Scope:** 8 prompts × 5 libraries × 6 agents × 3 priming modes = **720 cells**
**Models:** Claude Sonnet 4.6, GPT-5.4, Gemini 3.1 Pro, Perplexity Sonar Pro Search (frontier tier) + Claude Haiku 4.5, GPT-5.4-mini (cost tier)
**Scoring:** combined = average of (idiomatic-pattern, import-resolution, marker-method) where applicable

---

## Headline

> **SignalTree's AI-codegen accuracy goes from 49% (cold) to 91% (primed with `llms.txt`) — a +42 percentage-point lift from a single retrievable file.**

This validates the architectural bet: **discoverability is the answer.** Frontier models that don't know SignalTree natively can be retrofitted to write idiomatic code via one well-structured priming surface.

---

## Per-library combined score (avg across all 8 prompts × 6 agents)

| Library | Cold | Primed (llms.txt) | Primed (llms.txt + myths.md) | Δ best-vs-cold |
|---|---|---|---|---|
| **signaltree** | **49%** | **91%** | **87%** | **+42pp** |
| ngrx-signals | 86% | 80% | 82% | −4pp |
| ngrx-store | 91% | 88% | 88% | −3pp |
| akita | 94% | 85% | 85% | −9pp |
| elf | 94% | 87% | 87% | −7pp |

**Honest read:** SignalTree-specific priming context slightly degrades cross-library accuracy. Models occasionally try to cross-pollinate (e.g., reach for `signalTree(` when asked for NgRx). The 4–9pp regression on competitors is the cost of buying the +42pp on SignalTree — a worthwhile trade since users running this priming are using SignalTree, not the competitor.

---

## Per-agent SignalTree score (avg across 8 prompts)

| Agent | Cold | Primed llms | Primed llms+myths | Δ baseline→llms |
|---|---|---|---|---|
| claude (Sonnet 4.6) | 41 | **99** | 99 | **+58pp** |
| openai (GPT-5.4) | 56 | 94 | **95** | +39pp |
| gemini (3.1 Pro) | 42 | 83 | 64 | +41pp |
| perplexity (Sonar Pro) | 52 | 80 | 80 | +28pp |
| haiku (Claude Haiku 4.5) | 55 | **97** | 93 | +42pp |
| gpt-mini (GPT-5.4-mini) | 50 | 96 | 94 | +46pp |

**Insights:**

1. **Frontier-vs-cost-tier convergence.** Cold-run scores are roughly tier-agnostic (range 41–56). Primed-run scores are also tier-agnostic (range 80–99). **Priming closes the model-tier gap**: a primed Haiku (97) outscores a cold Sonnet (41) by **2.4×**.

2. **Claude Sonnet 4.6 hits ~ceiling** when primed (99/100). Headroom for further improvement is at the prompt/scorer level, not the model level.

3. **Perplexity Sonar Pro Search caps lower** (80) because it's tuned for retrieval+summarization, not code generation. For SignalTree-on-Sonar workflows, recommend pairing with a code-generation model.

---

## Surprising finding: adding `myths.md` to priming REGRESSED accuracy

Hypothesis going in: more priming context → more accurate primed runs. Result: **91% (llms.txt only) → 87% (llms.txt + myths.md)**. Specifically:

- **Gemini 3.1 Pro regressed sharply**: 83 → 64 (−19pp) when myths was added.
- Other models mostly flat or slightly regressed.

Three plausible explanations:

1. **Context dilution.** llms.txt is 13.5KB and tightly focused. myths.md is denser and discusses WRONG patterns extensively — models may be over-indexing on "what NOT to do" at the expense of "what TO do," producing defensive code that hits anti-pattern lists but misses canonical patterns.
2. **Length penalty on cheaper models.** The combined ~25KB priming exceeds what some models can effectively attend to. Frontier models (Claude 4.6, GPT-5.4) handle it fine; smaller models lose signal.
3. **Conflict between the two docs.** Subtle phrasing differences between llms.txt and myths.md (different examples, slightly different ordering) may create conflicting signals.

**Implication for v10.3:** prioritize **focused** priming over breadth. The disambiguation table now lives in BOTH llms.txt and llms-full.txt — consolidating future work there is preferable to maintaining a separate myths.md as priming input.

---

## Residual failure modes (what's still wrong in primed runs)

The scorer catalogues every hallucinated method call. Top failures in the primed-best run:

| Hallucination | Count | What it should be |
|---|---|---|
| `items (entityMap).subtotal()` | 2 | `.derived($ => ({ subtotal: ... }))` — derived state, not entityMap method |
| `loginForm (form).data()` | 4 | `formMarker()` (callable) — call the marker to get value |
| `users (asyncSource).addOne()` | 1 | `entityMap` is for mutation; asyncSource is read-only-after-load |
| `loginForm (form).isDirty()` | 1 | `.dirty` (no `is` prefix on form, unlike status marker) |

**Pattern:** All residuals are **marker-method confusion**, not package/import confusion. The disambiguation table eliminated the package/import class of errors entirely. The remaining gap is **marker method API surface** — specifically:

- `form()` marker accessor shape (callable vs `.data()`, `.dirty` vs `.isDirty()`)
- `entityMap` vs `asyncSource` boundary (when state is mutable vs load-only)
- `.derived()` discoverability (models reach for "method on collection" instead)

### v10.3 candidate fixes (next iteration)

1. **Expand status marker alias model** to other markers — add `.data()` alias on form (delegates to the callable). Apply "meet AI where it is" to all markers, not just status.
2. **Add a "Method discovery" section to llms.txt** — explicit table of which methods exist on which marker, formatted for retrieval grep.
3. **Sharpen `.derived()` example** — every prompt-relevant scenario (totals, computed booleans, filtered lists) shown in canonical form.

Expected lift: 91 → 95+ on next quarterly re-run.

---

## SignalTree per-prompt deep dive

### 001-counter (beginner, simple leaf state)
| Agent | Cold | llms | llms+myths |
|---|---|---|---|
| claude | 50 | 100 | 100 |
| openai | 63 | 100 | 100 |
| gemini | 50 | 100 | 100 |
| perplexity | 50 | 75 | 75 |
| haiku | 75 | 100 | 100 |
| gpt-mini | 75 | 100 | 100 |

### 002-paginated-users (intermediate, async + entityMap)
| Agent | Cold | llms | llms+myths |
|---|---|---|---|
| claude | 38 | 100 | 100 |
| openai | 50 | 92 | 100 |
| gemini | 38 | 63 | 25 |
| perplexity | 34 | 100 | 83 |
| haiku | 38 | 100 | 100 |
| gpt-mini | 38 | 100 | 83 |

(Full per-cell scores in `results/run-2026-05-29-*/summary.md` for prompts 003–008.)

---

## Methodology

- **Cold mode:** no system context beyond standard prompt and "you are a senior Angular engineer."
- **Primed-llms mode:** llms.txt (13.5KB) injected as additional system message.
- **Primed-llms+myths mode:** llms.txt + myths-and-misconceptions.md (combined ~25KB).
- **Reproducibility:** all prompts in `prompts/*.yaml`, deterministic temperature=0, model versions logged per cell.
- **Scoring (combined):** equal-weighted average of three orthogonal signals:
  - **idiomatic pattern** (text match against library-specific must-include/exclude lists)
  - **import resolution** (every non-relative import resolves to a real published package)
  - **marker-method validity** (when SignalTree code declares a marker, every method called on that marker exists on its API surface)

The marker-method validator catches the dominant primed-run failure mode that pattern-matching misses.

---

## Cost & cadence

- **This run:** 720 cells, ~28 minutes wall-clock, ~$12 in OpenRouter spend.
- **Re-run schedule:** quarterly (Mar/Jun/Sep/Dec), on major-model release, on significant llms.txt change. See `CADENCE.md`.
- **Next run:** 2026-09 (or earlier if a major model lands).

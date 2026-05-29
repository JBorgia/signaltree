# Benchmark re-run cadence

The AI-codegen benchmark measures SignalTree's AI-discoverability over time. Two forces move the headline number:

1. **Model improvements**: frontier models retrain quarterly; they progressively absorb more of the public web, which over time should cause the **cold** score to converge upward toward SignalTree's true ergonomics. The cold/primed gap shrinks as models learn what SignalTree is.
2. **Discoverability improvements**: every release of `llms.txt`, `llms-full.txt`, `myths-and-misconceptions.md`, and the agent skill tarball should bend the **primed** score upward.

The cadence below ensures we keep both signals fresh.

## Schedule

| When | What | Owner | Output |
|---|---|---|---|
| **Every minor release** (≥0.1.0 bump) | Run primed benchmark with the version's shipped `llms.txt`. Verify primed score didn't regress. | Release engineer | Comment on release notes if score moved ±5pp. |
| **Quarterly (Mar/Jun/Sep/Dec)** | Full re-run: cold + primed-llms + primed-llms+myths + tier-comparison (haiku, gpt-mini). | Maintainer | New `RESULTS-<date>.md`; commit + push. |
| **On major model release** (e.g., Claude Opus 4.9, GPT-6) | Re-run cold-only with the new model added to `ALIAS_TO_MODEL`. Track whether the cold gap is closing. | Maintainer | Update `RESULTS-COLD-VS-PRIMED.md` trend table. |
| **On significant `llms.txt` change** | Re-run primed-only to measure the marginal lift. Comparison run: previous llms.txt vs new llms.txt. | Author of the change | PR check — score must not regress. |

## Cost envelope

A full quarterly run is:
- 8 prompts × 5 libraries × 6 agents (4 frontier + 2 tier-comparison) = 240 cells per mode
- 4 modes (cold, primed-llms, primed-llms+myths, tier-comparison) = ~960 calls
- At ~$0.02/call average on OpenRouter = **~$20 per quarterly run**

Per-minor release run is single-mode (primed-llms) at ~240 cells × $0.02 = **~$5**.

## Running it

```bash
# Quarterly full run
export OPENROUTER_API_KEY=sk-or-...

# Cold
node scripts/ai-codegen-benchmark/runner.mjs --include-tier-comparison

# Primed with llms.txt only
PRIMING_CONTEXT_FILE=apps/demo/public/llms.txt \
  node scripts/ai-codegen-benchmark/runner.mjs --include-tier-comparison

# Primed with llms.txt + myths
PRIMING_CONTEXT_FILE="apps/demo/public/llms.txt,docs/myths-and-misconceptions.md" \
  node scripts/ai-codegen-benchmark/runner.mjs --include-tier-comparison

# Aggregate into a scorecard
node scripts/ai-codegen-benchmark/aggregate.mjs > RESULTS-$(date +%Y-%m-%d).md
```

## What to do with regressions

If the **primed score regresses** between releases:
- A change to `llms.txt` removed disambiguation that was load-bearing. Restore it.
- A new public API was added without an entry in `llms.txt`. Add it.

If the **cold score regresses**:
- Unlikely — would mean public web crawl ingested incorrect information about SignalTree. Investigate any third-party blog posts or LLM-generated docs that may have leaked into training sets.

If the **cold/primed gap shrinks dramatically** without our intervention:
- A milestone — models now know SignalTree natively. Reduce reliance on aggressive priming.
- Tighten `llms.txt` to focus on the residual gap (new features, recent changes).

## History

Tracked in `RESULTS-<date>.md` files. Each run produces:
- `results/<run-id>/summary.md` — markdown scorecard
- `results/<run-id>/summary.json` — machine-readable
- `results/<run-id>/raw/*.ts` — generated code per cell
- `results/<run-id>/compile/*.json` — per-cell scoring detail

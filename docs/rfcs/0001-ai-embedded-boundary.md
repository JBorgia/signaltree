# RFC 0001 — Where AI-embedded support belongs (core vs recipes vs external)

**Status:** Proposed
**Date:** 2026-06-04
**Affects:** `@signaltree/core` (10.5.0 line), docs/skills, future `@signaltree/ai`
**Versions at writing:** core 10.4.1 (published) / 10.5.0 (staged, unpublished); `@ngrx/signals` 20.1 (comparator); Angular 20.x

---

## 1. The question

SignalTree's "built for AI" work has two distinct axes:

1. **AI codegen discoverability** — coding agents *writing* correct SignalTree code (llms.txt, SKILL.md, the benchmark). Mature and clearly valuable.
2. **AI-embedded runtime** — apps that *run* LLMs (chat, streaming, tool calls, RAG, agents).

A streaming spike (`asyncStream`) was promoted to a public core marker on the 10.5.0 line (staged, **not published**). Before publishing it — or building "the whole AI vision" — we must answer: **does AI-embedded support belong *in the library*, and if so, how much?**

## 2. The test

SignalTree is a **state** library — "reactive JSON, signals at every path." The test for "belongs in core" is simply: **is it a state-management concern?** Everything else is a recipe, an external package, or out of scope.

## 3. Decomposition

| Capability | State concern? | Disposition |
|---|---|---|
| Accumulate a stream into reactive state | **Yes** — async-write pattern; sibling to `asyncSource`/`asyncQuery` | **Core** — one primitive (see §5) |
| Partial-JSON parsing (`partialJson`) | No — a codec/parser | External util / not core |
| Schema-validated structured output | No — validation already lives in `@signaltree/schema` | `@signaltree/schema` |
| `toolCall` / `agentLoop` / `conversation` | No — domain models; compositions of `entityMap` + `status` at depth | **Recipes/docs** (or opinionated external pkg) |
| Provider adapters (Anthropic/OpenAI/Vercel) | No — vendor I/O | External leaf pkgs; **never core** |
| `vectorStore` / RAG | No — search/embeddings | External or out of scope |

## 4. Decision

**SignalTree stays a focused state library. It is the state substrate that is *excellent for* AI apps — not an AI framework.**

1. **The AI-embedded value ships first as recipes/docs**, not API. Tool calls, agents, and conversations are *compositions of existing primitives* (`entityMap` + `status` at depth + an accumulating async primitive). Showing the canonical composition serves the codegen goal **better** than new API surface does — new markers *add* hallucination surface and concepts to learn, which is the opposite of what the codegen bet wants. The depth-attachment differentiator already makes nested agent/tool state natural; the win is *demonstrating* it.
2. **At most one new state primitive in core**: stream accumulation (see §5).
3. **Everything heavier is external, if-and-when demand appears.** A `@signaltree/ai` exists only for opinionated composites/provider glue and may never be needed if recipes suffice. Parsing → util; schema → `@signaltree/schema`; provider SDKs → never touch core.

## 5. Open decision: `asyncStream` marker vs `asyncSource` option

The one legitimately-state primitive (fold a stream into state) is currently built as a **new `asyncStream` marker** (staged, unpublished). Reconsider against the codegen ethos:

- **Option A — keep `asyncStream` as a distinct marker.** Pro: clear, distinct cancellation/accumulate/supersede semantics; reads as its own concept. Con: a *third* async marker for agents to learn and disambiguate (`asyncSource`/`asyncQuery`/`asyncStream`), each with its own "redo" verb.
- **Option B — add `accumulate?` + `equal?` (+ AbortSignal) options to `asyncSource`** (which already multi-emits). Pro: **zero new public surface** — fewer concepts to learn or hallucinate (strictly better for codegen). Con: muddies `asyncSource`'s "load-and-expose" clarity; conflates replace-semantics with accumulate-semantics.

**Recommendation: lean Option B** unless the semantics prove too divergent to share one marker cleanly. Decide before anything streaming-related is published.

## 6. Disposition of the staged 10.5.0 code

- **Hold `asyncStream` (the public marker) from publication** until §5 is decided. It is unpublished, additive, and harmless on `main`; no revert needed yet.
- **Unaffected / keep:** the F0 type-test gate, the marker-type fixes, the asyncQuery error/rerun fixes (already published in 10.4.1), the marker-warning fix. These are correctness/infra wins independent of the AI question.
- **The AI-embedded docs** added to llms.txt/SKILL.md should be reframed from "use the `asyncStream` marker" to the recipe-first composition story once §5 lands.

## 7. Recipes to write (the actual AI deliverable)

Composed from existing primitives, no new API:

1. **Chat / token streaming** — `messages: entityMap<ChatMessage>` + an accumulating async primitive for the in-flight reply.
2. **Tool calls** — `toolCalls: entityMap<ToolCall>` with a `status()` per call at depth (showcases depth-attachment).
3. **Structured output** — accumulate raw text; validate against `@signaltree/schema` on completion.
4. **Agent loop** — plain tree state (`step`, `iterations: entityMap`) + ops; no orchestration primitive.
5. **Cancellation** — wire an `AbortSignal` into `fetch`/SDK; cancel the async primitive alongside.

## 8. Explicitly out of core (now and later)

`partialJson` parsing · provider adapters · `vectorStore`/RAG · `agentLoop`/orchestration primitives · any vendor-SDK coupling.

## 9. Strategic caveat

This work is **secondary** to the audit's top threat: justifying SignalTree vs raw signals + current NgRx SignalStore. AI-embedded features do not answer the existential "why SignalTree" question; if the core value prop isn't nailed, AI work is a distraction dressed as progress. Recipes (cheap, on-ethos, codegen-positive) are the appropriate level of investment until there is a real demand signal for runtime AI support.

## 10. Next steps

1. Decide §5 (`asyncStream` marker vs `asyncSource` option).
2. Either publish the held primitive in its decided form, or keep it experimental.
3. Write recipes (§7) — the primary AI-embedded deliverable.
4. Revisit external `@signaltree/ai` only on a real demand signal.

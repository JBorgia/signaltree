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

## 5. Decision (2026-06-04): streaming stays experimental; defer marker-vs-option

The one legitimately-state primitive (fold a stream into state) was built as a **new `asyncStream` marker** (staged, unpublished). The two shapes:

- **Option A — keep `asyncStream` as a distinct marker.** Pro: clear, distinct cancellation/accumulate/supersede semantics; reads as its own concept. Con: a *third* async marker for agents to learn and disambiguate (`asyncSource`/`asyncQuery`/`asyncStream`), each with its own "redo" verb.
- **Option B — add `accumulate?` + `equal?` (+ AbortSignal) options to `asyncSource`** (which already multi-emits). Pro: **zero new public surface** — fewer concepts to learn or hallucinate (strictly better for codegen). Con: muddies `asyncSource`'s "load-and-expose" clarity; conflates replace-semantics with accumulate-semantics.

**DECISION:** Streaming stays **experimental and unshipped**. `asyncStream` is **un-exported from the public barrel** (returned to experimental status — the implementation + tests are preserved, but it is not public API). The A-vs-B choice is **deferred** until a real demand signal justifies shipping streaming at all — committing to either *now* would itself be the premature-public-API mistake §4 warns against. When demand appears, **Option B (the `asyncSource` accumulate-option) is the leading candidate**, re-examined against the replace-vs-accumulate semantics concern at that time. Until then, the recipe-first story (§7) uses only shipped primitives.

## 6. Disposition of the staged 10.5.0 code

- **`asyncStream` un-exported from the barrel** (per §5) — the implementation and its tests stay on `main` as experimental/parked; it is not public API and cannot accidentally ship. The TreeNode type-chain entry is left in place (inert — it resolves a now-internal marker type) so re-promotion is a one-line re-export when warranted.
- **Unaffected / keep & genuinely shippable:** the **F0 type-test gate** and the **internal tree-node variant fix** (correctness/infra, no public-API commitment); the asyncQuery error/rerun fixes and the marker-warning fix are **already published in 10.4.1**.
- **CHANGELOG:** the speculative "10.5.0" entry is reframed to **Unreleased**, with streaming listed as experimental rather than as a shipped marker.
- **The AI-embedded docs** in llms.txt/SKILL.md should be reframed from "use the `asyncStream` marker" to the recipe-first composition story (follow-up; low priority while unpublished).

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

1. ~~Decide §5~~ — **done (2026-06-04): streaming experimental, `asyncStream` un-exported, A-vs-B deferred.**
2. No release needed now — nothing user-facing is stranded (all consumer fixes shipped in 10.4.1). The F0 gate + variant fix can ride a future minor whenever one is cut for another reason.
3. Write recipes (§7) — the primary AI-embedded deliverable — only when worth the effort; no demand signal yet.
4. Revisit shipping streaming (and the A-vs-B choice) **only on a real demand signal**, or as a deliberate, timeboxed repositioning bet.
5. The genuinely higher-leverage next project is the existential one: an NgRx-vs-SignalTree benchmark harness to substantiate or retire the "smaller/faster" goal.

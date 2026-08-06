# What it costs, and whether the structure is optimal — 14.0.0

**Status:** measurement, pre-14.0.0. Answers a narrower question than "is it
small": _given what each feature costs, is anything structured wrong?_

Reproduce everything here with `node tools/size-report.mjs`. All figures are a
**production build** (`ngDevMode: false`), own code only (Angular/rxjs/tslib
external), gzipped, with each feature **exercised** rather than merely imported —
importing a symbol and never calling it measures the tree-shaker, not the
feature.

---

## 1. What each feature costs

Bare `signalTree`: **5.65 KB**

| marker | total | delta |
| --- | --- | --- |
| `compared` | 5.72 | **+0.06** |
| `asyncSource` | 6.41 | +0.76 |
| `status` | 6.42 | +0.77 |
| `asyncQuery` | 6.56 | +0.91 |
| `stored` | 6.87 | +1.22 |
| `form` | 7.75 | +2.10 |
| `entityMap` (plain) | 8.40 | **+2.75** |
| `entityMap` + `loader` | 9.93 | +4.28 |

| enhancer | total | delta |
| --- | --- | --- |
| `devTools` | 5.72 | **+0.07** (impl is lazy — 8.25 KB chunk on connect) |
| `batching` | 6.62 | +0.97 |
| `timeTravel` | 7.33 | +1.67 |
| `serialization` | 7.50 | +1.84 |
| `persistence` | 8.01 | +2.35 |
| `createAuditTracker` | 5.92 | +0.27 |

| realistic | total |
| --- | --- |
| typical app (`entityMap` + `status` + `form`) | **10.71 KB** |
| everything (7 markers + 3 enhancers) | 18.42 KB |
| `@signaltree/core/storage` imported alone | 0.38 KB |

**Three structural decisions are confirmed working by these numbers:**

- **The v12 loader reclaim held.** A plain `entityMap` is +2.75; adding `loader`
  costs +1.53 more. The cache/SWR/persist machinery really is behind the
  `loader()` helper, so collections that do not use it do not pay.
- **`devTools`' dynamic import is doing its job.** +0.07 KB in the main bundle
  against an 8.25 KB implementation chunk fetched only when it connects.
- **`compared` is essentially free** (+0.06) — only its type guard survives when
  the marker is not used, which is what the design intended.

**Sharing is real but modest.** The "everything" combo is +12.77 over bare,
against +14.58 if every feature's individual delta were additive — about
**1.8 KB of shared machinery**. Markers are more independent than they look.

---

## 2. Is the FLOOR optimal? — measured, and the answer is "within 16%"

A bare tree with no markers and no enhancers still ships:

| module | minified bytes | share of floor |
| --- | --- | --- |
| `lib/signal-tree.js` | 6827 | 39% |
| `lib/path-notifier.js` | **2239** | **13%** |
| `lib/constants.js` | 2155 | 12% |
| `lib/utils.js` | 1958 | 11% |
| `shared/lib/deep-equal.js` | 1298 | 7% |
| `shared/lib/is-built-in-object.js` | 1074 | 6% |
| `lib/internals/materialize-markers.js` | 976 | 6% |
| `lib/internals/merge-derived.js` | **713** | **4%** |
| everything else | 483 | 3% |

Two entries are machinery a bare tree never uses. Priced by stubbing them and
re-measuring:

| | bare tree | reclaim |
| --- | --- | --- |
| today | 5.64 KB | — |
| `path-notifier` injected | 5.03 KB | **0.61 KB** |
| `merge-derived` injected | 5.37 KB | 0.28 KB |
| both | 4.75 KB | **0.90 KB (16%)** |

`lib/constants.js` at 2155 bytes is almost entirely the `ST####` message table,
and it ships in production **on purpose** — see
[dropping-dev-code.md](../performance/dropping-dev-code.md): "an exception whose
message is an opaque integer is useless in a production stack trace". Not a
finding; a paid-for decision.

### Recommendation: do NOT chase the 0.90 KB, and here is why

The precedent exists — `SecurityValidator` and the memory manager were both made
injected features for exactly this reason, and it worked. So the technique is
proven and the number is real. It still should not happen here:

1. **`getPathNotifier` is public API** (`@signaltree/core/authoring`) and the
   seam every enhancer subscribes to. Making it injected changes the enhancer
   contract for every third-party enhancer — a real API break, and a late one.
2. **`merge-derived` cannot be deferred without breaking `.derived()`.** The
   call is already conditional (`if (derivedQueue.length > 0)`); it is the
   static IMPORT that ships. Moving to a dynamic import would make `.derived()`
   async, which changes a synchronous builder API to buy 0.28 KB.
3. **Bundle size is explicitly not this project's claim.** The recorded position
   is that SignalTree sits near the top of the size range for its category and
   should never be sold on being small. Spending an API break on 0.90 KB buys
   ground the project has already decided not to fight for.

So the floor is **within 16% of its achievable minimum**, the gap is understood,
and closing it costs more than it returns. Recorded here so the next person
measuring the floor finds the analysis instead of redoing it.

---

## 3. What this review did NOT find

Worth stating, because absence of a finding is a result:

- **No leaked optional module.** Every module in the floor is either used by
  every tree or a deliberate, documented cost. The failure mode that produced
  earlier floor inflation — a statically-reachable optional feature — is not
  present.
- **No missing lazy boundary.** `devTools` is the only feature whose
  implementation is worth deferring, and it already is. `serialization` looks
  like a candidate at +1.84 until you notice `persistence()` needs it at runtime
  in production, unlike devtools which is a development tool.
- **No mis-sliced subpath.** `@signaltree/core/storage` is 0.38 KB imported
  alone, so splitting it out of the serialization enhancer was correct.

# RFC 0014 — SSR state transfer: what works, what does not, and the one thing to change

**Status:** IMPLEMENTED. `{ transfer: true }` ships; 11 tests in
`packages/core/src/lib/ssr-transfer.spec.ts`.
**Date:** 2026-08-09.
**Prompted by:** audit challenge C3, whose premise ("SSR has zero integration")
turned out to be wrong. Everything below is measured, and the reproductions are
`packages/core/src/lib/ssr-transfer.spec.ts`.

---

## 1. The premise was wrong

C3 said SSR "has zero integration" and called it the largest untouched gap, on
the evidence that `grep -rn "TransferState|isPlatformServer|provideServerRendering" packages/`
returns nothing. That grep is accurate and the conclusion drawn from it was not.

Attempting the recipe rather than theorising about it shows **the capability is
already complete.** The test simulates the real shape — a server tree and a
SEPARATE client tree, sharing nothing but a string, which is all `TransferState`
carries:

|                                                                                                           | works today |
| --------------------------------------------------------------------------------------------------------- | ----------- |
| plain state, nested branches                                                                              | ✅          |
| `entityMap` collections                                                                                   | ✅          |
| in-flight `LOADING` status **normalised** on arrival                                                      | ✅          |
| payload survives `TransferState`'s own JSON round trip, escapes included                                  | ✅          |
| a tree containing `stored()` constructs and serialises on a server with no `localStorage` and no `window` | ✅          |

The third row deserves note: it is the `rehydrate` contract from
`docs/architecture/snapshot-rehydration.md` §3.2 working exactly as specified,
unprompted, across a real process boundary. That design was right.

**So the gap is not capability. It is that nobody can discover the capability** —
no recipe, no test, and zero mentions of `TransferState` anywhere in the repo.

### The recipe, in full

```ts
const KEY = makeStateKey<string>('signaltree');

// server
inject(TransferState).set(KEY, tree.serialize());

// client
const ts = inject(TransferState);
if (ts.hasKey(KEY)) tree.deserialize(ts.get(KEY, '{}'));
```

Requires `.with(serialization())`, measured at **+1.84 KB gzip** over a bare
tree (`node tools/size-report.mjs`).

---

## 2. The real gap: `asyncSource` ships its payload and then drops it

SSR exists to ship SERVER-FETCHED data to the client, so the user does not watch
a spinner for something the server already had. `asyncSource` is where fetched
data lives. It is the one thing that does not cross.

Measured, 500 rows, the same data through two markers:

| marker        | payload             | client receives         |
| ------------- | ------------------- | ----------------------- |
| `asyncSource` | **54.3 KB shipped** | **nothing — refetches** |
| `entityMap`   | 54.7 KB shipped     | all 500 rows            |

The cost is paid **twice**: the bytes go into the HTML _and_ the client fetches
again. A spinner on top of a payload.

### Why it happens, and why the reasoning was right

`asyncSource`'s `snapshot` captures always — correct, because undo must replay
what was on screen. Its `hydrate` then declines `rehydrate`, and the source says
why:

> _"On `rehydrate` the payload is stale by definition — the tree was rebuilt in a
> new process and **the loader has already re-run**, so the fresh result wins."_

That is correct for the case it was written against: a page reload hours later,
restoring from `localStorage`, where the stored value is old and the loader will
fetch something better. It is **false at SSR hydration** — the payload is
milliseconds old and the client's loader has not run yet.

### The precise defect

`HydrateMode` has one `rehydrate` value covering two situations with **opposite
correct answers**:

| situation              | payload age   | client loader     | correct action               |
| ---------------------- | ------------- | ----------------- | ---------------------------- |
| `localStorage` restore | hours or days | will run, fresher | **decline** ✅ today         |
| SSR `TransferState`    | milliseconds  | has not run       | **accept** ❌ declines today |

`snapshot-rehydration.md` already states the governing principle — _"`HydrateMode`
is a property of the CALL SITE, the only place that knows whether a process
boundary was crossed."_ Both of these cross a process boundary; they differ in
**how old the payload is relative to the loader**, and the type cannot express
that. The design is one value short, not wrong.

---

## 3. Proposal: a fourth `HydrateMode`, `transfer`

```ts
export type HydrateMode = 'merge' | 'restore' | 'rehydrate' | 'transfer';
```

`transfer` means: _this payload crossed a process boundary and is FRESHER than
anything this process has, because nothing in this process has run yet._

Only two markers need to read it, and only to reverse one decision:

- `asyncSource.hydrate` — accept on `transfer`, keep declining on `rehydrate`.
- `status.hydrate` — the `LOADING → NotLoaded` normalisation stays for BOTH
  (a fetch in flight on the server is not in flight here, whatever the age).

Every other marker treats `transfer` exactly as `rehydrate`, so the default arm
is unchanged.

**Why a mode and not a flag on `deserialize()`.** The decision belongs to the
marker, not the caller — `status` and `asyncSource` want different things from
the same payload, which is the whole reason `HydrateMode` exists rather than a
boolean. Adding a fourth value extends the existing mechanism; a flag would
introduce a second, parallel one.

### What this does NOT solve, stated plainly

`asyncQuery` and `entityLoader` declare `snapshot` with no `hydrate` at all, so
their payloads ship and nothing reads them back. **This is unverified** — an
attempt to populate `asyncQuery` through `.set()` produced a 0.2 KB payload,
meaning the setup never took, so that probe is inconclusive rather than
evidence. It needs its own investigation before anything is claimed about it.

---

## 4. Payload size is the other real constraint

Measured, `entityMap` serialised into the page:

| rows   | inline in the HTML |
| ------ | ------------------ |
| 100    | 11 KB              |
| 1,000  | 109 KB             |
| 10,000 | **1,120 KB**       |

Linear, and at grid scale it is the dominant cost of the page. This is not a
SignalTree defect — any SSR state transfer pays it — but a library that
advertises 50,000-row collections should say out loud that transferring one
inline is not the move. `history: false` (RFC 0012) has no bearing here;
`transient: true` is the flag that removes a collection from the payload
entirely.

---

## 5. Recommendation

1. **Ship the recipe** (§1) as a doc, with `ssr-transfer.spec.ts` as its proof so
   it cannot rot silently. This is the whole of the discoverability gap and is
   cheap.
2. **Add `transfer`** (§3). Small, contained, extends an existing mechanism, and
   turns 54 KB of wasted payload plus a duplicate fetch into working hydration.
3. **Document the payload-size curve** (§4) beside the 50,000-row claims.
4. **Do NOT add `provideSignalTreeServerState()`.** It was proposed during the
   audit and is withdrawn here: the manual recipe is five lines, an API would
   save two, and it would add permanent public surface for that. Recorded as
   declined-with-a-reason rather than left dangling.

## 5b. Implemented

`HydrateMode` gains a fourth value and `deserialize` gains one config flag:

```ts
client.deserialize(ts.get(KEY, '{}'), { transfer: true });
```

Behaviour, all pinned by test:

|                            | `deserialize()`    | `deserialize(_, { transfer: true })` |
| -------------------------- | ------------------ | ------------------------------------ |
| `asyncSource` server value | dropped, refetched | **delivered**                        |
| in-flight `LOADING` status | normalised         | **normalised** (unchanged)           |
| form `touched`             | not restored       | **not restored** (unchanged)         |
| plain state, `entityMap`   | transferred        | transferred                          |

The two "unchanged" rows are the ones worth defending. `transfer` says the
payload is FRESHER, and freshness is an argument about DATA. It is not an
argument for believing a request is still in flight in a process where nothing
is running, nor for resurrecting interaction state without the focus, scroll and
cursor that made it meaningful. Data transfers; in-flight-ness and interaction
state do not.

`hydrateMode` is closure state on the enhancer, set by `deserialize` and
restored in a `finally`, because the mode must reach `updateSignals` (nested
inside `fromJSON`) and `fromJSON` is public API — widening its signature would
put a mode argument in front of every caller who has no opinion about it. The
whole path is synchronous, and a test asserts the mode does not leak into the
next `deserialize`.

**Loader-backed `entityMap` is reasoned but NOT TESTED.** It carried the same
`mode === 'rehydrate'` decline and now falls through to accept under `transfer`.
The argument is identical to `asyncSource`'s and the code change is one comment
plus an unchanged condition — but no test exercises a loader-backed collection
across the boundary, so it is a claim, not a result. Marked here rather than
counted as done.

---

## 6. What this investigation got wrong on the way

Worth keeping, because it is the same shape as everything else this week.

- **The premise.** "Zero integration" came from a grep for the wrong nouns.
  Trying the thing beat reasoning about it.
- **An ad-hoc measurement nearly shipped.** A scratch script put the bare tree at
  13.67 KB; `size-report.mjs` says 5.79 KB. The generator was right and the
  scratch script was not, and only using the generator caught it.
- **A polluted artifact.** Running the bundle-budget self-test left its mutation
  payload inside `dist/`, so `size-report.mjs` briefly reported 13.69 KB for the
  bare tree. That was a real defect in the mutation harness — fixed in the same
  commit — and it is the original stale-`dist` bug reintroduced by the fix for
  it.
- **A brittle assertion.** The first version of the `asyncSource` test asserted
  on a `console.warn` spy that captured nothing while the warning was plainly on
  stdout, because the report routes through a listener. Asserting the observable
  outcome is both stronger and not hostage to delivery.
- **The headline finding was right BY LUCK.** Every `asyncSource` assertion used
  `.value?.()`, and an `asyncSource` node has no `.value` — it is callable.
  `.value?.()` is `undefined` whether hydration worked or not, so "the client
  does NOT receive it" passed without testing anything. The finding survived
  re-measurement with `node()`, which is fortunate rather than creditable: a
  test that cannot fail is not evidence, and this one was published before
  anyone checked it could.
- **Then the fix "failed" against a stale `dist`.** The first check of
  `{ transfer: true }` imported from `dist/` after editing only source, so it
  measured code that predated the fix and reported it broken. Third time this
  session that stale build output produced a wrong answer — and the reason the
  bundle gate now rebuilds for itself. A one-line probe inside `hydrate` showed
  `mode=transfer`, the right payload, and the right result, which is what
  separated "the fix is wrong" from "the check is wrong".

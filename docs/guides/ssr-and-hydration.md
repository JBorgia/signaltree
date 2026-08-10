# SSR and hydration

Moving state a server already built into the client tree, so the user does not
watch a spinner for data the server had.

Everything here is proved by `packages/core/src/lib/ssr-transfer.spec.ts`, which
simulates the real shape — a server tree and a **separate** client tree, sharing
nothing but a string, which is all `TransferState` carries.

---

## The recipe

```ts
import { makeStateKey, TransferState, inject } from '@angular/core';
import { signalTree, serialization } from '@signaltree/core';

const KEY = makeStateKey<string>('signaltree');

export const tree = signalTree({
  user: { name: '', role: '' },
  rows: entityMap<Row, number>({ selectId: (r) => r.id }),
}).with(serialization()); // serialize/deserialize live in this enhancer

// ── server, after your resolvers have populated the tree ────────────────────
inject(TransferState).set(KEY, tree.serialize());

// ── client, during bootstrap and BEFORE first render ────────────────────────
const ts = inject(TransferState);
if (ts.hasKey(KEY)) {
  tree.deserialize(ts.get(KEY, '{}'), { transfer: true });
}
```

`{ transfer: true }` is the part people miss, and §3 explains why it matters.

`serialization()` costs **+1.84 KB gzip** over a bare tree
(`node tools/size-report.mjs`).

---

## 1. What crosses the boundary

|                                           | crosses                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| plain state, nested branches              | ✅                                                                  |
| `entityMap` collections                   | ✅                                                                  |
| `asyncSource` / loader-backed `entityMap` | ✅ **only with `{ transfer: true }`**                               |
| `form()` values                           | ✅                                                                  |
| `form()` `touched`                        | ❌ deliberate — see §4                                              |
| in-flight `LOADING` status                | ❌ normalised to `NotLoaded` — deliberate, see §4                   |
| `stored()`                                | ❌ `transient` — it belongs to `localStorage`, which is client-only |

A tree containing `stored()` constructs and serialises fine on a server with no
`localStorage` and no `window`; the marker simply keeps itself out of the
payload.

---

## 2. Timing: deserialize before anything reads

The client tree must be hydrated **before first render**, or the first paint
shows empty state and then flips — the flash SSR exists to prevent. Do it in an
`APP_INITIALIZER`, a route resolver, or at module scope where the tree is
created. Do not do it in a component's `ngOnInit`.

---

## 3. `{ transfer: true }` — why the flag exists

A marker that owns a live source (`asyncSource`, a loader-backed `entityMap`)
has to decide whose data is fresher: the payload's, or the one its own loader
will produce. **The answer depends on where the payload came from**, and both
places cross a process boundary:

| payload came from | age           | local loader      | correct answer         |
| ----------------- | ------------- | ----------------- | ---------------------- |
| `localStorage`    | hours or days | will run, fresher | decline the payload    |
| the server        | milliseconds  | has NOT run yet   | **accept the payload** |

Without the flag, `deserialize()` assumes storage and declines. Measured on a
500-row collection (`node tools/bench-ssr-payload.mjs`), that costs **54.3 KB
shipped into the page AND a duplicate fetch** — the bytes and the spinner. `{ transfer: true }` is how the call site
says which situation this is; nothing else can know.

If you also restore from `localStorage`, call that one **without** the flag. The
two are different payloads and want different answers.

---

## 4. What `transfer` deliberately does NOT change

`transfer` means _this payload is fresher_, and freshness is an argument about
**data**. It is not an argument for:

- **Believing a request is in flight.** A `LOADING` status is normalised to
  `NotLoaded` under `transfer` too. The fetch was in flight on the server;
  nothing is running here, and believing otherwise deadlocks every `idle`-gated
  guard.
- **Resurrecting interaction state.** A form's `touched` is not restored across
  either boundary mode. The objection is not staleness — it is that `touched`
  without focus, scroll and cursor is a half-restoration that reads worse than
  none.

---

## 5. Payload size — the constraint nobody mentions

The payload is inlined into the HTML. Measured with
`node tools/bench-ssr-payload.mjs`, `entityMap` serialised:

| rows   | inline in the page |
| ------ | ------------------ |
| 100    | 11 KB              |
| 1,000  | 109 KB             |
| 10,000 | **1,120 KB**       |

Linear, and at grid scale it dominates the page. This is not specific to
SignalTree — any SSR state transfer pays it — but a library that supports
50,000-row collections should say plainly that **transferring one inline is not
the move**. Transfer the first page and load the rest on the client, or mark the
collection `transient: true` to keep it out of the payload entirely.

(`history: false` from RFC 0012 does not help here. That flag scopes what
`undo()` can reach, not what `serialize()` emits.)

---

## 6. What is not covered

- **No SSR app in this repo.** There is no `platform-server` dependency and no
  `server.ts`, so the boundary is simulated in tests rather than exercised
  end-to-end through Angular's renderer. The simulation is honest about the part
  that matters — two independent trees, one string between them — but it is a
  simulation, and a real integration would be a stronger proof.
- **Incremental hydration** (Angular v19+ `@defer` hydrate triggers) has not been
  tried against a tree at all.

Background and measurements: [RFC 0014](../rfcs/0014-ssr-state-transfer.md).

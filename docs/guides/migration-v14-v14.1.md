# Migrating 14.0.0 → 14.1.1

**Read this if you are landing on 14.1.1 from anywhere in 14.x.**
[migration-v13-v14.md](./migration-v13-v14.md) covers 13.x → 14.0.0 and does **not**
cover the renames below.

---

## Why a MINOR release breaks API, and why this guide exists

`14.1.1` renames and removes public API. That is a semver anomaly and it is worth
stating plainly rather than letting you discover it from a compiler error.

**14.0.0 was published on 2026-08-10 and has since been unpublished.** It went out
while the audit that produced 14.1.1 was still generating findings, and several things
it published were wrong. `14.1.0` was published and unpublished the same day for a
separate reason — it shipped an unresolvable `workspace:*` peer-dependency spec.

So the intended upgrade paths are:

| from       | to     | what you hit                                                     |
| ---------- | ------ | ---------------------------------------------------------------- |
| **13.x**   | 14.1.1 | [migration-v13-v14.md](./migration-v13-v14.md) **and this page** |
| **14.0.0** | 14.1.1 | this page only                                                   |

Measured against 13.5.0 — the last version anyone could install and keep — this is a
major-scale change, and `13.x → 14.1.1` crosses the major boundary, so no `^13.5.0`
range resolves into it. If you were on 14.0.0 during its ~24 hours on the registry,
you are the case this page is written for.

**We are sorry this arrived as a `.d.ts` archaeology exercise.** A consumer upgrade
found both renames below by reading type definitions after `tsc` failed, because this
document did not exist. That was the failure, not the renames.

---

## The compiler finds all of it

Every change here is a rename or a removal of a **typed** symbol. There is no silent
behaviour change in this list — if your build passes, you are done. Work through the
`tsc` errors and stop.

---

## 1. `entityMap` — `map()` → `asMap()`

```ts
// before
const byId = tree.$.rows.map();
// after
const byId = tree.$.rows.asMap();
```

Returns the same `ReadonlyMap<K, E>`, keyed by id, insertion-ordered. Renamed because
`map` read as a **projection** sitting beside `all()` — as in `Array.prototype.map` —
when it is a conversion.

## 2. `entityMap` — `removeAll()` removed, use `clear()`

```ts
// before
tree.$.rows.removeAll();
// after
tree.$.rows.clear();
```

`removeAll` was an alias. One operation, one name.

## 3. `DevToolsConfig` — `treeName` → `name`

```ts
// before
tree.with(devTools({ treeName: 'AppTree' }));
// after
tree.with(devTools({ name: 'AppTree' }));
```

`treeName` was a second spelling of the same field, and the source itself called it a
legacy alias.

## 4. `entityMap({ history })` → `entityMap({ recordHistory })`

```ts
// before
entityMap<Row, number>({ selectId: (r) => r.id, history: false });
// after
entityMap<Row, number>({ selectId: (r) => r.id, recordHistory: false });
```

The old name collided with `form({ history: history() })`, which asks the **opposite**
question — _own a scoped undo stack_ versus _be recorded into someone else's_. One
spelling could not mean both.

> **This one is worth a second look even if you never used it.** With
> `recordHistory: false`, retention becomes **independent of collection width** —
> measured flat at ~0.15 MB across 1k, 10k and 50k rows, against 19.38 MB for an
> included 50k collection over 50 entries. It removes the `entries × width` term
> rather than shrinking it. Previously published figures for this flag
> (0.18 / 1.25 / 5.61 MB) grew with width and were wrong in kind, not degree.

## 5. `equal` removed, use `deepEqual`

```ts
// before
import { equal } from '@signaltree/core';
// after
import { deepEqual } from '@signaltree/core';
```

`equal` was an alias export of `deepEqual`.

## 6. `batchUpdate()` removed

```ts
// before
tree.batchUpdate({ a: 1, b: 2 });
tree.batchUpdate(() => {
  /* … */
});

// after — no batching() attached
tree({ a: 1, b: 2 });
// after — with batching() attached, if you want one flush
tree.batch(() => tree({ a: 1, b: 2 }));
```

It was a duplicate of the tree callable: its body was exactly what `tree(partial)`
already does, and with `batching()` attached `tree.batchUpdate(x)` was precisely
`tree.batch(() => tree(x))`. Measured equivalent before removal.

Note the `batchUpdates` **config option** is unrelated and still exists:
`signalTree(state, { batchUpdates: false })`.

## 7. `pauseRecording()` / `resumeRecording()` / `isRecordingPaused()` removed

**There is no replacement, and that is deliberate.** They could only express "record
nothing", never "one undo step", so the documented bulk-import recipe needed a
synthetic sealing write to work at all. Pause was also a **global mute**: an unrelated
writer during the window was suppressed too.

What to do instead:

- **A bulk import is already one entry** when its writes share a microtask. Try it
  before reaching for anything else.
- **To drop uninteresting transitions**, use `timeTravel({ shouldSkip })`. It runs on
  every recorded write, so compare only the fields you mean.
- **For genuine intent-scoped grouping** — "these five writes are one user action,
  across several parts of the tree" — that is a transaction handle, and it is the
  subject of the next release rather than something to hand-roll now.

## 8. `byIdOrFail()` removed

Use `byId(id)`, which returns `undefined` for a missing row, and handle it.

---

## Also in 14.1.1, no action needed

- **`replaceOne(id, entity)`** is new, and the entity-node callable `byId(id)(next)`
  now **replaces** instead of merging. `updateOne(id, changes)` still merges and is
  unchanged — it is the patch half of the surface. If you relied on the callable
  merging, move to `updateOne`.
- **`maxHistorySize` is validated and now keeps its literal meaning.** `0`, `1`,
  negatives, `NaN` and `Infinity` used to silently disable undo; they now report
  **ST2032** and fall back to the default of 50. Valid values now retain that many
  reversible turns, so `maxHistorySize: 5` means 5 spendable undos.
- **`coalesce()` no longer loses updater writes.** An updater is a read-modify-write,
  so `update(v => v + 1)` three times means `+3`; coalescing kept only the last, which
  meant `+1`.
- **`@signaltree/events`** follows Zod now: `parseEvent` throws, `safeParseEvent`
  returns a result. They were inverted. `ConnectionState` is now
  `WebSocketConnectionState`.

---

## If something here is wrong

Every figure in this guide has a command behind it. Retention numbers come from
`node --expose-gc tools/bench-retention-arms.mjs <shape> <width> <steps>`. If a claim
does not reproduce, that is a bug in the claim — please say so.

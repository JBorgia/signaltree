# API naming audit — duplicates, aliases and inconsistent terms

**Status:** audit, 2026-08-10. Run against the **built** surface (`Object.keys` on a
live tree and a live `entityMap`), not against the source, because an `as any`
attachment is invisible to a type-level read and one of the findings below is exactly
that.

15.0.0 is a clean break, so an alias kept for compatibility is an alias kept for no
reason. The rule applied throughout: **one operation, one name** — and where two names
survive, the audit has to say what observably differs between them.

---

## Fixed in this pass

### `removeAll()` → deleted. It was a pure alias.

Its body was `api.clear()`. Two names, one operation, nothing to distinguish them.
Call sites updated (two in the demo). The spec now asserts the method is **gone**
rather than that two names agree — the previous test, `'clear and removeAll both empty
the collection'`, was a test whose only purpose was to protect the duplication.

### `coalesce()` + `update()` → a data-loss defect found while auditing the name

Not a naming problem, but the audit is how it surfaced: `batch` and `coalesce` looked
like duplicates, and checking whether they observably differ exposed that `coalesce`
keyed deferred updaters by `` `${path}:update:${Date.now()}` ``. Same-millisecond
collisions dropped writes. Fixed and pinned; see the CHANGELOG.

---

## Confirmed duplicate, not yet removed

### `batchUpdate` — a third grouping name, untyped, and documented

| Fact                     | Evidence                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| Not in `types.ts` at all | `grep -c "batchUpdate(" packages/core/src/lib/types.ts` → 0           |
| Attached via `as any`    | `batching.ts:363`, and again at `:63` for the disabled path           |
| Also defined in core     | `signal-tree.ts` via `Object.defineProperty`, plus `builder-types.ts` |
| **Publicly documented**  | `packages/core/README.md:2136`, and `ENHANCERS.md:28`                 |

So it is a real, documented, reachable public method that TypeScript does not know
about. Verified reachable: `tree.batchUpdate({ a: 5, b: 6 })` set both.

**It is a composition, not a capability.** `batchUpdate(partial)` is
`batch(() => tree(partial))` — and `tree(partial)` is already the partial-write API. By
the standard applied to the capability matrix ("any library composes it, so it is not a
capability"), this should not be a method.

Not removed here because it spans `signal-tree.ts`, `builder-types.ts`, `batching.ts`
and two shipped docs, and it deserves its own change rather than a footnote in one about
`coalesce`.

---

## Two names that EARN their place

Stated because "looks like a duplicate" was the starting hypothesis for both and the
measurement said otherwise.

### `updateOne` vs `replaceOne` — merge vs replace

`updateOne` spreads, so it **cannot remove a key**. `replaceOne` assigns. Genuinely
two operations. Added in 15.0.0.

### `batch` vs `coalesce` — and the difference is undocumented

MEASURED, mid-callback read of a value written inside the callback:

|              | mid-callback read        | final |
| ------------ | ------------------------ | ----- |
| `batch()`    | `"X"`                    | `"X"` |
| `coalesce()` | `""` — **the OLD value** | `"X"` |

`batch` writes synchronously and defers only change-detection notification.
`coalesce` **defers the write itself**. That is a substantial semantic difference and
neither docstring says it: `batch`'s says "values update immediately" and `coalesce`'s
says "only the final value for each path is written," which a reader would reasonably
take to describe the same end state reached two ways.

**Action: document the mid-callback contract**, do not merge the names.

---

## Naming inconsistencies, ranked by how much they mislead

### 1. `get` prefix on two time-travel methods, bare accessors everywhere else

`getHistory()` and `getCurrentIndex()` against `all()`, `count()`, `ids()`, `canUndo()`,
`canRedo()`, `empty()`, `has()`, `activeId()`. The convention in this library is a bare
noun. Two methods opted out, and both are in the subsystem that already borrowed its
whole vocabulary from debuggers — which is the same root cause as
[the greenfield target §1](../../architecture/history-the-greenfield-target.md).

Both are moving to the devtools surface anyway, so fix the name at the same time rather
than twice.

### 2. `resetHistory()` vs `clear()`

`reset` and `clear` for "empty this thing" in the same library. `clear` is the one used
on collections, so `resetHistory` is the outlier. (`reset` is defensible where it means
"restore to the INITIAL value" rather than "empty" — check which this actually does
before renaming, because those are different operations wearing similar words.)

### 3. `byIdOrFail()` — an `OrFail` suffix that appears nowhere else

The throwing variant of `byId`. The suffix is unique in the API surface, and the
concept — "the strict variant" — recurs elsewhere without it (`removeMany` throws on a
missing id; `addMany` throws on a duplicate). Either the suffix is the convention for
strict variants, in which case those want it too, or it is a one-off, in which case it
needs a better name.

### 4. `map()` on `entityMap`

Returns `ReadonlyMap<K, E>`. But `map` on anything array-shaped means "project each
element" to every JS developer, and `all()` right beside it returns an array — so
`rows.map(...)` reads like a transform and is a property access. `asMap()` or `byIdMap()`
would say what it is. (An AI agent reaching for `.map(fn)` is the concrete failure, and
the codebase already maintains a `WRONG_ENTITY_METHODS` table for exactly this class of
mistake.)

### 5. `__timeTravel` on the public tree object

Appears in `Object.keys(tree)`. A double-underscore convention communicates "internal"
to a human reader and nothing to an enumerator — serialisation, devtools inspection and
`{ ...tree }` all see it.

### 6. `hasPendingNotifications()` / `flushNotifications()`

Verbose beside `has()`, `empty()`, `count()`. Minor, and arguably justified because
"notifications" disambiguates from collection pending-state. Lowest priority; listed for
completeness rather than as a recommendation.

### 7. `pauseRecording`/`resumeRecording`/`isRecordingPaused` vs `pause`/`resume`/`isPaused`

The public methods carry a `Recording` suffix; the manager's own methods do not. Moot —
all three public ones are being **deleted** in 15.0.0, so this resolves itself.

### 8. `history` — one option name, two opposite meanings

Filed separately in [TODO](../../../TODO.md) item 2a because it is a defect, not only a
naming problem: `form({ history: history() })` opts **in**, `entityMap({ history: false })`
opts **out**, and the collision is why excluded collections still produce phantom undo
steps.

---

## What this audit did NOT cover

Scoped to `@signaltree/core`'s tree and `entityMap` surfaces, which is where the
duplication was expected. **Not examined:** the other seven packages' public surfaces,
option/config key names (only `history` came up, and only because a defect led there),
and type/interface names. If the naming pass is meant to be exhaustive, those are the
remaining thirds.

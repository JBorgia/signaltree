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

## Pass 2 — the other packages

Extended 2026-08-10 on request. Method: import each built barrel and enumerate it;
where the barrel could not be imported (unresolved `@signaltree/core` in
`node_modules`, which links to source rather than `dist`), read the package's
`src/index.ts` directly.

### A correction to this document's own method

Pass 2 initially grepped `export function|const|class|…` across every source file in
each package and reported the results as public surface. **That over-reported badly.**
`schema` looked like it leaked ~18 internals (`addBoundPath`, `dispatchLeafRun`,
`routeWrite`, `collectOwnedLeaves`…) and `guardrails` like it exported seven
`create*Tree` presets. Both barrels are in fact tiny:

```
schema/src/index.ts     → export { schemas } + types
guardrails/src/index.ts → export { guardrails, rules } + types
```

A file-level `export` is not a public export. The corrected findings below come from
barrels only. Recording the error because the same shortcut would misreport any
package here.

### Fixed: `equal` was an alias of `deepEqual`, in TWO packages

`shared/src/lib/deep-equal.ts:266` read `export const equal = deepEqual;` — verified
the identical function object (`core.equal === core.deepEqual` → `true`), re-exported
by both core and shared.

Removed, and the reason is stronger than "it is an alias": **the word was doing two
jobs.** `equal` is the option key throughout the library —

| Site                         | Meaning of `equal`                     |
| ---------------------------- | -------------------------------------- |
| `linked({ equal })`          | your comparator                        |
| `compared(value, equal)`     | your comparator                        |
| `entityMap({ load, equal })` | your scope comparator                  |
| `export { equal }`           | **deep equality, a specific function** |

One word, two meanings, and the option meaning has dozens of call sites. The export
lost.

One internal consumer existed that the first grep missed, because the pattern required
`from '@signaltree` and the import was relative (`signal-tree.ts:18`). The build caught
it. Worth noting as a method lesson: **a removal grep has to cover relative imports.**

### `@signaltree/events` — the sharpest finding in the pass

The package re-exports Zod as `z` and then **inverts Zod's own naming.** MEASURED
against the built barrel with a real schema:

|                     | valid input               | invalid input                     |
| ------------------- | ------------------------- | --------------------------------- |
| `validateEvent`     | returns the data          | **THROWS** `EventValidationError` |
| `parseEvent`        | returns `{success, data}` | returns `{success:false, error}`  |
| `isValidEvent`      | `true`                    | `false`                           |
| _Zod's `parse`_     | _returns_                 | **_THROWS_**                      |
| _Zod's `safeParse`_ | _returns a result_        | _returns a result_                |

So `parseEvent` is the **safe** one and `validateEvent` is the **throwing** one —
exactly backwards from `parse`/`safeParse` in the library it re-exports. A developer
who knows Zod, which is the whole audience for a Zod-based event package, will predict
the wrong behaviour from both names. All three take `(schema, event)` and wrap
`safeParse`, so the three names are three return contracts over one operation.

**Recommendation:** follow Zod. `parseEvent` throws, `safeParseEvent` returns a result,
`isValidEvent` stays as the type guard. That is a breaking rename of two symbols and it
removes a whole class of mistake.

### `@signaltree/events` — `Id` vs `Key`, used interchangeably

Four generators in the barrel, two suffixes, no rule:

```
generateEventId    generateCorrelationId
generateIdempotencyKey    generateCorrelationKey
```

`generateCorrelationId` and `generateCorrelationKey` are the sharp pair — same noun,
two suffixes, both public. Pick one suffix for "opaque generated string" and apply it
to all four.

### Cross-package name collisions

| Name               | Where                                                                                          | Same thing?                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `deepEqual`        | core, shared                                                                                   | Yes — core re-exports shared's. Fine, and intentional.                                        |
| `equal`            | core, shared                                                                                   | **Was an alias. Removed.**                                                                    |
| `ConnectionState`  | `events/angular/websocket.service.ts:35` (a union type), `realtime/types.ts:22` (an interface) | **No — two different shapes, one name, both public**                                          |
| `ConnectionStatus` | `realtime/types.ts:6` (an enum)                                                                | Sits beside realtime's own `ConnectionState`, so realtime has two connection nouns of its own |

The `ConnectionState` collision is the one to fix: an app using both `@signaltree/events/angular`
and `@signaltree/realtime` imports two incompatible types with one name.

### `packages/enterprise/` is a dead directory

Contains one file, `signaltree.code-workspace`. No `package.json`, no source, no build
target. `@signaltree/enterprise` was REMOVED in 14.0.0 and this is the leftover. Delete
it, or move the workspace file to the repo root where it would be found.

---

## Pass 3 — config and option keys

Method: parse every `export interface|type *Config|*Options|*Opts` across all packages,
collect their keys, and rank by how many distinct config objects share a key name.

### Suffix convention: `Config` vs `Options`, 37 to 19, no rule

Both suffixes are in use and nothing distinguishes them. `AddOptions`/`AddManyOptions`
sit beside `EntityConfig`; `StoredOptions` beside `PersistenceConfig`; ng-forms uses
`AngularFormsConfig` _and_ `FormTreeOptions` _and_ `SignalFormOptions` for overlapping
things. No `*Opts` or `*Settings` — that much is at least consistent.

A defensible rule, if one is wanted: **`Config` for construction-time configuration of a
long-lived thing** (a tree, an enhancer, a marker) and **`Options` for per-call
arguments** (`addOne(entity, opts)`). Several current names already fit it; the outliers
are what the rename would touch.

### Confirmed alias: `treeName` is a legacy alias for `name`

`DevToolsConfig` declares both, with the source saying so — `/** Alias for name (legacy
support) */` — and `devtools-impl.ts:1096` resolves `const displayName = name ?? treeName;`.
So `name` wins and `treeName` is the fallback. Same class as `removeAll` and `equal`;
delete it.

### Confirmed dead option: `TreeConfig.enableTimeTravel`

Declared at `types.ts:489`. **Zero consumers in `signal-tree.ts`.** A second
`enableTimeTravel` exists on `DevToolsConfig` (`types.ts:997`) and that one IS live
(`devtools-impl.ts:666,705`). So the flag a user is most likely to reach for — the one on
the tree's own config — silently does nothing, while the one that works is on the
enhancer. Delete the dead one.

### `equal` in three config interfaces

`AsyncQueryConfig`, `EntityLoadOptions`, `LinkedOptions` — which is the evidence that
removing the `equal` **export** was right rather than merely tidy. The option meaning is
load-bearing and outnumbers the export three to nothing.

### `history` in exactly two, with opposite meanings

`EntityConfig` (opt out) and `FormConfig` (opt in). Already filed; pass 3 confirms the
blast radius is exactly two interfaces, so unifying them is a small change.

### ng-forms has four overlapping form-config types

`FormConfig`(core), `FormTreeOptions`, `AngularFormsConfig`, `SignalFormOptions` share
`validators`, `asyncValidators`, `storage`, `debounceMs`, `destroyRef`, `fieldConfigs`,
`conditionals`, `injector`, `persistDebounceMs`, `validationBatchMs` between them in
varying subsets. Not a naming bug on its own, but four config shapes for one concept is
the kind of thing that produces one — flagged as structural, needing a design pass rather
than a rename.

---

## Still not covered

**Type/interface names beyond the collisions found.** `events` alone exports ~70. One
lead was chased and **cleared**: `ErrorClassification` / `ClassificationResult` looked
like the same concept twice and is not — `ErrorClassification` is the category union
(`'transient' | 'permanent' | 'poison' | 'unknown'`) and `ClassificationResult` wraps one
with `retryConfig`, `sendToDlq` and `reason` (`error-classification.ts:14,39`). Two
concepts, two names, correct. Noted so the next pass does not re-open it.

That is the only category left. Passes 1-3 covered: core's tree and `entityMap` surfaces,
all seven packages' public barrels, and every `*Config`/`*Options` interface's keys.

# Migrating from 13.x to 14.0.0

Every breaking change, what it looks like when you hit it, and the fix.

**Most of these fail at compile time.** That is deliberate: the one change that
could have been silent — a leaf call that did nothing — is now a type error
precisely because it used to fail invisibly at runtime.

---

## 1. Calling a leaf is no longer a setter

```ts
tree.$.count(5); // ❌ TS2554: Expected 0 arguments, but got 1
tree.$.count.set(5); // ✅
tree.$.count.update((n) => n + 1); // ✅
```

**Branches and the root are unchanged** — they are callable and always were:

```ts
tree.$.user({ name: 'Bob' }); // ✅ still a deep partial merge
tree({ user: { name: 'Bob' } }); // ✅ still works
```

**Why it is a removal rather than a deprecation.** A leaf _is_ a real Angular
signal, and calling a signal is a READ that discards its argument. Measured:
`tree.$.count(5)` on a leaf holding `0` returned `0` and left it at `0`. The
type promised a uniformity the runtime never had, and it failed invisibly at
compile time _and_ at run time. The same expression one level up works because a
branch is SignalTree's own accessor.

**Finding every site:** the compiler finds them all. `tsc --noEmit` after
upgrading lists each one as TS2554.

## 2. `@signaltree/callable-syntax` is deleted

Remove the dependency. There is no replacement, and there is no supported way to
make a raw Angular signal callable-as-setter:

```jsonc
// package.json
- "@signaltree/callable-syntax": "^13.0.0",
```

The build transform behind it could never run inside an Angular app, and the
type augmentation it shipped was global — importing anything from
`@signaltree/core` activated it project-wide and broke `@ngrx/signals`'
`WritableStateSource<T>` with ~30 invariance errors in mixed codebases.

## 3. Authoring plumbing moved to `@signaltree/core/authoring`

Nothing was deleted and nothing changed shape. **The import path moves.**

```ts
// before
import { isNodeAccessor, FORM_MARKER, ENTITY_READERS } from '@signaltree/core';
// after
import { isNodeAccessor, FORM_MARKER, ENTITY_READERS } from '@signaltree/core/authoring';
```

Moved (25 symbols):

| group             | symbols                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reader allowlists | `ENTITY_READERS`, `ENTITY_LOADER_READERS`, `STATUS_READERS`, `FORM_READERS`, `FORM_WIZARD_READERS`, `STORED_READERS`, `ASYNC_SOURCE_READERS`, `ASYNC_QUERY_READERS` |
| marker brands     | `FORM_MARKER`, `ASYNC_SOURCE_MARKER`, `ASYNC_QUERY_MARKER`                                                                                                          |
| marker guards     | `isFormMarker`, `isStoredMarker`, `isStatusMarker`, `isDerivedMarker`, `isAsyncSourceMarker`, `isAsyncQueryMarker`                                                  |
| structural guards | `isNodeAccessor`, `isAnySignal`, `isTraversableNode`, `isBuiltInObject`, `isSignalTree`                                                                             |
| misc              | `parsePath`, `SIGNAL_TREE_CONSTANTS`, `SIGNAL_TREE_MESSAGES`                                                                                                        |

`isDev` and `withKind` stayed on the root: an app legitimately branches on the
first, and the second is how you tag a custom `form()` validator.

**Why.** These exist to type `asReadonly`, to brand a marker, or to answer a
question you only ask while walking a tree. None is app code, and all of it sat
on the entry point an app imports. `/authoring` already existed for exactly this
distinction — the root barrel is now 34 symbols, every one of which appears in
the demo app.

## 4. `effects()` was removed

```ts
// before
const tree = signalTree({ count: 0 }).with(effects());
const stop = tree.subscribe((s) => console.log(s.count));

// after — Angular's own effect()
import { effect } from '@angular/core';
const tree = signalTree({ count: 0 });
effect(() => console.log(tree.$.count()));
```

`tree.effect()` / `tree.subscribe()` called Angular's `effect()` with no injector
handling, so using them outside an injection context threw `NG0203` with no way
to opt out. Native `effect()` takes `{ injector }`.

## 5. Serialization helpers removed

`enableSerialization()`, `applyPersistence()` and `deepCloneJSON()` are gone.
They had no importer and no path to any entry point — the exports map has no
wildcard, so no consumer could reach them even deliberately. Use
`serialization()` and `persistence()`:

```ts
const tree = signalTree(state)
  .with(serialization())
  .with(persistence({ key: 'app' }));
```

## 6. `@signaltree/enterprise` is no longer published

```jsonc
// package.json
- "@signaltree/enterprise": "^13.5.0",
```

```ts
// before
const tree = signalTree(state).with(enterprise());
const result = tree.updateOptimized(payload);
if (result.changed) sync(result.changedPaths);

// after — built into core, no enhancer
const tree = signalTree(state);
const changed = tree.updateAndReport(payload);
if (changed.length) sync(changed);
```

Deprecated in 13.5.0 and removed here. The reason is measured rather than
stylistic: `updateOptimized()`'s diff engine was **slower than the thing it was
meant to beat** in every workload — roughly 7x at 2,000 leaves when 10 % of them
change, and ~160x when all of them do. Core leaves are
`signal(value, { equal })` with a reference-equality short-circuit, so "write
only what actually changed" is already core behaviour and costs nothing; the
diff engine walked the whole state to decide which writes to skip, and those
writes were already no-ops. It also silently dropped writes targeting arrays,
and that defect was never fixed.

**13.x stays on npm** so existing lockfiles keep resolving, and is marked
deprecated there. It will not receive a 14-compatible release: it imports
`isBuiltInObject` and `isTraversableNode`, which moved to
`@signaltree/core/authoring` in 14.0.0, so `enterprise@13.x` does not work
against `core@14` at all.

**There is no `onPathChange` replacement in core.** A change-notification design
is still open; do not reach for a subscription API that does not exist.

## 7. Snapshot payload shape

Markers now declare what part of them is state, so a snapshot carries **values**
and not machinery. If you persisted snapshots with 13.x and hydrate them with
14.x, a marker whose payload shape changed is reported with a stable diagnostic
code (ST2024 for `entityMap`) rather than silently ignored.

`tree({ rows: [...] })` with a **bare array** now applies — in 13.x it left the
collection untouched while sibling leaves in the same payload took their values.

---

## New in 14 that you may want while you are here

```ts
tree.$.rows.prependOne(row); // and prependMany
tree.$.rows.setActiveId(id); // master/detail without hand-rolling it
tree.$.rows.activeEntity(); // granular: only THAT row invalidates it
tree.$.rows.changeId(tempId, 42); // adopt the id the server assigned

tree.pauseRecording(); // a bulk import becomes ONE undo step
timeTravel({ shouldSkip: (a, b) => a.cursor !== b.cursor });

import { onTreeError } from '@signaltree/core/authoring';
onTreeError((e) => Sentry.captureException(e.error, { extra: e }));
```

`canUndo()`, `canRedo()` and `getHistory()` are now **reactive**. If you worked
around this in 13.x by polling or by forcing change detection, you can stop:

```ts
// this now works in a zoneless app, where it previously never updated
@if (tree.canUndo()) { <button (click)="tree.undo()">Undo</button> }
```

## One thing to watch that is not a breaking change

`where(predicate)` and `find(predicate)` memoise per predicate **identity**. An
inline arrow in a template allocates a new one every change-detection cycle,
misses the cache, and re-filters the collection — measured at 0.27 ms hoisted
against 20.54 ms inline over 1,000 entities. 14.0.0 warns about it (**ST2026**).

```ts
// ❌ 75x slower, and correct, which is why it needed a diagnostic
@for (row of tree.$.rows.where(r => !r.done)(); track row.id) {}

// ✅ hoist it
protected readonly notDone = (r: Row) => !r.done;
@for (row of tree.$.rows.where(notDone)(); track row.id) {}
```

## Checklist

1. `pnpm up @signaltree/*@14`
2. Remove `@signaltree/callable-syntax` if present.
3. `tsc --noEmit` — fix every TS2554 (leaf calls) and TS2305 (moved imports).
4. Replace `effects()` with Angular's `effect()`.
5. Grep templates for `.where(` / `.find(` with an inline arrow; hoist them.
6. Run your app in dev and watch for ST-coded warnings — they are numbered,
   greppable, and fold out of production builds.

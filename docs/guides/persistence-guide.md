# Persistence: which surface do I use?

SignalTree has four persistence surfaces. They are not competing options — each
covers a different shape of data. This guide is the routing table.

For the threat model and what should never go in browser storage, see
[persistence-and-security.md](./persistence-and-security.md).

## The routing table

| I want…                                                                            | Use                                       | Import from                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| One field to survive refresh (theme, locale, dismissed-banner flag)                 | `stored(key, default)` marker             | `@signaltree/core`                   |
| The whole tree (or a whole feature tree) snapshotted + autosaved                    | `persistence({ key, … })` enhancer        | `@signaltree/core`                   |
| A storage backend other than localStorage (IndexedDB, custom/remote)               | `/storage` adapters, plugged into either  | `@signaltree/core/storage`           |
| A server-backed collection that shows cached rows instantly, then revalidates      | `entityMap({ load, persist })`            | `@signaltree/core`                   |

Rules of thumb:

- **Per-field vs whole-tree:** `stored()` persists one leaf under its own
  storage key; `persistence()` serializes the entire tree state under one key.
  Don't wrap a whole tree in `stored()` fields just to persist it — and don't
  reach for `persistence()` when only `theme` needs to survive.
- **`/storage` is not a fourth strategy** — it's the adapter layer. Both
  `persistence()` and `entityMap({ persist })` accept its `StorageAdapter`
  (`getItem`/`setItem`/`removeItem`, sync or Promise-returning).
- **Server data belongs to `entityMap({ persist })`**, not `persistence()`:
  the loader stays the source of truth; storage is only a warm-start cache
  (hydrate, mark stale, revalidate). Snapshotting server rows with
  `persistence()` gives you stale data with no revalidation story.

## 1. `stored(key, default)` — single field, localStorage

A marker: the field materializes as a `StoredSignal` that auto-loads from
localStorage and auto-saves on `set`/`update` (debounced, default 100 ms).
Versioning and migration are built in (`version`, `migrate` options); the
backend is swappable via `options.storage` (anything satisfying the DOM
`Storage` interface).

```typescript
import { signalTree, stored } from '@signaltree/core';

const tree = signalTree({
  theme: stored<'light' | 'dark'>('app.theme', 'light'),
});

tree.$.theme.set('dark'); // auto-saves to localStorage under 'app.theme'
tree.$.theme.clear(); // remove from storage, reset to default
```

## 2. `persistence({ key, … })` — whole-tree snapshot / autosave

An enhancer (it composes `serialization()` internally, so the tree also gains
`serialize`/`deserialize`/`snapshot`/`restore`). Auto-loads the saved snapshot
on creation (`autoLoad`, default `true`) and autosaves on updates, debounced
(`debounceMs`, default 1000 ms; `autoSave`, default `true`). Adds
`save()`/`load()`/`clear()` for manual control. Defaults to `localStorage`;
pass any `StorageAdapter` as `storage`.

```typescript
import { signalTree, persistence } from '@signaltree/core';

const tree = signalTree({
  filters: { status: 'open', assignee: null as string | null },
  layout: { sidebar: true },
}).with(persistence({ key: 'app-state', debounceMs: 500 }));

tree.$.layout.sidebar.set(false); // autosaved (debounced) under 'app-state'
await tree.clear(); // wipe the stored snapshot
```

## 3. `/storage` adapters — the backend layer

`@signaltree/core/storage` exports the adapter contract and two factories:

- `createIndexedDBAdapter(dbName?, storeName?)` — IndexedDB-backed, for
  snapshots too large or too frequent for localStorage.
- `createStorageAdapter(getItem, setItem, removeItem)` — wrap anything
  (HTTP, SQLite, an encrypting wrapper) in the `StorageAdapter` interface.

The subpath import keeps IndexedDB code out of your bundle unless used.

```typescript
import { signalTree, persistence } from '@signaltree/core';
import { createIndexedDBAdapter } from '@signaltree/core/storage';

const tree = signalTree({ document: { blocks: [] as Block[] } }).with(
  persistence({ key: 'editor', storage: createIndexedDBAdapter() })
);
```

The same adapters plug into `entityMap({ persist })` below. (`stored()` takes
a DOM `Storage` backend instead — it is deliberately localStorage-shaped.)

## 4. `entityMap({ persist })` — per-collection offline-first

For collections with a loader. On every successful `load()`, rows are written
through to the adapter under `key` (scoped collections get one entry per
params scope: `key::<params>`). With `hydrateThenRevalidate: true`, the cached
rows are shown immediately, marked stale, and the loader refetches in the
background — offline-first warm starts.

```typescript
import { signalTree, entityMap } from '@signaltree/core';
import { createIndexedDBAdapter } from '@signaltree/core/storage';

const tree = signalTree({
  plants: entityMap<Plant, string>({
    load: () => api.getPlants(),
    selectId: (p) => p.id,
    staleTime: '30m',
    persist: {
      adapter: createIndexedDBAdapter(),
      key: 'plants',
      hydrateThenRevalidate: true, // cached rows now, fresh rows soon
    },
  }),
});

// First paint: rows from IndexedDB (loaded() is false — they're stale).
// Then the loader settles and loaded() flips true.
```

Persistence here is best-effort by design: a storage failure never breaks the
load path.

## Persisted-scope cleanup (high-cardinality scopes)

Scoped `entityMap({ load, persist })` writes one storage entry per scope
(`key::<stableStringify(params)>`) and never garbage-collects old scopes —
an app cycling through thousands of tenant/customer/search scopes will
accumulate entries. Until a built-in GC policy ships (tracked alongside the
RFC 0003 §5 multi-scope LRU deferral), applications should periodically
clear stale entries themselves (e.g. enumerate adapter keys by the `key::`
prefix and delete those not touched recently, or version the `persist.key`
prefix and drop old versions on startup).

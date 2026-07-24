# Migrating to SignalTree v12

v12 is an "earned major": it lands one real capability improvement (a smaller,
tree-shakeable `entityMap` loader) and clears the entire backlog of APIs that
were marked *"deprecated — removed next major"*. Most apps touch only one or two
of the items below. Every removed API has a direct, mechanical replacement.

## 1. `entityMap` loaders now use `loader()` (breaking)

The raw `entityMap({ load: fn, staleTime, … })` form is removed. Wrap the fetch
with the `loader()` helper and move the loader-family options into it. This is
what makes the loader machinery tree-shakeable — a plain `entityMap()` no longer
pays for it (the `entityMap` bundle floor dropped ~1.5 KB gzip).

```ts
// before (v11)
entityMap<Plant, string>({
  selectId: (p) => p.id,
  load: () => api.list$(),
  staleTime: '30m',
  swr: true,
  tags: ['plants'],
});

// after (v12)
import { entityMap, loader } from '@signaltree/core';

entityMap<Plant, string>({
  selectId: (p) => p.id,
  load: loader(() => api.list$(), { staleTime: '30m', swr: true, tags: ['plants'] }),
});
```

`selectId`/`sortComparer` stay on the `entityMap` config; `staleTime`, `swr`,
`tags`, `persist`, `equal`, `lazy`, `clearOnParamsChange` move into `loader()`'s
second argument. A raw function on `load` now **throws** at the `entityMap()`
call site (`[ST2004]`) — it can never silently no-op.

## 2. Signal Forms bridge: one async authority (breaking)

Bridging a `form()` marker that has `asyncValidators` configured into Signal
Forms now **throws** (`[ST2005]`) instead of warning. The marker's async path
and Signal Forms' `validateAsync`/`validateHttp` can't both drive one form. Pick
one:

- **Signal Forms authority:** remove `asyncValidators` from the `form()` marker
  and declare async validation on the returned `FieldTree` via `validateAsync`/
  `validateHttp`.
- **Marker authority:** keep the marker's async path and don't bridge — drive
  the form through the marker's own `validateField()` / `submit()`.

Sync validators are unchanged and fully unified.

## 3. `effects()` enhancer removed

A SignalTree is made of ordinary Angular signals, so use the platform primitive:

```ts
// before
tree.with(effects());
tree.effect(() => doSomething(tree.$.count()));

// after — native Angular effect(), in an injection context
effect(() => doSomething(tree.$.count()));
```

Native `effect()` has proper injection-context handling (no NG0203 footgun). The
legacy global batching helpers `flushBatchedUpdates()`, `hasPendingUpdates()`,
and `getBatchQueueSize()` are also removed — use the tree's
`flushNotifications()` / `hasPendingNotifications()` methods.

## 4. Legacy `with*` enhancer aliases removed

Use the canonical single-word factory (each is a drop-in rename):

| Removed | Use |
| --- | --- |
| `withBatching` | `batching()` |
| `withDevTools` | `devTools()` |
| `withSerialization` | `serialization()` |
| `withPersistence` | `persistence()` |
| `withEnterprise` | `enterprise()` |
| `withGuardrails` | `guardrails()` |
| `createRealtimeEnhancer` | `realtime()` |

## 5. Enhancer/marker-author plumbing moved to `/authoring`

If you write custom enhancers or markers, these moved off the `@signaltree/core`
root barrel to the `@signaltree/core/authoring` subpath (unchanged otherwise):

```ts
// before
import { getPathNotifier, registerMarkerProcessor } from '@signaltree/core';
// after
import { getPathNotifier, registerMarkerProcessor } from '@signaltree/core/authoring';
```

Affected: `withWriteContext`, `getActiveWriteContext`, `interceptLeafSignals`,
`getPathNotifier`, `registerMarkerProcessor`, `composeEnhancers`,
`createEnhancer`, `resolveEnhancerOrder`, `ENHANCER_META`, `EnhancerMeta`.

## 6. `@signaltree/ng-forms` renames

| Removed | Use |
| --- | --- |
| `markerSignalForm` / `signalFormBridge` | `signalForm()` |
| bare `required` / `email` / `min` / `max` / `minLength` / `maxLength` / `pattern` / `unique` / `compose` / `debounce` | `ngFormValidators.required`, `ngFormValidators.email`, … |
| `createFormTree` (guardrails) | `createGuardedFormTree()` |

## Nothing else changed

Core state APIs (`signalTree`, `$` path access, `.set`/`.update`, `.derived()`,
markers `entityMap`/`status`/`stored`/`form`, `defineStore`, `asReadonly`) are
unchanged. Angular support is 20 / 21 / 22.

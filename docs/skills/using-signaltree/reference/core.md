# Core reference: `@signaltree/core`

Authoritative reference for the surface area an agent uses day-to-day. Signatures are simplified for readability — the source under `packages/core/src/` is the tiebreaker when generics or advanced overloads matter.

## `signalTree(initialState, configOrDerived?)`

Factory that turns a plain state object into a reactive tree.

```ts
import { signalTree } from '@signaltree/core';

interface AppState {
  counter: number;
  user: { name: string; email: string };
}

const tree = signalTree<AppState>({
  counter: 0,
  user: { name: 'Ada', email: 'ada@example.com' },
});

tree.$.counter();             // read → 0
tree.$.user.name.set('Grace');
```

Two overloads:

- `signalTree<T>(initialState: T, config?: TreeConfig)` — standard path.
- `signalTree<T, D>(initialState: T, derivedFactory: ($: TreeNode<T>) => D)` — attach derived state declared alongside the tree. The returned tree has `tree.$` augmented with the derived keys.

Both overloads return a **builder** whose `.with(enhancer)` chain composes enhancers in application order.

## The `$` proxy

`tree.$` is a typed proxy mirroring the shape of your state.

- Leaf access (`tree.$.counter`) returns a `WritableSignal<T>`-compatible accessor. Call it to read (`tree.$.counter()`), call `.set(v)` to assign, `.update(fn)` to update.
- Branch access (`tree.$.user`) returns a group accessor. You can:
  - Dot further into it: `tree.$.user.name`.
  - Read the whole subtree as an object: `tree.$.user()`.
  - Replace the subtree: `tree.$.user({ name, email })` (call the branch accessor).
  - Patch the subtree with an updater: `tree.$.user((u) => ({ ...u, name }))`.
  - `@signaltree/callable-syntax` adds the same callable shorthand for leaves (`tree.$.counter(5)` → `.set(5)`).

The `$` proxy is fully typed — dotting through `tree.$` gives you accurate autocomplete all the way down.

## Reads and writes

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  counter: 0,
  user: { name: 'Ada', email: 'ada@example.com' },
  ui: { theme: 'light' as 'light' | 'dark', sidebarOpen: false },
});

// read a leaf
const n = tree.$.counter();

// read a whole subtree
const user = tree.$.user();

// write a leaf
tree.$.counter.set(1);
tree.$.counter.update((n) => n + 1);

// replace a subtree (call the branch accessor with a new object)
tree.$.user({ name: 'Grace', email: 'grace@example.com' });

// patch a subtree immutably (call the branch accessor with an updater fn)
tree.$.user((u) => ({ ...u, name: 'Grace' }));

// write multiple leaves at the root by calling the tree itself with an updater
tree((s) => ({ ...s, counter: 99, ui: { ...s.ui, theme: 'dark' } }));
```

Reads inside `computed()` and `effect()` register reactive dependencies exactly like bare signals.

**Branch and root writes auto-batch.** When you call a branch accessor or the
root tree with an object or updater, every child signal write that results from
the merge is coalesced into a single change-detection notification. This
replaces the `patchState(store, { a, b, c })` idiom from `@ngrx/signals` —
there's no need to add the `batching()` enhancer just to group a multi-field
update, because branch/root writes are already batched by construction. Reach
for `batching()` only when you want to coalesce multiple *separate* writes
(different call sites) within a tick.

## Markers

Markers are typed placeholders you put in the initial state. `signalTree()` replaces them at that path with the real runtime API.

### `entityMap<E, K>(config?)`

Normalized collection with O(1) CRUD.

```ts
import { signalTree, entityMap } from '@signaltree/core';

interface User { id: number; name: string }

const store = signalTree({
  users: entityMap<User, number>(),
});

store.$.users.addOne({ id: 1, name: 'Ada' });
store.$.users.upsertOne({ id: 1, name: 'Ada Lovelace' });
store.$.users.removeOne(1);
store.$.users.setAll([{ id: 2, name: 'Grace' }]);

const all = store.$.users.all();          // Signal<User[]> → User[]
const oneSig = store.$.users.byId(2);     // Signal<User | undefined> | undefined
const one = oneSig ? oneSig() : null;
```

Key options live on `EntityConfig<E, K>` (e.g. a custom `idKey`).

### `status()`

Async operation state (`NotLoaded` | `Loading` | `Loaded` | `Error`), surfaced as a signal-backed object.

```ts
import { signalTree, status, LoadingState } from '@signaltree/core';

// status() defaults to Error type; pass a type parameter for a custom error shape.
const tree = signalTree({
  load: status<string>(),
});

// Setters
tree.$.load.setLoading();
tree.$.load.setLoaded();
tree.$.load.setError('network failure');
tree.$.load.setNotLoaded();   // resets to initial NotLoaded state, clears error

// Boolean reader signals — use these in templates and computed()
tree.$.load.isLoading();      // Signal<boolean>
tree.$.load.isLoaded();       // Signal<boolean>
tree.$.load.isError();        // Signal<boolean>
tree.$.load.isNotLoaded();    // Signal<boolean>

// Raw state and error if you need them
tree.$.load.state();          // Signal<LoadingState>
tree.$.load.error();          // Signal<E | null>

// When comparing raw state, always use the LoadingState enum — never string literals
const isLoading = tree.$.load.state() === LoadingState.Loading;  // ✓
// tree.$.load.state() === 'loading'                              // ✗ TypeScript error
```

### `stored(key, default)`

A single signal whose value is persisted to `localStorage` under `key`.

```ts
import { signalTree, stored } from '@signaltree/core';

const tree = signalTree({
  theme: stored<'light' | 'dark'>('app.theme', 'light'),
});

tree.$.theme.set('dark'); // writes through to localStorage
```

For full-tree persistence instead of a single leaf, use the `persistence()` enhancer.

### `form(fields)`

Tree-integrated form state (values, errors, dirty/touched, validity). For Angular `FormGroup` interop, pair with `formBridge()` from `@signaltree/ng-forms`.

```ts
import { signalTree, form } from '@signaltree/core';

// form() takes a FormConfig — pass initial values under `initial`.
const tree = signalTree({
  profile: form({
    initial: { username: '', email: '' },
  }),
});
```

See [`../ng-forms/SKILL.md`](../ng-forms/SKILL.md) for full form guidance.

### Custom markers

`registerMarkerProcessor(processor)` extends the marker system. **Call it before any `signalTree()` that uses the custom marker.**

## Enhancer composition

`.with(enhancer)` chains enhancers in application order.

```ts
import {
  signalTree,
  batching,
  memoization,
  timeTravel,
  devTools,
  persistence,
} from '@signaltree/core';

const tree = signalTree({ count: 0 })
  .with(batching())
  .with(memoization({ equality: 'shallow' }))
  .with(
    timeTravel({
      // Customize the labels that show up in the DevTools action list.
      actionNames: { update: 'x/update', set: 'x/set' },
    })
  )
  .with(devTools({ treeName: 'Counter' }))
  .with(
    persistence({
      key: 'counter.v1',
      autoSave: true,
      autoLoad: true,
      debounceMs: 500,
    })
  );
```

SignalTree does **not** support per-call action names — there is no
`store.$.count.set(5, 'incrementClicked')` signature. The `actionNames` block
above (on `TimeTravelConfig`) rewrites the category labels (`update`, `set`,
`batch`) globally. If you need finer-grained DevTools labels, use an Angular
`effect()` to emit a tagged action as state mirrors the interesting change, or
split hot domains into separately-labeled trees with their own
`devTools({ treeName })`.

Built-in enhancers exported from `@signaltree/core`:

- `batching(config?: BatchingConfig)` — coalesce change-detection notifications.
- `memoization(config?)` — cached derived values with deep/shallow equality and optional LRU.
- `timeTravel(config?)` — undo / redo history.
- `devTools(config?)` — Redux DevTools integration.
- `serialization(config?)` / `persistence(config?)` — snapshot and auto-persist.

Utilities you may need when composing enhancers yourself:

- `composeEnhancers(...enhancers)` — combine multiple enhancers into one.
- `createEnhancer(metadata, fn)` — author a third-party enhancer with metadata.
- `resolveEnhancerOrder(list)` — dependency-aware ordering.
- `ENHANCER_META` — symbol used by third parties to attach metadata.

## Derived state helpers

Two helpers for declaring derived functions in separate files without losing type inference:

- `derivedFrom<TTree>()` — returns a function that accepts `($) => derived`. Explicitly types `TTree` while inferring the return.
- `externalDerived` — alias of `derivedFrom`.

```ts
import { derivedFrom } from '@signaltree/core';
import type { SignalTree } from '@signaltree/core';

interface AppState { counter: number }
type AppTree = SignalTree<AppState>;

export const counterDerived = derivedFrom<AppTree>()(($) => ({
  doubled: $.counter() * 2,
}));
```

Prefer plain Angular `computed()` for inline derivations. Reach for `derivedFrom` only when you need to declare derived logic in a separate file and still get typed `$`.

## Other utilities

- `equal(a, b)` / `deepEqual(a, b)` — equality helpers used internally and safe to consume.
- `parsePath('a.b.c')` — split a dot path into segments for dynamic access.
- `isNodeAccessor(x)`, `isAnySignal(x)`, `toWritableSignal(x)` — runtime type guards / coercions.

## Subpath exports

`@signaltree/core` ships additional entry points (not re-exported from the root) to keep the main bundle small:

- `@signaltree/core/edit-session` — batched edit sessions.
- `@signaltree/core/security` — security-oriented helpers.
- `@signaltree/core/storage` — storage adapter primitives.
- `@signaltree/core/presets` — tree config presets.

Import from the subpath when you need these — do not expect them on the main barrel.

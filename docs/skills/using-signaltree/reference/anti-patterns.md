# Anti-patterns

Things not to do with SignalTree, and what to do instead. Each item shows a wrong example and a right one.

> **Note for editors:** `scripts/lint-skills.mjs` type-checks every fenced
> `ts` / `typescript` / `tsx` block in this directory against the real built
> `@signaltree/*` packages. To mark a block as an intentional anti-pattern
> that must not be type-checked (syntax is still parsed), add a
> `// @skip-lint` comment as the first non-blank line of the block, or add
> `wrong` / `bad` / `skip` to the fence info string (e.g. ` ```ts wrong `).

## Do not reintroduce actions / reducers / selectors

SignalTree replaces dispatch-plus-reducer pipelines with direct reactive JSON. If you're designing actions and reducers on top of it, you're fighting the design.

```ts
// ✗ Wrong — Redux-style layer on top of SignalTree
type Action = { type: 'inc' } | { type: 'reset' };

function reduce(state: { count: number }, action: Action) {
  switch (action.type) {
    case 'inc': return { ...state, count: state.count + 1 };
    case 'reset': return { ...state, count: 0 };
  }
}
```

```ts
// ✓ Right — mutate the tree directly
import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0 });

function inc()   { tree.$.count.update((n) => n + 1); }
function reset() { tree.$.count.set(0); }
```

If you want undo/redo, add `timeTravel()`. If you want DevTools, add `devTools()`. You don't need action types.

## Do not write inside `computed()`

`computed()` must be a pure read. Writing to a signal inside it causes infinite re-computation loops and detached reactivity.

```ts
// ✗ Wrong — writing inside computed()
import { computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0, doubled: 0 });

const doubled = computed(() => {
  const n = tree.$.count() * 2;
  tree.$.doubled.set(n);   // ← never do this
  return n;
});
```

```ts
// ✓ Right — derive with computed(), or mirror with effect()
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0 });

// pure derivation
const doubled = computed(() => tree.$.count() * 2);

// or, if a mirrored leaf is genuinely needed:
const mirror = signalTree({ doubled: 0 });
effect(() => mirror.$.doubled.set(tree.$.count() * 2));
```

## Do not install `@signaltree/shared`, `types`, or `utils`

These are **private, bundled packages** consumed internally by the public `@signaltree/*` packages. Adding them to `dependencies` leads to duplicate module graphs, version skew, and broken type inference.

```jsonc
// ✗ Wrong — package.json dependencies
{
  "dependencies": {
    "@signaltree/core": "^9.0.0",
    "@signaltree/shared": "^9.0.0",   // ← don't
    "@signaltree/types": "^9.0.0",    // ← don't
    "@signaltree/utils": "^9.0.0"     // ← don't
  }
}
```

```jsonc
// ✓ Right — only the public packages you actually use
{
  "dependencies": {
    "@signaltree/core": "^9.0.0",
    "@signaltree/ng-forms": "^9.0.0"
  }
}
```

## Do not register marker processors after tree creation

`registerMarkerProcessor()` must run **before** any `signalTree()` call that relies on the custom marker, otherwise the marker stays in the state object as an unprocessed placeholder.

```ts wrong
// ✗ Wrong — registration happens too late.
// Intentional anti-pattern; skipped by the skill lint.
import { signalTree, registerMarkerProcessor } from '@signaltree/core';
import { myMarker, MY_MARKER, myProcessor } from './my-marker';

const tree = signalTree({ slot: myMarker() }); // ← processor not registered yet
registerMarkerProcessor(MY_MARKER, myProcessor);
```

```ts
// ✓ Right — register first, then create trees
import { signalTree, registerMarkerProcessor } from '@signaltree/core';
import { myMarker, MY_MARKER, myProcessor } from './my-marker';

registerMarkerProcessor(MY_MARKER, myProcessor);

const tree = signalTree({ slot: myMarker() });
```

## Do not hold stale node references across tree recreations

If you replace a subtree wholesale (`tree.$.user(newObj)`) or rebuild the tree itself, any previously captured node reference may no longer point at the live signal.

```ts
// ✗ Wrong — capturing a branch accessor then replacing the subtree
import { signalTree } from '@signaltree/core';

const tree = signalTree({ user: { name: 'Ada' } });
const userNode = tree.$.user;            // captured
tree.$.user({ name: 'Grace' });          // subtree replaced
// userNode may be stale now — re-read from tree.$ instead
```

```ts
// ✓ Right — re-read through tree.$ when you need the current node
import { signalTree } from '@signaltree/core';

const tree = signalTree({ user: { name: 'Ada' } });
tree.$.user({ name: 'Grace' });
const currentName = tree.$.user.name();  // always reads the live signal
```

As a rule: pass the `tree` (or a narrow factory-exposed API) rather than long-lived raw node references.

## Do not use branch replacement on subtrees that contain markers

The callable branch form `tree.$.domain(newObj)` replaces the entire subtree with
a plain object. Any `status()`, `entityMap()`, or custom marker nodes inside that
subtree are **overwritten** — the marker-backed methods (`setLoading`, `upsertOne`,
etc.) disappear and the plain value is written in their place.

```ts wrong
import { signalTree, status, entityMap } from '@signaltree/core';

interface Item { id: number }
const tree = signalTree({
  items: { entities: entityMap<Item>(), loading: status() }
});

// ✗ Wrong — overwrites the marker nodes with plain values
tree.$.items({ entities: [], loading: { state: 'idle', error: null } });
// tree.$.items.loading.setLoading is now undefined
```

```ts
import { signalTree, status, entityMap } from '@signaltree/core';

interface Item { id: number }
const tree = signalTree({
  items: { entities: entityMap<Item>(), loading: status() }
});

// ✓ Right — update each writable leaf individually
tree.$.items.entities.clear();
tree.$.items.loading.setLoading();
```

This applies to any subtree that contains markers — `status()`, `entityMap()`,
or custom markers registered via `registerMarkerProcessor`. As a practical rule:
if a domain slice has markers in it, reset it by calling its individual writable
leaves rather than replacing the whole branch.

## Do not service-wrap a component-local tree

SignalTree trees can live on a component or in a plain factory function.
Wrapping a component-local tree in a `providedIn: 'root'` service adds ceremony
without reactivity benefit and turns a per-component counter into accidental
global state.

```ts wrong
// ✗ Wrong — a root service for a component-local counter
import { Injectable } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
class CounterService {
  readonly tree = signalTree({ count: 0 });
}
```

```ts
// ✓ Right — component-local is fine
import { Component } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Component({ selector: 'app-counter', template: '' })
class CounterComponent {
  readonly tree = signalTree({ count: 0 });
}
```

### When a shared service IS correct

A shared service is exactly the right shape when the tree is **genuinely**
shared across components, routes, or the whole app — for example, a single
application-wide store, an auth/identity store, or a store holding data
fetched once and reused. That case has its own canonical recipe (and is also
what migrations from `@ngrx/signals signalStore({ providedIn: 'root' })` map
onto); see the "Shared service (`providedIn: 'root'`)" and
"Prefer a single global store" sections in
[`patterns.md`](patterns.md).

The rule is: let scope drive the decision. Local state → component field.
Shared state → a service (or a single app-wide store).

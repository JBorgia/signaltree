# Enhancer System — Overview

This document describes the enhancer system in `@signaltree/core`.
Enhancers are built-in, tree-shakable extensions that augment a `SignalTree` at runtime
via `tree.with(...)`.

All enhancers are exported from `@signaltree/core` — no separate packages needed.

Key pieces

- `createEnhancer(meta, fn)` — helper that attaches metadata to an enhancer function.
- `ENHANCER_META` — symbol under which metadata is also attached for 3rd-party compatibility.
- `tree.with(...enhancers)` — apply 1..N enhancers to a tree; supports optional metadata-based
  re-ordering via `requires`/`provides`.

Metadata schema

- `name` (string) — optional but recommended: a stable name used for ordering/diagnostics.
- `requires` (string[]) — names of capabilities the enhancer needs present before it runs.
- `provides` (string[]) — names of capabilities the enhancer will add to the tree.

Behavior

- Enhancers may mutate the passed tree (preferred) or return a new object. If the enhancer
  returns the same instance, mutation is assumed. If it returns a new value, that value is used
  for subsequent enhancers.
- If any metadata `requires` are already available from core configuration (for example,
  microtask notification batching when `config.batchUpdates` is true), the sorter treats them
  as satisfied.
- A topological sort orders enhancers that declare metadata. On cycles the system falls back to
  the user-provided order and warns in debug mode.

## Examples

All enhancers are imported from `@signaltree/core`:

### Apply enhancers in explicit order:

```typescript
import { signalTree, batching, devTools } from '@signaltree/core';

const enhanced = signalTree({ count: 0 }).with(batching()).with(devTools());
```

Each `.with()` returns `this & TAdded`, so every enhancer's methods accumulate
and stay statically available to the end of the chain. Note that the enhancers
are CALLED — `batching` is a factory that takes config and returns the enhancer.

> `composeEnhancers(...)` was removed in 15.0. Its type used one `T` for both
> its parameter and its return, leaving nowhere to carry what an enhancer ADDS,
> so a composed chain silently lost every method it applied. Chain `.with()`
> instead; it is not a workaround, it is the path that preserves the types.

### Use presets for convenient developer setup:

> **9.0.1:** Preset factories (`createDevTree`, `TREE_PRESETS`) were removed. Compose enhancers directly:

```typescript
import { signalTree, batching, devTools, withTimeTravel } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(batching()).with(devTools()).with(withTimeTravel());
```

## Best practices

- Prefer mutation (augment `tree` and return it). This preserves identity for consumers holding
  references to the original tree.
- Provide `name` and `provides` for any enhancer that adds public capabilities.
- Use `requires` for enhancers that depend on other features (core or other enhancers).
- All built-in enhancers are available from `@signaltree/core` — no need for separate packages.

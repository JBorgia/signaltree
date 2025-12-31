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
  `batchUpdate` when `config.batchUpdates` is true), the sorter treats them as satisfied.
- A topological sort orders enhancers that declare metadata. On cycles the system falls back to
  the user-provided order and warns in debug mode.

## Examples

All enhancers are imported from `@signaltree/core`:

### Simple composition using `composeEnhancers`:

```typescript
import { signalTree, composeEnhancers, batching, devTools } from '@signaltree/core';

const composed = composeEnhancers(batching, devTools);

const tree = signalTree({ count: 0 }).with(composed);
```

### Or apply enhancers directly in explicit order (recommended for predictability):

```typescript
import { signalTree, batching, devTools } from '@signaltree/core';

const enhanced = signalTree({ count: 0 }).with(batching, devTools);
```

### Use presets for convenient developer setup:

`createDevTree` provides a pre-configured development setup:

```typescript
import { createDevTree } from '@signaltree/core';

const tree = createDevTree({ count: 0 });
// Includes: batching, memoization, devtools, time-travel
```

## Best practices

- Prefer mutation (augment `tree` and return it). This preserves identity for consumers holding
  references to the original tree.
- Provide `name` and `provides` for any enhancer that adds public capabilities.
- Use `requires` for enhancers that depend on other features (core or other enhancers).
- All built-in enhancers are available from `@signaltree/core` — no need for separate packages.

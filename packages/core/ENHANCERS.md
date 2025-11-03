# Enhancer System (Core) — Overview

This document describes the enhancer system introduced in `@signaltree/core`.
Enhancers are optional, tree-shakable extensions that augment a `SignalTree` at runtime
via `tree.with(...)`.

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

Examples (Angular-first)

The preferred pattern is to import small, focused enhancers from their packages and compose them explicitly.

Simple composition using `composeEnhancers` from `@signaltree/core`:

```typescript
import { signalTree, composeEnhancers } from '@signaltree/core';
import { withBatching } from '@signaltree/core';
import { withDevTools } from '@signaltree/core';

const composed = composeEnhancers(withBatching, withDevTools);

const tree = signalTree({ count: 0 }).with(composed);
```

Or apply enhancers directly in explicit order (recommended for predictability):

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/core';
import { withDevTools } from '@signaltree/core';

const enhanced = signalTree({ count: 0 }).with(withBatching, withDevTools);
```

Use a preset for convenient developer onboarding. `@signaltree/presets` exposes helpers such as `createDevTree` which
returns a `config` and a composed `enhancer` that you can apply:

```typescript
import { signalTree } from '@signaltree/core';
import { createDevTree } from '@signaltree/core';

const { enhancer } = createDevTree();
const tree = signalTree({ count: 0 }).with(enhancer);
```

Best practices

- Prefer mutation (augment `tree` and return it). This preserves identity for consumers holding
  references to the original tree.
- Provide `name` and `provides` for any enhancer that adds public capabilities.
- Use `requires` for enhancers that depend on other features (core or other enhancers).

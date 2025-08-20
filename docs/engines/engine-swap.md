# Engine Swapping (Angular vs Vanilla)

SignalTree decouples its core state model from the underlying reactive runtime via a pluggable `SignalEngine` adapter.

## Default

By default the Angular Signals engine is active (full DI, cleanup, batching semantics). Existing Angular users do nothing.

## Vanilla Engine

For non-Angular / lighter environments use the experimental vanilla engine:

```ts
import { configureSignalEngine, vanillaEngine, signalTree } from '@signaltree/core';

configureSignalEngine({ ...vanillaEngine });

const tree = signalTree({ count: 0 });
console.log(tree.state.count()); // 0
```

### Capabilities Matrix

| Capability  | Angular | Vanilla                    |
| ----------- | ------- | -------------------------- |
| DI (inject) | Yes     | No (throws)                |
| Cleanup     | Yes     | No                         |
| Batching    | Yes     | No (batch is pass-through) |

Inspect current engine:

```ts
import { __ADAPTER_META__ } from '@signaltree/core';
console.log(__ADAPTER_META__());
```

### When to Use Vanilla

- SSR scripts without Angular
- Node CLI tooling
- Experimental size-sensitive builds

### Caveats

- `inject()` will throw.
- Effect cleanup callbacks aren’t invoked (no `onCleanup`).
- No internal batching; high-frequency updates may be less efficient.

## Resetting

```ts
import { resetSignalEngine } from '@signaltree/core';
resetSignalEngine(); // back to Angular
```

## Benchmarking Both

Scripts:

```
# Angular (default)
npm run perf:bench

# Vanilla
npm run perf:bench:vanilla
```

Regression guards exist for both engines; update baselines intentionally when improvements land:

```
npm run perf:bench:update
npm run perf:bench:vanilla:update
```

## Roadmap

- Subpath exports (`/engine-angular`, `/engine-vanilla`)
- Separate published engine packages
- Capability-based feature branching (batching, cleanup) in core features

---

Status: Experimental (vanilla). Provide feedback via issues.

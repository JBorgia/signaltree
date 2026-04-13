# Writing Custom Enhancers

## Enhancer Contract

An enhancer is a **factory function** that returns a **tree transformer**:

```typescript
function myEnhancer(config?: MyConfig) {
  const enhancerFn = <T>(tree: ISignalTree<T>): ISignalTree<T> & MyMethods => {
    // Add methods/behavior to tree
    // Register cleanup for any resources (timers, subscriptions)
    if (typeof tree.registerCleanup === 'function') {
      tree.registerCleanup(() => {
        // Clean up timers, caches, subscriptions
      });
    }
    return Object.assign(tree, methods) as ISignalTree<T> & MyMethods;
  };

  // Attach metadata for duplicate detection and dependency ordering
  const meta: EnhancerMeta = {
    name: 'myEnhancer', // Unique name — duplicates throw
    provides: ['myEnhancer'], // Capabilities this enhancer adds
    requires: ['serialization'], // Capabilities that must be applied first (optional)
  };
  (enhancerFn as any).metadata = meta;
  (enhancerFn as any)[ENHANCER_META] = meta;

  return enhancerFn;
}
```

## Rules

1. **Metadata is required** for duplicate detection. Without it, the same enhancer can be applied twice.
2. **`registerCleanup()`** — Register teardown functions so `tree.destroy()` releases resources.
3. **Respect `enabled`** — If your enhancer accepts `{ enabled }`, return a noop passthrough when disabled.
4. **Mutate, don't replace** — Use `Object.assign(tree, methods)` instead of creating a new object. The tree identity must be preserved for signals to work.
5. **Don't override `destroy()`** — Use `registerCleanup()` instead of monkey-patching `destroy`.

## Imports

```typescript
import type { ISignalTree, EnhancerMeta } from '@signaltree/core';
import { ENHANCER_META } from '@signaltree/core';
```

## Usage

```typescript
const tree = signalTree({ count: 0 })
  .with(batching())
  .with(myEnhancer({ option: true }));
```

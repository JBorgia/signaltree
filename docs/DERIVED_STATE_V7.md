# SignalTree v7: Derived State Pattern

## Overview

SignalTree v7 introduces the `derived()` marker pattern for declaring computed signals alongside source state. This enables type-safe, reactive derived state that automatically updates when dependencies change.

## Core Concepts

### The Problem

Previously, computed state required manual setup outside the tree definition:

```typescript
// Old approach - manual computed setup
const tree = signalTree({ count: 0 });
const doubled = computed(() => tree.$.count() * 2); // Separate, disconnected
```

### The Solution

The `derived()` marker pattern allows computed signals to be declared inline:

```typescript
// New approach - integrated derived state
const tree = signalTree({ count: 0 }).derived(($) => ({
  doubled: derived(() => $.count() * 2),
}));

tree.$.doubled(); // 0 - type-safe access
tree.$.count.set(5);
tree.$.doubled(); // 10 - automatically updates
```

## API Reference

### `derived<T>(factory: () => T): DerivedMarker<T>`

Creates a marker that will be converted to a computed signal at runtime.

```typescript
import { derived } from '@signaltree/core';

derived(() => someSignal() * 2); // Returns DerivedMarker<number>
```

### `signalTree().derived(factory)`

Adds a layer of derived state to the tree. Can be chained multiple times.

```typescript
const tree = signalTree({ value: 1 })
  .derived(($) => ({
    doubled: derived(() => $.value() * 2),
  }))
  .derived(($) => ({
    quadrupled: derived(() => $.doubled() * 2), // Can reference previous derived
  }));
```

## Usage Patterns

### Basic Derived State

```typescript
interface AppState {
  items: string[];
  filter: string;
}

const tree = signalTree<AppState>({
  items: ['apple', 'banana', 'cherry'],
  filter: '',
}).derived(($) => ({
  filteredItems: derived(() => $.items().filter((item) => item.includes($.filter()))),
  itemCount: derived(() => $.items().length),
}));
```

### Nested Derived Definitions

```typescript
const tree = signalTree({ items: [1, 2, 3] }).derived(($) => ({
  stats: {
    count: derived(() => $.items().length),
    sum: derived(() => $.items().reduce((a, b) => a + b, 0)),
    average: derived(() => {
      const items = $.items();
      return items.length ? items.reduce((a, b) => a + b, 0) / items.length : 0;
    }),
  },
}));

tree.$.stats.count(); // 3
tree.$.stats.sum(); // 6
tree.$.stats.average(); // 2
```

### Chained Derived Layers (Derived-of-Derived)

```typescript
const tree = signalTree({ base: 10 })
  .derived(($) => ({
    doubled: derived(() => $.base() * 2),
  }))
  .derived(($) => ({
    quadrupled: derived(() => $.doubled() * 2),
    octupled: derived(() => $.quadrupled() * 2),
  }));

tree.$.base.set(5);
tree.$.octupled(); // 40
```

### With Enhancers

The `.derived()` method works seamlessly with enhancer chaining. You can add derived state before or after enhancers:

```typescript
const tree = signalTree({ count: 0 })
  .derived(($) => ({
    doubled: derived(() => $.count() * 2),
  }))
  .with(batching())
  .with(timeTravel())
  .derived(($) => ({
    // Can add more derived after enhancers too
    quadrupled: derived(() => $.doubled() * 2),
  }));

// Enhancer methods are available
tree.batch(() => {
  tree.$.count.set(10);
});
tree.undo();
```

### Second-Argument Syntax

For simpler cases, you can pass the derived factory as the second argument:

```typescript
// Instead of chaining .derived()
const tree = signalTree({ count: 0 }, ($) => ({
  doubled: derived(() => $.count() * 2),
  tripled: derived(() => $.count() * 3),
}));

tree.$.doubled(); // 0
tree.$.count.set(5);
tree.$.doubled(); // 10
tree.$.tripled(); // 15
```

You can still chain additional `.derived()` calls after:

```typescript
const tree = signalTree({ base: 2 }, ($) => ({
  doubled: derived(() => $.base() * 2),
})).derived(($) => ({
  // $.doubled is available from second argument
  quadrupled: derived(() => $.doubled() * 2),
}));
```

### With EntityMap Integration

The `derived()` pattern works perfectly with `entityMap()` for reactive entity queries:

```typescript
import { signalTree, entityMap, entities, derived } from '@signaltree/core';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
}

const tree = signalTree({
  users: entityMap<User, number>(),
  selectedUserId: null as number | null,
})
  .with(entities())
  .derived(($) => ({
    // Derived from entityMap.byId()
    selectedUser: derived(() => {
      const id = $.selectedUserId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),

    // Derived from entityMap queries
    activeUsers: derived(() => $.users.all().filter((u) => u.active)),
    adminCount: derived(() => $.users.all().filter((u) => u.role === 'admin').length),
  }));

// Add users
tree.$.users.addMany([
  { id: 1, name: 'Alice', role: 'admin', active: true },
  { id: 2, name: 'Bob', role: 'user', active: true },
  { id: 3, name: 'Charlie', role: 'user', active: false },
]);

tree.$.activeUsers(); // [Alice, Bob]
tree.$.adminCount(); // 1

// Select a user
tree.$.selectedUserId.set(2);
tree.$.selectedUser()?.name; // 'Bob'

// Entity mutations automatically update derived
tree.$.users.updateOne(3, { active: true });
tree.$.activeUsers().length; // 3
```

#### Cross-Entity Derived

You can create derived state that spans multiple entity collections:

```typescript
interface Order {
  id: number;
  userId: number;
  total: number;
  status: 'pending' | 'shipped' | 'delivered';
}

const tree = signalTree({
  users: entityMap<User, number>(),
  orders: entityMap<Order, number>(),
  selectedUserId: null as number | null,
})
  .with(entities())
  .derived(($) => ({
    selectedUser: derived(() => {
      const id = $.selectedUserId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),
    selectedUserOrders: derived(() => {
      const userId = $.selectedUserId();
      if (userId == null) return [];
      return $.orders.all().filter((o) => o.userId === userId);
    }),
  }))
  .derived(($) => ({
    // Second layer depends on first
    selectedUserTotalSpent: derived(() => $.selectedUserOrders().reduce((sum, o) => sum + o.total, 0)),
  }));
```

### Mixed Derived and Regular Computed

You can mix `derived()` markers with regular `computed()` signals:

```typescript
import { computed } from '@angular/core';
import { derived, signalTree } from '@signaltree/core';

const tree = signalTree({ value: 10 }).derived(($) => ({
  markerDerived: derived(() => $.value() + 1),
  regularComputed: computed(() => $.value() + 2), // Also works
}));
```

## Implementation Details

### Lazy Finalization

Derived factories are queued and only executed when `$` is first accessed:

```typescript
const tree = signalTree({ count: 0 }).derived(($) => {
  console.log('Factory runs'); // Only runs on first $ access
  return { doubled: derived(() => $.count() * 2) };
});

// Factory hasn't run yet
tree.$.count(); // Now factory runs
```

### Error Handling

Adding derived after `$` access throws an error:

```typescript
const tree = signalTree({ count: 0 });
tree.$.count(); // Finalize tree

tree.derived(($) => ({
  // Throws!
  doubled: derived(() => $.count() * 2),
}));
// Error: SignalTree: Cannot add derived() after tree.$ has been accessed.
```

## Type System

### ProcessDerived<T>

Transforms derived markers to signals at the type level:

```typescript
type Input = {
  doubled: DerivedMarker<number>;
  nested: {
    computed: DerivedMarker<string>;
  };
};

type Output = ProcessDerived<Input>;
// {
//   doubled: Signal<number>;
//   nested: {
//     computed: Signal<string>;
//   };
// }
```

### SignalTreeBuilder<TSource, TAccum>

The builder type uses two type parameters for proper type accumulation:

- `TSource`: The raw source state type (used for `with()` and callable signature)
- `TAccum`: The accumulated `$` type that grows with each `.derived()` call

```typescript
interface SignalTreeBuilder<TSource, TAccum = TreeNode<TSource>> {
  // Callable (backward compatible with NodeAccessor)
  (): TSource;
  (value: TSource): void;
  (updater: (current: TSource) => TSource): void;

  // State accessors with accumulated type
  readonly $: TAccum;
  readonly state: TAccum;

  // Enhancer chaining - maintains builder type
  with<TAdded>(enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded): SignalTreeBuilder<TSource, TAccum> & TAdded;

  // Derived chaining - grows TAccum type
  derived<TDerived extends object>(factory: ($: TAccum) => TDerived): SignalTreeBuilder<TSource, TAccum & ProcessDerived<TDerived>>;

  // From ISignalTree
  bind(thisArg?: unknown): (value?: TSource) => TSource | void;
  destroy(): void;
}
```

This two-parameter design ensures proper type inference when chaining multiple `.derived()` calls:

```typescript
const tree = signalTree({ count: 1 })
  .derived(($) => ({
    doubled: derived(() => $.count() * 2),
  }))
  .derived(($) => ({
    // ✓ $.doubled is typed because TAccum accumulated it
    quadrupled: derived(() => $.doubled() * 2),
  }));
```

## Migration Guide

### TruckTrax AppStore Migration Example

The TruckTrax AppStore uses the pattern of defining computed signals in the store class:

**Before (AppStore with separate computed):**

```typescript
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree: AppTree = inject(APP_TREE);
  readonly $ = this.tree.$;

  // Many computed signals defined in class
  readonly isExternalDriver = computed(() => this.$.driver.current()?.isExternal ?? true);
  readonly isDriverLoaded = computed(() => this.$.driver.current() != null);
  readonly driverUrl = computed(() => this.$.driver.current()?.url ?? '');
  readonly selectedTruck = computed(() => {
    const id = this.$.selected.truckId();
    return id != null ? this.$.trucks.byId(id)?.() ?? null : null;
  });
  readonly selectableTrucks = computed(() => {
    const driver = this.$.driver.current();
    if (!driver?.isExternal) return this.$.trucks.all() ?? [];
    const haulerId = this.$.selected.haulerId();
    if (haulerId == null) return [];
    return (this.$.trucks.all() ?? []).filter((t) => t.haulers?.some((h) => h.url?.endsWith(`/${haulerId}`)));
  });
  // ... 20+ more computed signals
}
```

**After (Using derived()):**

```typescript
// In app-tree.ts
export function createAppTree(initial: { haulerId: Nullable<number>; truckId: Nullable<number> }) {
  return signalTree({
    trucks: entityMap<TruckDto, number>(),
    haulers: entityMap<HaulerDto, number>(),
    drivers: entityMap<DriverDto, number>(),
    selected: {
      haulerId: initial.haulerId,
      truckId: initial.truckId,
    },
    driver: { current: null as Nullable<DriverDto>, loading: loadingSlice() },
    // ... rest of state
  })
    .derived(($) => ({
      // Driver-related derived state
      isExternalDriver: derived(() => $.driver.current()?.isExternal ?? true),
      isDriverLoaded: derived(() => $.driver.current() != null),
      driverUrl: derived(() => $.driver.current()?.url ?? ''),

      // Selection derived state
      selectedTruck: derived(() => {
        const id = $.selected.truckId();
        return id != null ? $.trucks.byId(id)?.() ?? null : null;
      }),
      selectableTrucks: derived(() => {
        const driver = $.driver.current();
        if (!driver?.isExternal) return $.trucks.all() ?? [];
        const haulerId = $.selected.haulerId();
        if (haulerId == null) return [];
        return ($.trucks.all() ?? []).filter((t) => t.haulers?.some((h) => h.url?.endsWith(`/${haulerId}`)));
      }),
    }))
    .with(batching())
    .with(entities())
    .with(devTools({ name: 'AppTree' }));
}

// In app-store.ts - Much simpler, just expose tree signals
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree: AppTree = inject(APP_TREE);
  readonly $ = this.tree.$;

  // Derived state is now on the tree itself
  // Components access: store.$.isExternalDriver()
  // No need to duplicate in store class
}
```

### Benefits of Migration

1. **Co-located State**: Derived state lives with source state
2. **Single Source of Truth**: No duplication between tree and store
3. **Better Tree-Shaking**: Unused derived can be removed
4. **Type Safety**: Full inference from source to derived
5. **Simpler Store**: Store becomes a thin facade for operations

### Gradual Migration Strategy

Migrate computed signals incrementally:

```typescript
// Phase 1: Keep existing computed, add derived for new features
export function createAppTree(initial) {
  return signalTree({ /* state */ })
    .derived(($) => ({
      // New features use derived()
      newFeatureComputed: derived(() => /* ... */),
    }));
}

// Phase 2: Move simple computed to derived
.derived(($) => ({
  isDriverLoaded: derived(() => $.driver.current() != null),
  driverUrl: derived(() => $.driver.current()?.url ?? ''),
}))

// Phase 3: Move complex computed
.derived(($) => ({
  selectableTrucks: derived(() => {
    // Complex logic
  }),
}))

// Phase 4: Remove from AppStore class
```

### From Manual Computed

**Before:**

```typescript
const tree = signalTree({ count: 0, name: '' });
const fullDisplay = computed(() => `${tree.$.name()}: ${tree.$.count()}`);

// Usage
fullDisplay(); // Disconnected from tree
```

**After:**

```typescript
const tree = signalTree({ count: 0, name: '' }).derived(($) => ({
  fullDisplay: derived(() => `${$.name()}: ${$.count()}`),
}));

// Usage
tree.$.fullDisplay(); // Integrated with tree
```

### From Selector Functions

**Before:**

```typescript
const tree = signalTree({ items: [], selectedId: null });

function getSelectedItem() {
  return computed(() => tree.$.items().find((i) => i.id === tree.$.selectedId()));
}
```

**After:**

```typescript
const tree = signalTree({ items: [], selectedId: null }).derived(($) => ({
  selectedItem: derived(() => $.items().find((i) => i.id === $.selectedId())),
}));
```

## Backward Compatibility

The `signalTree()` function now returns a `SignalTreeBuilder`, but it remains fully backward compatible:

- **Callable**: `tree()` returns unwrapped state
- **Updatable**: `tree({ count: 5 })` updates state
- **Accessors**: `tree.$` and `tree.state` work as before
- **Enhancers**: `.with()` chaining still works

```typescript
// All existing code continues to work
const tree = signalTree({ count: 0 });
tree(); // { count: 0 }
tree({ count: 5 });
tree.$.count(); // 5
tree.with(batching()); // Still works
```

## Files Added/Modified

### New Files

- `packages/core/src/lib/markers/derived.ts` - `derived()` marker function
- `packages/core/src/lib/markers/index.ts` - Barrel export
- `packages/core/src/lib/internals/derived-types.ts` - Type utilities
- `packages/core/src/lib/internals/builder-types.ts` - `SignalTreeBuilder` interface
- `packages/core/src/lib/internals/merge-derived.ts` - Runtime merge logic
- `packages/core/src/lib/internals/derived.spec.ts` - Test suite

### Modified Files

- `packages/core/src/lib/signal-tree.ts` - Builder pattern integration
- `packages/core/src/index.ts` - Public exports

## Future Enhancements

### Async Derived (Planned)

```typescript
// Support for async derived with loading states
const tree = signalTree({ userId: 1 }).derived(($) => ({
  user: derivedAsync(() => fetchUser($.userId())),
}));

tree.$.user.loading(); // true/false
tree.$.user.data(); // User | undefined
tree.$.user.error(); // Error | null
```

### Conditional Derived (Planned)

```typescript
// Derived that only computes when a condition is met
const tree = signalTree({ enabled: false, value: 0 }).derived(($) => ({
  expensive: derivedWhen(
    () => $.enabled(),
    () => expensiveComputation($.value())
  ),
}));
```

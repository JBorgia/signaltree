# SignalTree v7: Derived State Pattern

## Overview

SignalTree v7 introduces the `.derived()` method for declaring computed signals alongside source state. This enables type-safe, reactive derived state that automatically updates when dependencies change.

> **Note:** The `derived()` marker function is deprecated as of v6.3.1. Use Angular's `computed()` directly instead - it works identically and is the preferred approach.

## Core Concepts

### The Problem

Previously, computed state required manual setup outside the tree definition:

```typescript
// Old approach - manual computed setup
const tree = signalTree({ count: 0 });
const doubled = computed(() => tree.$.count() * 2); // Separate, disconnected
```

### The Solution

The `.derived()` method allows computed signals to be declared inline using Angular's `computed()`:

```typescript
import { computed } from '@angular/core';

// New approach - integrated derived state
const tree = signalTree({ count: 0 }).derived(($) => ({
  doubled: computed(() => $.count() * 2),
}));

tree.$.doubled(); // 0 - type-safe access
tree.$.count.set(5);
tree.$.doubled(); // 10 - automatically updates
```

## API Reference

### `computed<T>(factory: () => T): Signal<T>` (Recommended)

Use Angular's native `computed()` function directly. SignalTree automatically detects and integrates computed signals.

```typescript
import { computed } from '@angular/core';

.derived($ => ({
  doubled: computed(() => $.count() * 2)  // Recommended approach
}))
```

### ~~`derived<T>(factory: () => T): DerivedMarker<T>`~~ (Deprecated)

> **Deprecated in v6.3.1.** Use `computed()` directly instead.

The `derived()` marker was a wrapper that created a marker object later converted to `computed()`. Since `computed()` works directly, the marker is redundant.

```typescript
// Deprecated - will show warning in dev mode
derived(() => someSignal() * 2);

// Preferred - use computed() directly
computed(() => someSignal() * 2);
```

### `signalTree().derived(factory)`

Adds a layer of derived state to the tree. Can be chained multiple times.

```typescript
import { computed } from '@angular/core';

const tree = signalTree({ value: 1 })
  .derived(($) => ({
    doubled: computed(() => $.value() * 2),
  }))
  .derived(($) => ({
    quadrupled: computed(() => $.doubled() * 2), // Can reference previous derived
  }));
```

## Usage Patterns

### Basic Derived State

```typescript
import { computed } from '@angular/core';

interface AppState {
  items: string[];
  filter: string;
}

const tree = signalTree<AppState>({
  items: ['apple', 'banana', 'cherry'],
  filter: '',
}).derived(($) => ({
  filteredItems: computed(() => $.items().filter((item) => item.includes($.filter()))),
  itemCount: computed(() => $.items().length),
}));
```

### Nested Derived Definitions

```typescript
import { computed } from '@angular/core';

const tree = signalTree({ items: [1, 2, 3] }).derived(($) => ({
  stats: {
    count: computed(() => $.items().length),
    sum: computed(() => $.items().reduce((a, b) => a + b, 0)),
    average: computed(() => {
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
import { computed } from '@angular/core';

const tree = signalTree({ base: 10 })
  .derived(($) => ({
    doubled: computed(() => $.base() * 2),
  }))
  .derived(($) => ({
    quadrupled: computed(() => $.doubled() * 2),
    octupled: computed(() => $.quadrupled() * 2),
  }));

tree.$.base.set(5);
tree.$.octupled(); // 40
```

### With Enhancers

The `.derived()` method works seamlessly with enhancer chaining. You can add derived state before or after enhancers:

```typescript
import { computed } from '@angular/core';

const tree = signalTree({ count: 0 })
  .derived(($) => ({
    doubled: computed(() => $.count() * 2),
  }))
  .with(batching())
  .with(timeTravel())
  .derived(($) => ({
    // Can add more derived after enhancers too
    quadrupled: computed(() => $.doubled() * 2),
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
import { computed } from '@angular/core';

// Instead of chaining .derived()
const tree = signalTree({ count: 0 }, ($) => ({
  doubled: computed(() => $.count() * 2),
  tripled: computed(() => $.count() * 3),
}));

tree.$.doubled(); // 0
tree.$.count.set(5);
tree.$.doubled(); // 10
tree.$.tripled(); // 15
```

You can still chain additional `.derived()` calls after:

```typescript
import { computed } from '@angular/core';

const tree = signalTree({ base: 2 }, ($) => ({
  doubled: computed(() => $.base() * 2),
})).derived(($) => ({
  // $.doubled is available from second argument
  quadrupled: computed(() => $.doubled() * 2),
}));
```

### With EntityMap Integration

The `.derived()` method works perfectly with `entityMap()` for reactive entity queries:

```typescript
import { computed } from '@angular/core';
import { signalTree, entityMap, entities } from '@signaltree/core';

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
    selectedUser: computed(() => {
      const id = $.selectedUserId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),

    // Derived from entityMap queries
    activeUsers: computed(() => $.users.all().filter((u) => u.active)),
    adminCount: computed(() => $.users.all().filter((u) => u.role === 'admin').length),
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
import { computed } from '@angular/core';

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
    selectedUser: computed(() => {
      const id = $.selectedUserId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),
    selectedUserOrders: computed(() => {
      const userId = $.selectedUserId();
      if (userId == null) return [];
      return $.orders.all().filter((o) => o.userId === userId);
    }),
  }))
  .derived(($) => ({
    // Second layer depends on first
    selectedUserTotalSpent: computed(() => $.selectedUserOrders().reduce((sum, o) => sum + o.total, 0)),
  }));
```

### Mixed Derived and Regular Computed

> **Note:** The `derived()` marker is deprecated. Just use `computed()` directly everywhere.

Both work, but `computed()` is preferred:

```typescript
import { computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({ value: 10 }).derived(($) => ({
  // Both work, but computed() is preferred
  usingComputed: computed(() => $.value() + 1), // ✓ Recommended
  usingDerived: derived(() => $.value() + 2), // Works but deprecated
}));
```

## Deep Merge Behavior

**Available since v6.x**

One of the most powerful features of `.derived()` is its deep merge semantics. When you define a derived namespace at the same path as an existing source namespace, **all source properties are preserved** while your derived properties are added. This enables you to extend existing namespaces without losing access to entity methods, signals, or other properties.

### How Deep Merge Works

When merging derived state into the source tree:

1. **Computed signals** are placed at their target path
2. **Nested objects** in derived are recursively merged into existing namespaces
3. **Source properties** at the same path are **preserved**, not overwritten
4. **Only conflicting keys** trigger overwrites (with a warning in dev mode)

```typescript
import { computed } from '@angular/core';

// Source state with tickets namespace containing entityMap
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
  },
})
  .derived(($) => ({
    // Adding derived to tickets namespace - source properties are preserved
    tickets: {
      activeTicket: computed(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
      count: computed(() => $.tickets.entities.all().length),
    },
  }))
  .with(entities());

// After merge, $.tickets contains:
// - entities (from source - preserved with all EntitySignal methods)
// - activeId (from source - preserved)
// - activeTicket (from derived - computed signal)
// - count (from derived - computed signal)

tree.$.tickets.entities.upsertOne({ id: 1, name: 'Test' }); // ✓ Works!
tree.$.tickets.activeTicket(); // ✓ Works!
```

### Why Deep Merge Matters

Without deep merge, defining a `tickets` object in derived would **replace** the source `tickets` namespace entirely, losing access to methods like `entities.upsertOne()`, `entities.all()`, etc.

**❌ Without deep merge (hypothetical):**

```typescript
// If derived replaced instead of merged:
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
  },
}).derived(($) => ({
  tickets: {
    // This would REPLACE tickets, losing entities!
    isActive: computed(() => true),
  },
}));

tree.$.tickets.entities; // undefined - LOST!
```

**✅ With deep merge (actual behavior):**

```typescript
import { computed } from '@angular/core';

// Deep merge preserves all source properties
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
  },
}).derived(($) => ({
  tickets: {
    // This EXTENDS tickets, preserving entities
    isActive: computed(() => true),
  },
}));

tree.$.tickets.entities.all(); // ✓ Still works!
tree.$.tickets.isActive(); // ✓ Also works!
```

### EntityMap Integration with Deep Merge

This feature is especially important when working with `entityMap()` markers. EntityMaps provide methods like `all()`, `byId()`, `upsertOne()`, `removeById()`, etc. Deep merge ensures these are never lost:

```typescript
import { computed } from '@angular/core';

interface Ticket {
  id: number;
  title: string;
  status: 'open' | 'closed';
}

const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
    filter: {
      startDate: null as Date | null,
      endDate: null as Date | null,
      status: 'all' as 'all' | 'open' | 'closed',
    },
  },
})
  .derived(($) => ({
    tickets: {
      // All of these extend the tickets namespace
      active: computed(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
      filtered: computed(() => {
        const status = $.tickets.filter.status();
        const all = $.tickets.entities.all();
        if (status === 'all') return all;
        return all.filter((t) => t.status === status);
      }),
      hasActive: computed(() => $.tickets.activeId() != null),
    },
    // Can also add derived state at other paths
    ui: {
      ticketCount: computed(() => $.tickets.entities.all().length),
    },
  }))
  .with(entities());

// Full API available:
tree.$.tickets.entities.upsertOne({ id: 1, title: 'Bug', status: 'open' });
tree.$.tickets.entities.upsertMany([{ id: 2, title: 'Feature', status: 'closed' }]);
tree.$.tickets.activeId.set(1);
tree.$.tickets.active(); // { id: 1, title: 'Bug', status: 'open' }
tree.$.tickets.filtered(); // Filtered list based on status
tree.$.tickets.filter.status.set('open');
tree.$.ui.ticketCount(); // 2
```

### Multi-Level Deep Merge

Deep merge works at any depth in your tree:

```typescript
import { computed } from '@angular/core';

const tree = signalTree({
  app: {
    data: {
      users: entityMap<User, number>(),
      settings: {
        theme: 'light',
        locale: 'en',
      },
    },
  },
})
  .derived(($) => ({
    app: {
      data: {
        // Deep merge at 3 levels deep
        userCount: computed(() => $.app.data.users.all().length),
        settings: {
          // Deep merge at 4 levels deep - preserves theme and locale
          isDark: computed(() => $.app.data.settings.theme() === 'dark'),
        },
      },
    },
  }))
  .with(entities());

// All paths accessible:
$.app.data.users.all(); // EntitySignal method - preserved
$.app.data.settings.theme(); // Source signal - preserved
$.app.data.settings.locale(); // Source signal - preserved
$.app.data.userCount(); // Derived computed - added
$.app.data.settings.isDark(); // Derived computed - added
```

### Collision Warnings

When a derived key collides with an existing source key that contains a signal, SignalTree issues a development warning:

```typescript
import { computed } from '@angular/core';

const tree = signalTree({
  count: 0, // This is a signal
}).derived(($) => ({
  count: computed(() => $.count() * 2), // Overwrites source signal!
}));

// Console warning in dev mode:
// SignalTree: Derived "count" overwrites source signal.
// Consider using a different key to avoid confusion.
```

**Best practice:** Use distinct names for derived state to avoid confusion:

```typescript
import { computed } from '@angular/core';

const tree = signalTree({
  count: 0,
}).derived(($) => ({
  doubledCount: computed(() => $.count() * 2), // Clear, no collision
}));
```

### Technical Implementation

Deep merge is implemented through recursive traversal in `mergeDerivedState()`:

1. **For computed signals**: Assigns directly to target path
2. **For nested objects**: Ensures the path exists, then recursively merges
3. **For collisions**: Shows warning in dev mode

The key insight is that `ensurePathAndGetTarget()` navigates to existing objects rather than replacing them, and the recursive call to `mergeDerivedState()` adds properties to existing namespaces.

Additionally, the `entities()` enhancer properly recurses into **NodeAccessors** (the function-based wrappers around nested state). This ensures that entityMaps nested within NodeAccessors are properly materialized, not skipped.

```typescript
// In entities.ts - materialize() function
function materialize(node, ...args) {
  // ... processing logic ...
  for (const k of Object.keys(v)) {
    if (typeof v[k] === 'object' || isNodeAccessor(v[k])) {
      // ↑ isNodeAccessor check ensures we recurse into function-based nodes
      materialize(v[k], k, path);
    }
  }
}
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

### Removing Passthrough Workarounds

**Before v6.x**, if you needed to add derived state to a namespace that contained an entityMap, you may have added "passthrough" properties to re-expose the source signals:

**❌ Old workaround (no longer needed):**

```typescript
// BEFORE: Manual passthrough to preserve source properties
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
    startDate: null as Date | null,
    endDate: null as Date | null,
  },
})
  .derived(($) => ({
    tickets: {
      // Had to manually pass through every source property!
      entities: $.tickets.entities, // Passthrough
      activeId: $.tickets.activeId, // Passthrough
      startDate: $.tickets.startDate, // Passthrough
      endDate: $.tickets.endDate, // Passthrough

      // Actual derived state
      active: derived(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
    },
  }))
  .with(entities());
```

**✅ After v6.x (deep merge preserves automatically):**

```typescript
// AFTER: Just add your derived state - source is preserved
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
    startDate: null as Date | null,
    endDate: null as Date | null,
  },
})
  .derived(($) => ({
    tickets: {
      // Only derived state - source properties are preserved automatically!
      active: derived(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
    },
  }))
  .with(entities());

// All of these work without passthrough:
tree.$.tickets.entities.upsertOne({ id: 1 }); // ✓ Preserved
tree.$.tickets.activeId(); // ✓ Preserved
tree.$.tickets.startDate(); // ✓ Preserved
tree.$.tickets.endDate(); // ✓ Preserved
tree.$.tickets.active(); // ✓ Your derived signal
```

**Migration steps:**

1. **Identify passthrough properties** - Look for patterns like `propertyName: $.namespace.propertyName` in your derived definitions
2. **Remove the passthroughs** - Delete these lines; deep merge handles preservation automatically
3. **Test entity operations** - Verify `entities.upsertOne()`, `entities.all()`, etc. still work
4. **Verify signal access** - Ensure source signals like `activeId()` are still accessible

**Example diff:**

```diff
 .derived(($) => ({
   tickets: {
-    // Remove all passthrough properties
-    entities: $.tickets.entities,
-    activeId: $.tickets.activeId,
-    startDate: $.tickets.startDate,
-    endDate: $.tickets.endDate,
-
     // Keep only actual derived state
     active: derived(() => {
       const id = $.tickets.activeId();
       return id != null ? $.tickets.entities.byId(id)?.() : null;
     }),
+    hasDateRange: derived(() =>
+      $.tickets.startDate() != null && $.tickets.endDate() != null
+    ),
   },
 }))
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

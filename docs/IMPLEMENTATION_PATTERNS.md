<div align="center">
  <img src="../apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="80" height="80" style="background: transparent;" />
</div>

# SignalTree-First Implementation Patterns

This document defines the **canonical patterns** for implementing SignalTree stores. Follow these guidelines for consistent, maintainable, and idiomatic SignalTree code.

## Core Philosophy

SignalTree-first means:

1. **Direct signal access** — Expose signals from the `$` tree directly, don't wrap them
2. **TypeScript for contracts** — Use interfaces to declare read-only semantics
3. **Standard Angular** — Use `computed()` only for derived state, not for wrapping existing signals
4. **Trust developers** — Mutation methods exist for complex operations, not to gatekeep all state changes

## The Pattern

### ✅ SignalTree-First (Correct)

```typescript
export function createUserTree(): UserTree {
  const tree = signalTree<UserTreeState>(initialState)
    .with(withEntities()) // Auto-detects entityMap markers
    .with(withDevTools({ treeName: 'UserTree' }));

  const $ = tree.$; // Shorthand for state access

  // Derived state - actual computations
  const selectedUser = computed(() => {
    const id = $.selected.userId();
    return id ? $.users.byId(id)() ?? null : null;
  });

  const isLoaded = computed(() => $.loading.state() === LoadingState.Loaded);

  return {
    // Entity collections - direct from SignalTree
    users: $.users,

    // State signals - direct from $ tree (no wrappers!)
    selectedUserId: $.selected.userId,
    loadingState: $.loading.state,
    error: $.loading.error,

    // Computed selectors - actual derived state
    selectedUser,
    isLoaded,

    // Mutation methods - for complex state changes
    setSelectedUser,
    clearUsers,
  };
}
```

### ❌ Angular-First Anti-Pattern (Avoid)

```typescript
// DON'T DO THIS - unnecessary computed() wrappers
return {
  selectedUserId: computed(() => $.selected.userId()), // ❌ Adds indirection
  loadingState: computed(() => $.loading.state()), // ❌ Fights the library
  error: computed(() => $.loading.error()), // ❌ Extra signal creation
};
```

## TypeScript Type Pattern (SignalTree-First)

Use `ReturnType` inference instead of manual interface definitions:

```typescript
// user-tree.types.ts
import type { createUserTree } from './user.tree';

// Let SignalTree infer the type - no manual interface needed!
export type UserTree = ReturnType<typeof createUserTree>;

// Only define state shape types (needed for signalTree<T> generic)
export interface UserTreeState {
  users: EntityMapMarker<UserDto, number>;
  selected: { userId: number | null };
  loading: { state: LoadingState; error: string | null };
}
```

```typescript
// user.tree.ts
export function createUserTree() {
  // No explicit return type needed!
  const tree = signalTree<UserTreeState>(initialState)
    .with(withEntities())
    .with(withDevTools({ treeName: 'UserTree' }));

  const $ = tree.$;

  // Derived state - actual computations
  const selectedUser = computed(() => {
    const id = $.selected.userId();
    return id ? $.users.byId(id)() ?? null : null;
  });

  return {
    // SignalTree infers all types automatically
    users: $.users,
    selectedUserId: $.selected.userId,
    loadingState: $.loading.state,
    selectedUser,
    // ...
  };
}
```

**Why this is SignalTree-first:**

- Trust SignalTree's type inference instead of duplicating types
- Less boilerplate, fewer places to update when API changes
- Type always matches implementation (can't get out of sync)
- Still get full IDE autocomplete and type checking

### Alternative: Explicit Interface (When Needed)

If you need to enforce a read-only contract or document the API explicitly:

```typescript
export interface UserTree {
  readonly users: EntitySignal<UserDto, number>;
  readonly selectedUserId: Signal<number | null>;
  setSelectedUser(id: number | null): void;
}
```

But prefer `ReturnType` inference for simplicity.

- This is the same pattern Angular Material and other libraries use

## When to Use `computed()`

Use `computed()` **only** for derived state:

```typescript
// ✅ Correct: Derived from multiple signals
const selectedUser = computed(() => {
  const id = $.selected.userId();
  return id ? $.users.byId(id)() : null;
});

// ✅ Correct: Transformation of state
const isLoaded = computed(() => $.loading.state() === LoadingState.Loaded);

// ✅ Correct: Filtering/mapping collections
const activeUsers = computed(() => {
  return $.users.all.filter((u) => u.isActive);
});

// ✅ Correct: Combining multiple pieces of state
const canSubmit = computed(() => {
  return $.form.isValid() && !$.loading.inProgress() && $.user.hasPermission();
});

// ❌ Wrong: Wrapping a signal that already exists
const selectedUserId = computed(() => $.selected.userId()); // Unnecessary!
```

## Entity Access Patterns

Use SignalTree's `EntitySignal` API directly:

```typescript
// Reading entities
const allUsers = $.users.all; // Get all entities as array
const user = $.users.byId(123)(); // O(1) lookup by ID
const userIds = $.users.ids(); // Get all IDs

// Writing entities
$.users.setAll(usersFromApi); // Replace all entities
$.users.upsert(updatedUser); // Insert or update single entity
$.users.upsertMany(users); // Insert or update multiple
$.users.remove(123); // Remove by ID
$.users.removeMany([1, 2, 3]); // Remove multiple by IDs
$.users.clear(); // Remove all entities

// Conditional updates
$.users.update(123, (user) => ({
  ...user,
  lastLogin: new Date(),
}));
```

### Avoid NgRx-Style Patterns

```typescript
// ❌ NgRx-style (avoid in SignalTree)
const user = entityMap()[123]; // Requires intermediate Record object

// ✅ SignalTree-native
const user = $.users.byId(123)(); // Direct O(1) lookup
```

## Side Effects Pattern

Use Angular's `effect()` for side effects, keeping them explicit and visible:

```typescript
export function createUserTree(): UserTree {
  const tree = signalTree<UserTreeState>(initialState);
  const $ = tree.$; // Shorthand for state access

  // Persist selection to localStorage
  effect(() => {
    const userId = $.selected.userId();
    if (userId !== null) {
      localStorage.setItem('selectedUserId', String(userId));
    }
  });

  // Show error banner when loading fails
  effect(() => {
    const error = $.loading.error();
    if (error) {
      notificationService.showError({
        message: error.message,
        id: 'user-tree-error',
      });
    }
  });

  // Sync with external service
  effect(() => {
    const user = selectedUser();
    if (user) {
      analyticsService.trackUserSelection(user.id);
    }
  });

  return {
    /* ... */
  };
}
```

## Async Operations Pattern

Return `Observable<void>` from load methods — consumers read results from signals:

```typescript
loadAll$(filter?: UserFilter): Observable<void> {
  // Guard against duplicate requests
  if ($.loading.state() === LoadingState.Loading) {
    return EMPTY;
  }

  // Set loading state
  $.loading.state.set(LoadingState.Loading);
  $.loading.error.set(null);

  return userService.getAll(filter).pipe(
    tap(users => {
      $.users.setAll(users);
      $.loading.state.set(LoadingState.Loaded);
    }),
    map(() => void 0),  // Return void, not data
    catchError(error => {
      $.loading.error.set(captureError(error));
      $.loading.state.set(LoadingState.Error);
      return EMPTY;
    })
  );
}
```

**Why `Observable<void>`?**

- Consumers already have reactive access via signals
- Returning data encourages imperative patterns
- `void` makes the contract clear: "subscribe to trigger, read from signals"

## Dependency Injection Pattern

Use an `InjectionToken` with a factory provider:

```typescript
// user-tree.service.ts
import { InjectionToken } from '@angular/core';
import { UserTree } from './user-tree.types';
import { createUserTree } from './user.tree';

export const USER_TREE = new InjectionToken<UserTree>('UserTree');

export function provideUserTree() {
  return {
    provide: USER_TREE,
    useFactory: createUserTree,
  };
}
```

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideUserTree(),
    // ...
  ],
};
```

```typescript
// component.ts
@Component({
  /* ... */
})
export class UserListComponent {
  private readonly userTree = inject(USER_TREE);

  readonly users = computed(() => this.userTree.users.all);
  readonly isLoaded = this.userTree.isLoaded;
}
```

## File Organization

```
store/
├── user.tree.ts           # Factory function (createUserTree)
├── user-tree.types.ts     # TypeScript interfaces
├── user-tree.service.ts   # InjectionToken and provider
└── user-tree.spec.ts      # Tests
```

## Migration Checklist

When creating a new store or migrating from NgRx:

- [ ] State signals exposed directly from `$` tree (no `computed()` wrappers)
- [ ] Interface declares `Signal<T>` for read-only contract
- [ ] `computed()` used only for derived/transformed state
- [ ] Entity access via `EntitySignal` API (`.all`, `.byId()`, etc.)
- [ ] Side effects in explicit `effect()` blocks
- [ ] Mutation methods for complex multi-signal updates
- [ ] Async methods return `Observable<void>`
- [ ] `InjectionToken` with factory provider pattern
- [ ] Loading guard to prevent duplicate requests

## Complete Example

See the TruckTree implementation for a production example:

```typescript
// truck.tree.ts - Full SignalTree-first implementation
export function createTruckTree(): TruckTree {
  const tree = signalTree<TruckTreeState>({
    trucks: entityMap<TruckDto, number>(),
    haulers: entityMap<HaulerDto, number>(),
    selected: { haulerId: null, truckId: null },
    loading: { state: LoadingState.NotLoaded, error: null },
    filter: null,
  })
    .with(withEntities()) // Auto-detects entityMap markers
    .with(withDevTools({ treeName: 'TruckTree' }));

  const $ = tree.$; // Shorthand for state access

  // Computed selectors (actual derived state)
  const selectedTruck = computed(() => {
    const id = $.selected.truckId();
    const signal = $.trucks.byId(id);
    return signal ? signal() ?? null : null;
  });

  const selectedHauler = computed(() => {
    const id = $.selected.haulerId();
    const signal = $.haulers.byId(id);
    return signal ? signal() ?? null : null;
  });

  const isLoaded = computed(() => $.loading.state() === LoadingState.Loaded);

  // Effects for side effects
  effect(() => {
    storage.setValue('selectedTruckId', $.selected.truckId());
  });

  return {
    // Entity collections (SignalTree EntitySignal)
    trucks: $.trucks,
    haulers: $.haulers,

    // State signals (direct exposure - SignalTree-first)
    selectedTruckId: $.selected.truckId,
    selectedHaulerId: $.selected.haulerId,
    loadingState: $.loading.state,
    error: $.loading.error,

    // Computed selectors (derived state)
    selectedTruck,
    selectedHauler,
    isLoaded,

    // Mutation methods
    setSelectedTruck: (id) => $.selected.truckId.set(id),
    setSelectedHauler: (id) => $.selected.haulerId.set(id),

    // Async operations
    loadAll$,
    refresh,
  };
}
```

---

_Last updated: December 2025_

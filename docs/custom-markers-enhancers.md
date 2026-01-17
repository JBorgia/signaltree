# Custom Markers & Enhancers in SignalTree

SignalTree is designed for extensibility. You can create your own **markers** (state placeholders that materialize into specialized signals) and **enhancers** (functions that augment trees with additional capabilities).

## Table of Contents

- [Overview](#overview)
- [Two Patterns for Custom Signals](#two-patterns-for-custom-signals)
- [Built-in Markers](#built-in-markers)
- [Built-in Enhancers](#built-in-enhancers)
- [Creating Custom Markers](#creating-custom-markers)
- [Creating Custom Enhancers](#creating-custom-enhancers)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices Checklist](#best-practices-checklist)

---

## Overview

### What are Markers?

**Markers** are placeholder objects in your initial state definition that get **materialized** into specialized signal types during tree finalization.

```typescript
// Marker in state definition (placeholder)
const tree = signalTree({
  users: entityMap<User>(), // EntityMapMarker → EntitySignal
  loadingStatus: status(), // StatusMarker → StatusSignal
  theme: stored('app-theme', 'light'), // StoredMarker → StoredSignal
});

// After finalization, you get rich APIs:
tree.$.users.set({ id: 1, name: 'Alice' });
tree.$.loadingStatus.setLoading();
tree.$.theme.set('dark'); // Auto-saves to localStorage
```

### What are Enhancers?

**Enhancers** are functions that augment your tree with additional methods, signals, or behavior. They're applied via `.with()`:

```typescript
const tree = signalTree({ count: 0 })
  .with(devTools({ treeName: 'MyApp' }))
  .with(batching())
  .with(effects());

// Now tree has devtools, batching, and effects capabilities
tree.batch(() => {
  /* batched updates */
});
tree.effect((state) => console.log(state));
```

---

## Two Patterns for Custom Signals

SignalTree supports two patterns for creating custom signal types. Choose based on your needs:

### Pattern 1: Standalone Signal Factories (Recommended for Most Cases)

Create factory functions that return rich signal objects. Use these alongside your SignalTree.

```typescript
// counter.ts
import { signal } from '@angular/core';

export interface CounterSignal {
  (): number;
  increment(): void;
  decrement(): void;
  reset(): void;
}

export function createCounter(initial = 0, step = 1): CounterSignal {
  const value = signal(initial);

  const counter = (() => value()) as CounterSignal;
  counter.increment = () => value.update((v) => v + step);
  counter.decrement = () => value.update((v) => v - step);
  counter.reset = () => value.set(initial);

  return counter;
}

// Usage
const likes = createCounter(0);
likes.increment();
console.log(likes()); // 1
```

**Advantages:**

- Simple and self-contained
- No registration required
- Works immediately
- Easy to test

**Best for:** UI-specific state, component-local counters, selections, toggles

### Pattern 2: Markers in Tree State (For Shared/Persistent State)

Register marker processors to embed custom signals directly in SignalTree state.

```typescript
// selection-marker.ts
import { signal, computed } from '@angular/core';
import { registerMarkerProcessor } from '@signaltree/core';

const SELECTION_MARKER = Symbol('SELECTION_MARKER');
let selectionRegistered = false;  // ← Track registration

export interface SelectionMarker<T> { [SELECTION_MARKER]: true; }

export function selection<T>(): SelectionMarker<T> {
  // Self-register on first use (tree-shakeable!)
  if (!selectionRegistered) {
    selectionRegistered = true;
    registerMarkerProcessor(isSelectionMarker, () => createSelectionSignal());
  }
  return { [SELECTION_MARKER]: true };
}

export function isSelectionMarker(v: unknown): v is SelectionMarker<unknown> {
  return Boolean(v && typeof v === 'object' && SELECTION_MARKER in v);
}

// Usage - no manual registration needed!
const tree = signalTree({
  tasks: [...],
  selectedIds: selection<number>(),  // ← Self-registers & materializes
});

tree.$.selectedIds.toggle(1);
tree.$.selectedIds.count(); // Reactive!
```

**Advantages:**

- State lives in SignalTree (persists with tree)
- DevTools integration
- Undo/redo via enhancers
- Tree serialization includes markers
- **100% tree-shakeable** (unused markers are eliminated from bundle)

**Best for:** Domain entities, shared selections, validated fields

### Registration Timing & Self-Registration (v7.0.1+)

**Built-in markers (`entityMap`, `status`, `stored`) are self-registering as of v7.0.1:**

```typescript
// ✅ Built-in markers now "just work" - no manual registration needed
import { signalTree, entityMap, status, stored } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(), // Auto-registers on first use
  loading: status(), // Auto-registers on first use
  theme: stored('theme', 'dark'), // Auto-registers on first use
});
```

**For custom markers, `registerMarkerProcessor()` MUST be called BEFORE `signalTree()`:**

```typescript
// ✅ CORRECT - Register custom marker first
registerMarkerProcessor(isMyMarker, createMySignal);
const tree = signalTree({ field: myMarker() }); // Works!

// ❌ WRONG - Register after tree creation
const tree = signalTree({ field: myMarker() }); // Too late!
registerMarkerProcessor(isMyMarker, createMySignal); // Never processes
```

**Self-Registering Pattern for Custom Markers (Recommended):**

For optimal tree-shaking, implement self-registration in your marker factory:

```typescript
// my-marker.ts
import { registerMarkerProcessor } from '@signaltree/core';

const MY_MARKER = Symbol('MY_MARKER');
let registered = false;

export function myMarker<T>(): MyMarker<T> {
  // Self-register on first use
  if (!registered) {
    registered = true;
    registerMarkerProcessor(isMyMarker, createMySignal);
  }
  return { [MY_MARKER]: true };
}
```

This pattern ensures:

- Zero import-time side effects (100% tree-shakeable)
- No manual registration required by consumers
- Duplicate registrations are prevented automatically

**Where to register custom markers (if not self-registering):**

- `main.ts` (before `bootstrapApplication`)
- App initializer (Angular `APP_INITIALIZER`)
- Top of a barrel file that's imported early

**Dev-mode warning:** SignalTree emits a console warning if it detects objects with Symbol keys that don't match any registered processor. This helps catch registration timing mistakes.

---

## Built-in Markers

| Marker                    | Purpose                      | Materialized Type    |
| ------------------------- | ---------------------------- | -------------------- |
| `entityMap<E, K>()`       | Entity collections with CRUD | `EntitySignal<E, K>` |
| `status<E>()`             | Async loading state          | `StatusSignal<E>`    |
| `stored<T>(key, default)` | localStorage persistence     | `StoredSignal<T>`    |

### entityMap()

```typescript
import { entityMap, signalTree } from '@signaltree/core';

interface User {
  id: number;
  name: string;
}

const tree = signalTree({
  users: entityMap<User, number>(),
});

// Materialized API:
tree.$.users.set({ id: 1, name: 'Alice' });
tree.$.users.byId(1)?.name(); // 'Alice'
tree.$.users.all(); // [{ id: 1, name: 'Alice' }]
tree.$.users.delete(1);
```

### status()

```typescript
import { status, LoadingState, signalTree } from '@signaltree/core';

const tree = signalTree({
  fetchStatus: status(),
});

// Materialized API:
tree.$.fetchStatus.setLoading();
tree.$.fetchStatus.isLoading(); // true
tree.$.fetchStatus.setLoaded();
tree.$.fetchStatus.setError(new Error('Failed'));
tree.$.fetchStatus.error(); // Error object
```

### stored()

```typescript
import { stored, signalTree } from '@signaltree/core';

const tree = signalTree({
  theme: stored('app-theme', 'light'),
  lastViewedId: stored('lastViewed', null as number | null),
});

// Materialized API:
tree.$.theme.set('dark'); // Auto-saves to localStorage
tree.$.theme(); // 'dark'
tree.$.theme.clear(); // Removes from localStorage, resets to default
tree.$.theme.reload(); // Re-reads from localStorage
```

---

## Built-in Enhancers

| Enhancer          | Purpose                    | Added Methods                                   |
| ----------------- | -------------------------- | ----------------------------------------------- |
| `devTools()`      | Redux DevTools integration | `connectDevTools()`, `disconnectDevTools()`     |
| `batching()`      | Batch CD notifications     | `batch()`, `coalesce()`, `flushNotifications()` |
| `effects()`       | Reactive effects           | `effect()`, `subscribe()`                       |
| `memoization()`   | Cached computations        | `memoize()` helpers                             |
| `serialization()` | JSON export/import         | `toJSON()`, `fromJSON()`                        |
| `timeTravel()`    | Undo/redo history          | `undo()`, `redo()`, `history`                   |

---

## Creating Custom Markers

> **Important:** If you just need a rich signal for component-local state, consider the simpler [Standalone Signal Factories](#pattern-1-standalone-signal-factories-recommended-for-most-cases) pattern. Use markers when you need the signal to live inside SignalTree state.

### Step-by-Step Guide

#### 1. Define a unique symbol and marker interface

```typescript
// my-marker.ts
const MY_MARKER = Symbol('MY_MARKER');

export interface MyMarker<T> {
  [MY_MARKER]: true;
  config: T;
}
```

#### 2. Create the marker factory function

```typescript
export function myMarker<T>(config: T): MyMarker<T> {
  return {
    [MY_MARKER]: true,
    config,
  };
}
```

#### 3. Create the type guard

```typescript
export function isMyMarker(value: unknown): value is MyMarker<unknown> {
  return Boolean(value && typeof value === 'object' && MY_MARKER in value && (value as Record<symbol, unknown>)[MY_MARKER] === true);
}
```

#### 4. Define the materialized interface

```typescript
import { Signal, WritableSignal } from '@angular/core';

export interface MySignal<T> {
  (): T; // Get current value
  value: WritableSignal<T>; // Direct signal access
  set(value: T): void; // Set value
  update(fn: (current: T) => T): void; // Update with function
  reset(): void; // Reset to default
  // ... any custom methods
}
```

#### 5. Create the materializer

```typescript
import { signal } from '@angular/core';

export function createMySignal<T>(marker: MyMarker<T>): MySignal<T> {
  const valueSignal = signal<T>(marker.config);

  const mySignal = (() => valueSignal()) as MySignal<T>;

  Object.defineProperty(mySignal, 'value', { value: valueSignal });

  mySignal.set = (value: T) => valueSignal.set(value);
  mySignal.update = (fn) => valueSignal.update(fn);
  mySignal.reset = () => valueSignal.set(marker.config);

  return mySignal;
}
```

#### 6. Register the processor

> ⚠️ **Registration must happen BEFORE any `signalTree()` call that uses this marker!**

```typescript
import { registerMarkerProcessor } from '@signaltree/core';

// Call once at app startup (e.g., in main.ts BEFORE bootstrapApplication)
registerMarkerProcessor(isMyMarker, (marker) => createMySignal(marker));
```

**Best registration locations:**

- `main.ts` before `bootstrapApplication()`
- An `APP_INITIALIZER` provider
- Top of a barrel file that's imported at app startup

```typescript
// main.ts example
import './markers/register-all-markers'; // ← Registers all custom markers
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig);
```

#### 7. Use it!

```typescript
const tree = signalTree({
  myField: myMarker({ defaultValue: 'hello' }),
});

tree.$.myField(); // 'hello'
tree.$.myField.set('world');
tree.$.myField.reset(); // Back to 'hello'
```

### Complete Example: validated() Marker

```typescript
// validated-marker.ts
import { signal, Signal, WritableSignal } from '@angular/core';
import { registerMarkerProcessor } from '@signaltree/core';

// Symbol
const VALIDATED_MARKER = Symbol('VALIDATED_MARKER');

// Marker interface
export interface ValidatedMarker<T> {
  [VALIDATED_MARKER]: true;
  defaultValue: T;
  validator: (value: T) => string | null;
}

// Materialized interface
export interface ValidatedSignal<T> {
  (): T;
  value: WritableSignal<T>;
  error: Signal<string | null>;
  isValid: Signal<boolean>;
  set(value: T): void;
  reset(): void;
}

// Factory
export function validated<T>(defaultValue: T, validator: (value: T) => string | null): ValidatedMarker<T> {
  return { [VALIDATED_MARKER]: true, defaultValue, validator };
}

// Type guard
export function isValidatedMarker(value: unknown): value is ValidatedMarker<unknown> {
  return Boolean(value && typeof value === 'object' && VALIDATED_MARKER in value && (value as any)[VALIDATED_MARKER] === true);
}

// Materializer
export function createValidatedSignal<T>(marker: ValidatedMarker<T>): ValidatedSignal<T> {
  const valueSignal = signal<T>(marker.defaultValue);
  const errorSignal = signal<string | null>(marker.validator(marker.defaultValue));
  const isValidSignal = signal(errorSignal() === null);

  const validatedSignal = (() => valueSignal()) as ValidatedSignal<T>;

  Object.defineProperty(validatedSignal, 'value', { value: valueSignal });
  Object.defineProperty(validatedSignal, 'error', { get: () => errorSignal.asReadonly() });
  Object.defineProperty(validatedSignal, 'isValid', { get: () => isValidSignal.asReadonly() });

  validatedSignal.set = (value: T) => {
    valueSignal.set(value);
    const error = marker.validator(value);
    errorSignal.set(error);
    isValidSignal.set(error === null);
  };

  validatedSignal.reset = () => validatedSignal.set(marker.defaultValue);

  return validatedSignal;
}

// Register (call at app startup)
registerMarkerProcessor(isValidatedMarker, createValidatedSignal);
```

**Usage:**

```typescript
const tree = signalTree({
  email: validated('', (v) => (v.includes('@') ? null : 'Invalid email')),
});

tree.$.email.set('test');
tree.$.email.error(); // 'Invalid email'
tree.$.email.isValid(); // false

tree.$.email.set('test@example.com');
tree.$.email.error(); // null
tree.$.email.isValid(); // true
```

---

## Creating Custom Enhancers

### ⚠️ CRITICAL: Proper Type Signature for Enhancers

When creating custom enhancers, **always use a generic function signature** to preserve the tree's state type. This is the most common mistake when building enhancers.

#### ❌ WRONG - Using the `Enhancer<TAdded>` type alias directly

```typescript
import type { Enhancer } from '@signaltree/core';

// DON'T DO THIS - loses tree state type information!
export function myEnhancer(): Enhancer<{ myMethod: () => void }> {
  return (tree) => {
    // tree is ISignalTree<any> - state type is LOST!
    return Object.assign(tree, { myMethod: () => {} });
  };
}
```

The `Enhancer<TAdded>` type is defined as `(tree: ISignalTree<any>) => ISignalTree<any> & TAdded`. This uses `any` to allow enhancers to work on trees with accumulated methods from previous enhancers, but it loses the state type `T`.

#### ✅ CORRECT - Generic function that preserves type T

```typescript
import type { ISignalTree } from '@signaltree/core';

// DO THIS - preserves tree state type!
export function myEnhancer(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & { myMethod: () => void } {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & { myMethod: () => void } => {
    // tree is ISignalTree<T> - state type is preserved!
    return Object.assign(tree, { myMethod: () => {} });
  };
}
```

#### Reference: How Core Enhancers Do It

All built-in enhancers follow this pattern:

```typescript
// batching.ts
export function batching(
  config: BatchingConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T> {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & BatchingMethods<T> => {
    // Implementation...
  };
}

// devTools.ts
export function devTools(
  config: DevToolsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & DevToolsMethods => {
    // Implementation...
  };
}

// memoization.ts
export function memoization(
  config: MemoizationConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T> {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & MemoizationMethods<T> => {
    // Implementation...
  };
}
```

#### Why This Matters

When you use the wrong pattern, TypeScript will complain when chaining `.with()`:

```typescript
// With WRONG pattern - TypeScript error!
const tree = signalTree({ count: 0 })
  .with(batching())
  .with(myBrokenEnhancer()); // ❌ Error: types are incompatible

// With CORRECT pattern - works perfectly!
const tree = signalTree({ count: 0 })
  .with(batching())
  .with(myCorrectEnhancer()); // ✅ No errors, full type safety
```

---

### Step-by-Step Guide

#### 1. Define the interface for added methods

```typescript
import { Signal } from '@angular/core';

export interface WithLogger {
  log(message: string): void;
  history: Signal<string[]>;
  clearLogs(): void;
}
```

#### 2. Create the enhancer factory

```typescript
import { signal } from '@angular/core';
import type { ISignalTree } from '@signaltree/core';

export function withLogger(config?: { maxHistory?: number }) {
  const maxHistory = config?.maxHistory ?? 100;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & WithLogger => {
    const historySignal = signal<string[]>([]);

    const log = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      historySignal.update((h) => [...h, `[${timestamp}] ${message}`].slice(-maxHistory));
    };

    const clearLogs = () => historySignal.set([]);

    return Object.assign(tree, {
      log,
      history: historySignal.asReadonly(),
      clearLogs,
    });
  };
}
```

#### 3. Use it!

```typescript
const tree = signalTree({ count: 0 }).with(withLogger({ maxHistory: 50 }));

tree.log('Tree created');
tree.$.count.set(5);
tree.log('Count updated to 5');

tree.history(); // ['[12:00:00] Tree created', '[12:00:01] Count updated to 5']
tree.clearLogs();
```

### Advanced Enhancer with Metadata

For enhancers that need dependency ordering, use `createEnhancer()`:

```typescript
import { createEnhancer } from '@signaltree/core/enhancers';

export const withAudit = /*@__PURE__*/ createEnhancer(
  {
    name: 'withAudit',
    provides: ['audit'],
    requires: ['logger'], // Requires withLogger to be applied first
  },
  (config?: { auditLevel?: 'basic' | 'detailed' }) => {
    return <T>(tree: ISignalTree<T> & WithLogger): ISignalTree<T> & WithLogger & WithAudit => {
      // Can use tree.log() because logger is required
      tree.log('Audit enhancer attached');

      return Object.assign(tree, {
        audit: (action: string) => {
          tree.log(`[AUDIT] ${action}`);
        },
      });
    };
  }
);
```

### Enhancer that Wraps Tree Function

For enhancers that intercept tree calls (like devTools or batching):

```typescript
import { copyTreeProperties } from '@signaltree/core/enhancers/utils/copy-tree-properties';

export function withTiming<T>() {
  return (tree: ISignalTree<T>): ISignalTree<T> & { lastUpdateTime: Signal<number> } => {
    const lastUpdateTime = signal(0);
    const originalCall = tree.bind(tree);

    // Create wrapped tree function
    const wrappedTree = function (...args: unknown[]) {
      if (args.length === 0) {
        return originalCall();
      }
      const start = performance.now();
      const result = originalCall(...args);
      lastUpdateTime.set(performance.now() - start);
      return result;
    } as ISignalTree<T>;

    // Copy prototype and properties
    Object.setPrototypeOf(wrappedTree, Object.getPrototypeOf(tree));
    copyTreeProperties(tree, wrappedTree);

    // Preserve .with() chaining
    Object.defineProperty(wrappedTree, 'with', {
      value: <R>(enhancer: (t: ISignalTree<T>) => R) => enhancer(wrappedTree),
    });

    return Object.assign(wrappedTree, { lastUpdateTime: lastUpdateTime.asReadonly() });
  };
}
```

---

## Advanced Patterns

### Combining Markers and Enhancers

Markers and enhancers work independently but compose well:

```typescript
const tree = signalTree({
  // Markers in state
  users: entityMap<User>(),
  loadStatus: status(),
  settings: stored('app-settings', { theme: 'light' }),

  // Regular signals
  counter: 0,
})
  // Enhancers via .with()
  .with(devTools())
  .with(batching())
  .with(withLogger());
```

### Type-Safe State Interface

For full type safety with custom markers, define your state interface:

```typescript
import type { ValidatedMarker, ValidatedSignal } from './validated-marker';

// State definition type (uses markers)
interface MyState {
  email: ValidatedMarker<string>;
  age: ValidatedMarker<number>;
}

// Materialized state type (uses signals)
interface MyMaterializedState {
  email: ValidatedSignal<string>;
  age: ValidatedSignal<number>;
}

// Usage
const tree = signalTree<MyState>({
  /* ... */
});

// Access with proper types
const email = tree.$.email as unknown as ValidatedSignal<string>;
email.isValid(); // TypeScript knows this exists
```

### SSR Considerations

For markers that use browser APIs (localStorage, etc.):

```typescript
export function createStoredSignal<T>(marker: StoredMarker<T>): StoredSignal<T> {
  // Handle SSR - no localStorage on server
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  // Rest of implementation uses `storage` (may be null)
}
```

---

## Best Practices Checklist

### Markers

- [ ] Use `Symbol()` for unique marker identification
- [ ] Keep type guards simple and fast (no deep inspection)
- [ ] Register processors once at app startup
- [ ] Handle errors gracefully in materializers
- [ ] Provide `reset()` methods for restoring defaults
- [ ] Consider SSR - avoid browser APIs at module import time
- [ ] Add dev-mode warnings for configuration errors
- [ ] Write unit tests for materialization and edge cases

### Enhancers

- [ ] **Use generic `<T>` function signature** - NEVER use `Enhancer<TAdded>` type directly (see "CRITICAL" section above)
- [ ] Return `ISignalTree<T> & YourMethods` for TypeScript inference
- [ ] Use `Object.assign()` to preserve tree identity
- [ ] Implement cleanup in `destroy()` if using subscriptions/timers
- [ ] Add `/*@__PURE__*/` annotation for tree-shaking
- [ ] Use `createEnhancer()` for dependency metadata
- [ ] Preserve `.with()` chaining if wrapping tree function
- [ ] Use `copyTreeProperties()` when creating wrapper functions
- [ ] Write unit tests for added functionality

### General

- [ ] Document public API with JSDoc
- [ ] Provide usage examples in documentation
- [ ] Follow existing patterns in `packages/core/src/lib/markers/` and `packages/core/src/enhancers/`
- [ ] Test with tree-shaking analysis to ensure unused code is eliminated

---

## Reference Implementations

For complete examples, see:

- **Markers:**

  - `packages/core/src/lib/markers/status.ts`
  - `packages/core/src/lib/markers/stored.ts`
  - `packages/core/src/lib/types.ts` (`entityMap()`)

- **Enhancers:**

  - `packages/core/src/enhancers/devtools/devtools.ts`
  - `packages/core/src/enhancers/batching/batching.ts`
  - `packages/core/src/enhancers/effects/effects.ts`

- **Marker Processing:**
  - `packages/core/src/lib/internals/materialize-markers.ts`

---

## Questions?

- [GitHub Issues](https://github.com/JBorgia/signaltree/issues)
- [Demo App](/custom-extensions) - Interactive examples

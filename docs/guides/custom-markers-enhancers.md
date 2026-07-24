# Custom Markers & Enhancers in SignalTree

SignalTree is designed for extensibility. You can create your own **markers** (state placeholders that materialize into specialized signals) and **enhancers** (functions that augment trees with additional capabilities).

## Table of Contents

- [Overview](#overview)
- [Two Patterns for Custom Signals](#two-patterns-for-custom-signals)
- [Built-in Markers](#built-in-markers)
- [Built-in Enhancers](#built-in-enhancers)
- [Authoring Markers: The Five Landmines](#authoring-markers-the-five-landmines)
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
tree.$.users.addOne({ id: 1, name: 'Alice' });
tree.$.loadingStatus.setLoading();
tree.$.theme.set('dark'); // Auto-saves to localStorage
```

### What are Enhancers?

**Enhancers** are functions that augment your tree with additional methods, signals, or behavior. They're applied via `.with()`:

```typescript
import { effect } from '@angular/core';

const tree = signalTree({ count: 0 })
  .with(devTools({ treeName: 'MyApp' }))
  .with(batching());

// Now the tree has devtools + batching capabilities
tree.batch(() => {
  /* batched updates */
});

// Reactivity uses Angular's native effect(). A SignalTree is made of ordinary
// signals, so there is no effects() enhancer — it was removed in v12 (use
// effect(() => tree.$.path()) for correct injection-context handling).
effect(() => console.log(tree.$.count()));
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
import { registerMarkerProcessor } from '@signaltree/core/authoring';

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
import { registerMarkerProcessor } from '@signaltree/core/authoring';

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

| Marker                           | Purpose                                       | Materialized Type              |
| -------------------------------- | ---------------------------------------------- | ------------------------------- |
| `entityMap<E, K>()`              | Entity collections with CRUD; pass `load` in config for cache-aware (single-scope) self-loading (RFC 0002/0003) | `EntitySignal<E, K>`            |
| `status<E>()`                    | Async loading state                           | `StatusSignal<E>`               |
| `stored<T>(key, default)`        | localStorage persistence                      | `StoredSignal<T>`               |

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
tree.$.users.addOne({ id: 1, name: 'Alice' });
tree.$.users.byId(1)?.name(); // 'Alice'
tree.$.users.all(); // [{ id: 1, name: 'Alice' }]
tree.$.users.removeOne(1);
```

### status()

```typescript
import { status, LoadingState, signalTree } from '@signaltree/core';

const tree = signalTree({
  fetchStatus: status(),
});

// Materialized API:
tree.$.fetchStatus.setLoading();
tree.$.fetchStatus.loading(); // true
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
| `serialization()` | JSON export/import         | `toJSON()`, `fromJSON()`                        |
| `timeTravel()`    | Undo/redo history          | `undo()`, `redo()`, `history`                   |

> **No `effects()` enhancer.** It was removed in v12. A SignalTree is made of ordinary Angular signals, so use the native `effect(() => tree.$.path())` — it handles the injection context correctly and avoids the NG0203 footgun. There is no `tree.effect()` / `tree.subscribe()`.

---

## Authoring Markers: The Five Landmines

Before you write a marker, read these. Every one of them is a real bug that bit a **built-in** marker — the mechanism is forgiving right up until it isn't, and the failures are the invisible kind (green in build/typecheck, green in specs that never render, wrong in production). Each landmine below is stated as: the trap, why it bites, the correct pattern, and a short example.

### 1. Never write a signal synchronously in your materializer (NG0600)

**The trap.** Your materializer calls `someSignal.set(...)` (or auto-loads, or seeds from storage) while building the materialized shape.

**Why it bites.** SignalTree finalizes markers **lazily, on first `tree.$` access** — which is frequently a template read *during Angular's render pass*. A signal write there throws `NG0600: Writing to signals is not allowed while Angular renders`, and every binding after the throw stays blank. This is not hypothetical: `form({ persist })` hydrated a saved draft with a synchronous `valuesSignal.set()` in the factory — invisible to every fresh-browser test (empty storage skipped the write), but a returning user's form threw on first render (CHANGELOG 11.5.0). The non-lazy `entityMap` loader and `asyncSource` auto-load had the same class of bug and now defer to a microtask (CHANGELOG 11.4.0). See `packages/core/src/lib/markers/form.ts:350-369` (hydrate via the signal's *initial value*, a pure read) and `packages/core/src/lib/markers/entity-loader.ts:597-624` (`queueMicrotask(kickoff)`).

**The correct pattern.** Seed via the signal's **initial value** (a pure read), keep derived state in `computed()`, and defer any load/seed/auto-start to `queueMicrotask`.

```ts wrong
import { signal } from '@angular/core';

// ❌ Throws NG0600 when the first read happens inside a template.
function createRangeSignal(marker: { defaultValue: number }) {
  const value = signal(0);
  value.set(marker.defaultValue); // synchronous write at materialize time
  return Object.assign(() => value(), { value });
}
```

```typescript
import { signal, computed } from '@angular/core';

// ✅ Seed from the initial value; keep derived state computed; defer any load.
function createRangeSignal(marker: { defaultValue: number }) {
  const value = signal(marker.defaultValue); // initial value — no write
  const doubled = computed(() => value() * 2); // derived — not written
  queueMicrotask(() => value.set(marker.defaultValue)); // deferred, if you must
  return Object.assign(() => value(), { value, doubled });
}
```

### 2. Validate in the FACTORY, not the materializer

**The trap.** You throw from your materializer to reject bad configuration ("loud failure").

**Why it bites.** `materializeMarkers()` wraps `processor.create()` in a `try/catch` that **swallows the throw** — dev logs a `console.error`, production silently degrades (the marker placeholder is simply left un-materialized) — see `packages/core/src/lib/internals/materialize-markers.ts:247-267`. So a "must fail loudly" validation becomes a fail-*open* no-op. The built-ins learned this: `entityMap({ load })` validates that `load` is a `loader()` feature synchronously **in the factory** with a coded `[ST2004]` throw (`packages/core/src/lib/markers/entity-map.ts:231-246`), and `loader()` validates `persist.maxScopes` **in the factory** (`packages/core/src/lib/markers/loader.ts:74-89`) — both with an explicit comment that a materializer-level throw "would not actually fail closed" (RFC 0005 §6/§7).

**The correct pattern.** Do config validation in the **factory function**, which runs at `signalTree({ ... })` definition time and cannot be swallowed. Give the error a stable code (see landmine 5).

```ts wrong
// ❌ Swallowed by materializeMarkers()'s try/catch — fails OPEN in prod.
function createRangeSignal(marker: { min: number; max: number }) {
  if (marker.min > marker.max) throw new Error('bad range');
  // ...
}
```

```typescript
const RANGE_MARKER = Symbol('RANGE_MARKER');

// ✅ Validate in the factory — runs at signalTree() definition, cannot be swallowed.
export function range(min: number, max: number) {
  if (min > max) {
    throw new Error(`[ST9001] range(): min (${min}) must be <= max (${max}).`);
  }
  return { [RANGE_MARKER]: true, min, max };
}
```

### 3. Materialize into a walkable shape (the callable-node contract)

**The trap.** You materialize into a bespoke callable (a function you hang methods on), or you nest accessors in a shape the framework doesn't recognize.

**Why it bites.** Every tree walker — batching's setter interception, `serialization()`, `invalidateTag()`, the enterprise diff/patch engine, and `materializeMarkers()` itself — decides "should I keep walking?" with `isTraversableNode` (object **or** function) and then classifies with `isNodeAccessor` / `isSignal` (`packages/core/src/lib/utils.ts:71-106`). NodeAccessors and leaf signals are `typeof 'function'` **carrying a brand** (Angular's `SIGNAL`, or `Symbol.for('SignalTree:NodeAccessor')`). `materializeMarkers()` explicitly bails on any unbranded function: `if (typeof node === 'function' && !isAccessor) return;` (`materialize-markers.ts:227-228`). An unbranded bespoke callable is therefore **invisible** to the walkers — this is the exact root cause behind the v11.4/11.5 inert-batching and inert-enterprise regressions, where walkers were only ever tested on flat plain-object fixtures (RFC 0004 §3 V-P1).

**The correct pattern.** Materialize into a **plain object** of signals, or a proper NodeAccessor/signal. Don't invent an unbranded callable.

```ts wrong
// ❌ Unbranded callable — walkers skip it and everything hanging off it.
function createRangeSignal(marker: { min: number }) {
  const fn = () => marker.min;
  (fn as unknown as { setToMax: () => void }).setToMax = () => undefined;
  return fn; // batching/serialization/enterprise cannot see .setToMax or nested state
}
```

```typescript
import { signal } from '@angular/core';

// ✅ Plain object of signals — traversable by every walker.
function createRangeSignal(marker: { min: number; max: number }) {
  const value = signal(marker.min);
  return { value, setToMax: () => value.set(marker.max) };
}
```

### 4. `asReadonly()` does NOT strip a custom marker's mutators

**The trap.** You rely on `asReadonly(tree)` (or `defineStore(..., { expose: 'readonly' })`) to hide your custom marker's `.set()` / mutators from readers.

**Why it bites.** Readonly is **type-only** — `asReadonly()` returns the *exact same runtime object*, retyped (`packages/core/src/lib/readonly.ts:19-39, 414-422`). The per-marker readonly views (`ReadonlyEntitySignal`, `ReadonlyFormSignal`, `ReadonlyStatusSignal`, …) are **hand-listed reader allowlists for BUILT-IN markers only**. The dispatch (`ReadonlyViewOf`, `readonly.ts:318-349`) matches only the built-in marker types; a custom marker matches no row and falls through the generic object/accessor branch — it gets no curated reader view, and at runtime its mutators are still on the same object and still reachable. The module itself documents that "a future marker without a row here degrades silently" (RFC 0004 §3 V-P2).

**The correct pattern.** Don't depend on `asReadonly()` for custom-marker write protection. Expose reads through a **separate reader object**, or split the write path into an `@Injectable` Ops service — the reader+Ops pattern the readonly module docs recommend.

```ts wrong
import { asReadonly } from '@signaltree/core';

// ❌ Type-only, and only demotes BUILT-IN markers. Custom mutators survive.
declare const tree: { $: { myRange: { setToMax(): void } } };
const reader = asReadonly(tree);
reader.$.myRange.setToMax(); // still callable at runtime — NOT write-protected
```

```typescript
import { signal, type Signal } from '@angular/core';

// ✅ Hand readers a view that only exposes reads; keep writes on a separate surface.
function createRangeSignal(marker: { min: number; max: number }) {
  const value = signal(marker.min);
  const read: { value: Signal<number> } = { value: value.asReadonly() };
  const ops = { setToMax: () => value.set(marker.max) }; // inject via an Ops service
  return { read, ops };
}
```

### 5. Code errors `[ST####]`, name the marker a plain noun, and conformance-test it

**The trap.** Ad-hoc warning text, a verb-y name (`createSelectionMarker`, `makeSelection`, `markSelection`), and shipping without a deep-tree test.

**Why it bites.** Core codes every dev warning/error with a stable `[ST####]` tag (`packages/core/src/lib/constants.ts:33-66`, `SIGNAL_TREE_MESSAGES`) so messages are greppable and stable across releases. Built-in markers are **plain nouns** — `entityMap`, `status`, `stored`, `form`, `loader` — because that is what an AI coding agent guesses; a verb name is a guessability tax (the same reasoning drove the `form().data()` alias in `form.ts:189-197`). And a marker never tested on a **deep callable-branch tree** can be silently inert — precisely the v11.4/11.5 failure mode.

**The correct pattern.** Tag dev warnings/errors with a stable `[ST####]` (pick your own app range — the `ST1xxx`/`ST2xxx` codes are core's), name your marker a plain noun, and add a walker-conformance test modeled on `packages/core/src/lib/walker-conformance.spec.ts` (a deliberately hostile tree with markers nested five branches deep next to `Date`/`Map` leaves).

```typescript
const RANGE_MARKER = Symbol('RANGE_MARKER');

// ✅ Plain-noun name (`range`, not `createRangeMarker`), coded error, testable.
export function range(min: number, max: number) {
  if (min > max) throw new Error(`[ST9001] range(): min must be <= max.`);
  return { [RANGE_MARKER]: true, min, max };
}
// Test it inside a deep callable-branch tree — see
// packages/core/src/lib/walker-conformance.spec.ts for the fixture template.
```

---

## Creating Custom Markers

> **Important:** If you just need a rich signal for component-local state, consider the simpler [Standalone Signal Factories](#pattern-1-standalone-signal-factories-recommended-for-most-cases) pattern. Use markers when you need the signal to live inside SignalTree state.
>
> **Read [Authoring Markers: The Five Landmines](#authoring-markers-the-five-landmines) first** — the step-by-step below teaches the mechanism; the landmines are what keep your marker from being silently broken.

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
import { registerMarkerProcessor } from '@signaltree/core/authoring';

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
import { registerMarkerProcessor } from '@signaltree/core/authoring';

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
export function myEnhancer(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & { myMethod: () => void } {
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
export function batching(config: BatchingConfig = {}): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T> {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & BatchingMethods<T> => {
    // Implementation...
  };
}

// devTools.ts
export function devTools(config: DevToolsConfig = {}): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & DevToolsMethods => {
    // Implementation...
  };
}
```

#### Why This Matters

When you use the wrong pattern, TypeScript will complain when chaining `.with()`:

```typescript
// With WRONG pattern - TypeScript error!
const tree = signalTree({ count: 0 }).with(batching()).with(myBrokenEnhancer()); // ❌ Error: types are incompatible

// With CORRECT pattern - works perfectly!
const tree = signalTree({ count: 0 }).with(batching()).with(myCorrectEnhancer()); // ✅ No errors, full type safety
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
- [ ] **Prefer self-registration inside the factory** (lazy + tree-shakeable). If you register imperatively instead, do it once **before any `signalTree()` call** — registering after a tree is built is a no-op for that tree (dev warns). See [Registration Timing](#registration-timing--self-registration-v701)
- [ ] **Validate config in the FACTORY, not the materializer** — `processor.create()` throws are swallowed (dev `console.error`, silent in prod), so a materializer throw fails *open* ([landmine 2](#2-validate-in-the-factory-not-the-materializer))
- [ ] **Never write a signal synchronously in your materializer** (NG0600) — seed via the initial value, keep derived state `computed()`, defer loads/auto-start to `queueMicrotask` ([landmine 1](#1-never-write-a-signal-synchronously-in-your-materializer-ng0600))
- [ ] **Materialize into a plain object or a proper NodeAccessor** so tree walkers can traverse it — an unbranded bespoke callable is invisible ([landmine 3](#3-materialize-into-a-walkable-shape-the-callable-node-contract))
- [ ] **Don't rely on `asReadonly()` to hide custom-marker mutators** — expose reads through a separate reader object / Ops service ([landmine 4](#4-asreadonly-does-not-strip-a-custom-markers-mutators))
- [ ] Provide `reset()` methods for restoring defaults
- [ ] Consider SSR - avoid browser APIs at module import time
- [ ] Add dev-mode warnings/errors with a stable `[ST####]` code ([landmine 5](#5-code-errors-st-name-the-marker-a-plain-noun-and-conformance-test-it))
- [ ] Name the marker a **plain noun** (`range`, not `createRangeMarker`) for agent-guessability
- [ ] Write a **walker-conformance test** (deep callable-branch tree) plus materialization unit tests

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
  - `packages/core/src/lib/markers/entity-map.ts` (`entityMap()` — and its `[ST2004]` factory-validation precedent)
  - `packages/core/src/lib/markers/form.ts` (NG0600-safe hydration via initial value)
  - `packages/core/src/lib/markers/loader.ts` (factory-validated `persist.maxScopes` guard)

- **Enhancers:**

  - `packages/core/src/enhancers/devtools/devtools.ts`
  - `packages/core/src/enhancers/batching/batching.ts`
  - _(There is no `effects()` enhancer — it was removed in v12; use Angular's native `effect()`.)_

- **Marker Processing:**
  - `packages/core/src/lib/internals/materialize-markers.ts` (the swallowing `try/catch`)
  - `packages/core/src/lib/readonly.ts` (per-marker readonly views — built-ins only)
  - `packages/core/src/lib/walker-conformance.spec.ts` (the deep-tree conformance fixture)

---

## Questions?

- [GitHub Issues](https://github.com/JBorgia/signaltree/issues)
- [Demo App](/custom-extensions) - Interactive examples

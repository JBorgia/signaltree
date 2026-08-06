# SignalTree Examples

This directory contains comprehensive examples demonstrating SignalTree usage patterns.

## Files Overview

### 📁 **Core Examples**

#### `standard-syntax-examples.ts`

The one syntax reference. Every write goes through the API that actually works:

- `tree.$.prop.set('value')` — write a leaf
- `tree.$.prop.update(fn)` — transform a leaf
- `tree.$.branch({ ... })` — partial-write a branch (callable, natively)
- `tree({ ... })` — the root, same shape

Nothing to install; nothing to configure.

> **`callable-syntax-examples.ts` was deleted in 14.0.0.** It demonstrated
> `tree.$.leaf('value')`, which never worked at runtime: a leaf IS an Angular
> signal, so calling it is a READ that discards the argument. The file had no
> assertions, so roughly 90% of it had been silently doing nothing. The build
> transform meant to make it real cannot run in an Angular app at all, and the
> type overloads that permitted it are gone. The contract is now pinned by
> tests in core (`callable-contract.spec.ts` and its `.typing` sibling).

## Example Categories

The file covers these patterns:

### 1. **Basic Operations**

- Direct value updates
- Functional updates
- Getter operations
- Type-safe operations

### 2. **Nested Object Operations**

- Deep property access
- Nested object updates
- Complex object transformations
- Multi-level state management

### 3. **Array Operations**

- Adding/removing items
- Mapping transformations
- Filtering operations
- Complex array manipulations

### 4. **Conditional and Complex Updates**

- State machine patterns
- Loading/error handling
- Filter management
- Conditional logic

### 5. **Working with Optional Values**

- Nullable types
- Optional properties
- Default value handling
- Type guards

### 6. **Performance and Batching**

- Multiple rapid updates
- Analytics patterns
- Event tracking
- Bulk operations

## Usage

```bash
npx ts-node apps/demo/src/app/sanity-checks/standard-syntax-examples.ts
```

## What is callable, and what is not

This is the whole rule, and it follows from one fact: **only leaves are Angular
signals.**

| Target     | Is it a signal?          | Read              | Write                          |
| ---------- | ------------------------ | ----------------- | ------------------------------ |
| **Root**   | no — SignalTree accessor | `tree()`          | `tree({ ... })` — merges       |
| **Branch** | no — SignalTree accessor | `tree.$.user()`   | `tree.$.user({ ... })` — merges |
| **Leaf**   | **yes** — real `WritableSignal` | `tree.$.count()` | `tree.$.count.set(5)`     |

We own a branch's call semantics, so calling one can mean "merge this". We do
not own a signal's: calling an Angular signal is a read, and it ignores
arguments. That is why `tree.$.count(5)` cannot work, and why in 14.0.0 it no
longer type-checks instead of silently doing nothing.

Leaves stay real signals on purpose. Wrapping them to make the sugar work was
measured — the speed cost was negligible (~4%, inside noise), but a wrapper is
not a signal: `isSignal()` returns `false` and `Symbol(SIGNAL)` disappears,
which would break `toObservable`, `model()`/`input()` interop, and every
third-party tool that guards on `isSignal`. The interop guarantee is worth more
than the shorter call.

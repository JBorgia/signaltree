# SignalTree v6 Enhancer Type System Guidance

## Core Problem

In v5, enhancers used a monomorphic pattern where the state type `T` was fixed at enhancer creation:

```typescript
// v5 Pattern (BROKEN)
export function batching<T>(config?: BatchingConfig): Enhancer<BatchingMethods<T>> {
  return (tree: ISignalTree<T>): ISignalTree<T> & BatchingMethods<T> => {
    // ...
  };
}
```

This caused type errors and loss of type inference because the enhancer's generic parameter `T` was not linked to the actual tree state type `S` at `.with()` call time.

## Solution: Polymorphic Pattern (v6)

Enhancer factories must return a function that is generic in the tree state type:

```typescript
// v6 Pattern (CORRECT)
export function batching(config?: BatchingConfig): <S>(tree: ISignalTree<S>) => ISignalTree<S> & BatchingMethods {
  return <S>(tree: ISignalTree<S>): ISignalTree<S> & BatchingMethods => {
    // ...
    return Object.assign(tree, methods);
  };
}
```

### Key Points

- No outer generic on the factory
- Inner generic `<S>` on the returned function
- Return type is `SignalTree<S> & XMethods`
- Methods are attached directly to the tree
- No `any` in the return path

## `.with()` Signature

```typescript
with<R>(enhancer: (tree: ISignalTree<T>) => R): R;
```

This allows TypeScript to infer the correct return type and preserve all generic relationships.

## Method Interface Guidelines

| If the method...             | Use                              |
| ---------------------------- | -------------------------------- |
| Takes no state parameter     | No generic: `BatchingMethods`    |
| Takes state in callback      | Generic: `EffectsMethods<S>`     |
| Returns state-dependent type | Generic: `MemoizationMethods<S>` |

## Contract Enforcement

Type-tests must verify the exact signature:

```typescript
type Actual = typeof batching;
type Expected = (config?: BatchingConfig) => <S>(tree: ISignalTree<S>) => ISignalTree<S> & BatchingMethods;
type _check = Assert<Equals<Actual, Expected>>;
```

## Summary Table

| Enhancer       | Return Type                                           |
| -------------- | ----------------------------------------------------- |
| batching       | `<S>(tree) => ISignalTree<S> & BatchingMethods`       |
| effects        | `<S>(tree) => ISignalTree<S> & EffectsMethods<S>`     |
| memoization    | `<S>(tree) => ISignalTree<S> & MemoizationMethods<S>` |
| withTimeTravel | `<S>(tree) => ISignalTree<S> & TimeTravelMethods`     |
| devTools       | `<S>(tree) => ISignalTree<S> & DevToolsMethods`       |
| entities       | `<S>(tree) => ISignalTree<S> & EntitiesEnabled`       |

## Type-Test Pattern

Each `.types.ts` file should follow:

```typescript
import type { withX } from './x';
import type { SignalTree, XMethods, XConfig } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type Actual = typeof withX;
type Expected = (config?: XConfig) => <S>(tree: ISignalTree<S>) => ISignalTree<S> & XMethods;
type _check = Assert<Equals<Actual, Expected>>;
```

## Migration Checklist

- [ ] All enhancer factories use the v6 polymorphic pattern
- [ ] All methods attached via `Object.assign(tree, methods)`
- [ ] No `any` in return path
- [ ] All type-tests enforce the exact contract
- [ ] `.with()` signature allows full type inference

---

**This guidance is required for all new and existing enhancers in SignalTree v6.**

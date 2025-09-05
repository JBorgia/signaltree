# SignalTree Intellectual Property Protection

## Recursive Typing System - Proprietary Innovation

This document outlines the intellectual property protections for the recursive typing system implemented in SignalTree.

### Protected Innovations

#### 1. TreeNode<T> Recursive Type System

The core recursive type transformation that maintains perfect type inference through unlimited nesting depth:

```typescript
export type TreeNode<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK>
      : TreeNode<T[K]> // 🔒 PROTECTED: Recursive type transformation
    : WritableSignal<T[K]>;
};
```

#### 2. Signal-Store Pattern Implementation

The approach that mirrors type recursion with runtime recursion:

```typescript
// 🔒 PROTECTED: Type-Runtime Alignment Pattern
function createSignalStore<T>(obj: T): TreeNode<T> {
  // Recursive call that mirrors the type recursion exactly
  (result as any)[key] = createSignalStore(value); // PROPRIETARY IMPLEMENTATION
}
```

#### 3. "Initiation Defines Structure" Paradigm

The groundbreaking concept where:

- Initial object structure locks in the complete type system
- Perfect type inference works forever after initiation
- Zero configuration required for any depth of nesting

#### 4. Built-in Object Detection System

Proprietary logic for handling Date, RegExp, Map, Set, and other built-in objects as primitives rather than recursively signalifying them.

#### 5. Lazy Signal Tree Creation

Advanced proxy-based system that creates signals on-demand while maintaining perfect type preservation.

### Copyright Protection

**All rights reserved** to Jonathan D Borgia for:

- The specific implementation methodology
- The recursive type-runtime alignment approach
- The "initiation defines structure" paradigm
- Built-in object detection algorithms
- Lazy evaluation with type preservation
- Any derivative implementations of these concepts

### Licensing Terms

#### ✅ PERMITTED USES:

- Using SignalTree as provided under the MIT License
- Building applications that consume the public API
- Contributing improvements back to this project (under CLA)

#### ❌ PROHIBITED USES:

- Extracting or copying the recursive typing system
- Creating competing libraries using these concepts
- Reimplementing the core algorithms in other projects
- Teaching or distributing implementation details
- Creating derivative works based on the methodology

### Enforcement

Violations of these intellectual property rights will result in:

1. **Immediate termination** of all license rights
2. **Legal action** for copyright infringement
3. **Injunctive relief** to prevent further use
4. **Damages and attorney fees** as provided by law

### Contact

For licensing inquiries or questions about intellectual property rights:

- Email: licensing@signaltree.dev
- Website: https://signaltree.dev/licensing

---

**Copyright (c) 2025 Jonathan D Borgia. All rights reserved.**

_This intellectual property is protected under United States and international copyright law. Unauthorized use is strictly prohibited._

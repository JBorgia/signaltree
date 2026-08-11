# SignalTree — Intellectual Property and Attribution

SignalTree is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE) for
the binding terms; this document is explanatory and grants nothing beyond them.

## What the license gives you

Apache-2.0 is permissive and OSI-approved. You may use, modify, distribute and
sublicense the Software for any purpose, including commercially, and you may create
and distribute derivative works (LICENSE §2). There is no copyleft — code you write
against SignalTree stays yours.

You also receive a perpetual, worldwide, royalty-free **patent licence** from every
contributor covering their contributions (LICENSE §3). That grant terminates for
anyone who initiates patent litigation alleging the Software infringes their patents.

## What you owe in return

Distributing SignalTree, modified or not, requires you to (LICENSE §4):

- include a copy of the LICENSE,
- retain the copyright, patent, trademark and attribution notices,
- pass along the [NOTICE](NOTICE) file, and
- carry prominent notices stating any files you changed.

## What is reserved

**Trademarks.** Apache-2.0 §6 grants no rights to the "SignalTree" name, logo, or
other marks. The code may be forked freely; a fork must ship under a different name
and must not imply endorsement by or affiliation with this project.

Nothing else is reserved. Earlier revisions of this document asserted restrictions on
reimplementing the techniques below, teaching them, or building competing libraries.
Those assertions are withdrawn: they conflict with the license now granted, and US
copyright does not reach ideas, methods, or paradigms in any case — only their
expression (17 U.S.C. §102(b)).

## Techniques introduced by this project

Recorded for attribution and as prior art, not as a restriction. Independent
reimplementation of any of these is permitted.

### TreeNode&lt;T&gt; recursive type system

Recursive type transformation preserving inference through unlimited nesting depth:

```typescript
export type TreeNode<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<infer TK>
      ? WritableSignal<TK>
      : TreeNode<T[K]>
    : WritableSignal<T[K]>;
};
```

### Type–runtime alignment

Runtime construction that mirrors the type recursion exactly, so the structure the
compiler infers and the structure built at run time cannot drift apart.

### "Initiation defines structure"

The initial object literal fixes the complete type system: inference holds at any
depth thereafter, with no configuration and no per-depth annotation.

### Built-in object detection

`Date`, `RegExp`, `Map`, `Set` and similar built-ins are treated as leaf values rather
than recursively signalified, so their internal slots are never destructured.

### Lazy tree materialisation

Proxy-based on-demand signal creation that preserves the eager type surface, so paths
that are never read are never allocated.

## Contributing

Contributions are accepted under Apache-2.0 §5: anything you intentionally submit for
inclusion is licensed under the same terms, with no additional conditions, unless you
state otherwise explicitly.

## Contact

Questions about attribution, trademark use, or this document:
<https://github.com/JBorgia/signaltree/issues>

---

Copyright 2024-2026 Jonathan D Borgia and SignalTree contributors.
Licensed under the Apache License, Version 2.0.

Releases up to and including 14.1.1 were published under the Business Source License
1.1. That grant is irrevocable for those versions and is not withdrawn here.

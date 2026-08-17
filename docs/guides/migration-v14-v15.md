# Migration: v14 → v15

> **SignalTree** — Reactive JSON for Angular. JSON branches, reactive leaves.

15.0 is an API-reduction release. Every change below removes something that was
either a duplicate of an existing path or a type that described an API grammar
the runtime did not have.

Every code sample in this guide is compiled against the shipped types before
publication. If one does not compile for you, that is a bug — please report it.

---

## At a glance

| Removed | Replacement |
| --- | --- |
| `SignalTreeBase<T>` | `SignalTree<T>` |
| root state properties on the tree (`tree.count`) | `tree.$.count()` |
| `composeEnhancers(a, b)` | `tree.with(a).with(b)` |

---

## 1. `SignalTreeBase<T>` removed

Use `SignalTree<T>`. This is a rename and nothing else — the two were
character-identical (`ISignalTree<T> & TreeNode<T>`), so no behaviour or
inference changes.

```ts
// before
function inspect(tree: SignalTreeBase<AppState>) {}

// after
function inspect(tree: SignalTree<AppState>) {}
```

The name asserted a base/derived relationship with `SignalTree<T>` that did not
exist, so choosing one over the other communicated something untrue.

---

## 2. `SignalTree<T>` no longer types state on the tree root

**This is the change most likely to affect you, and the code it breaks never
worked at runtime.**

`SignalTree<T>` was `ISignalTree<T> & TreeNode<T>`, which typed the state keys on
the tree object itself. The runtime root has never carried them:

```ts
const tree = signalTree({ count: 0, user: { name: 'Ada' } });

Object.keys(tree); // []           <- no state keys, before or after 15.0
tree.$.count();    // 0
```

So `tree.count` typechecked as a writable signal and was `undefined` at runtime.
15.0 removes the false surface. State is addressed through `$`, and only through
`$`:

```ts
// before — compiled, then failed at runtime
tree.count();
tree.user.name();

// after — the grammar that always worked
tree.$.count();
tree.$.user.name();
tree.$.user(); // read the whole branch
```

If your code compiled *and* ran on v14, it already used `$` and needs no change.

### Why not add the root properties to the runtime instead?

That would give two ways to address one node — `tree.count()` beside
`tree.$.count()` — and this API deliberately has one. `$` is the state accessor;
the tree callable is for whole-tree reads and writes:

```ts
tree();                                    // read the whole state
tree({ count: 1 });                        // partial merge
tree((current) => ({ ...current, count: 2 })); // functional update
```

### Annotating a tree

`SignalTree<T>` is the canonical type to annotate with, and as of 15.0 the
constructor's return satisfies it:

```ts
import { signalTree, type SignalTree } from '@signaltree/core';

interface AppState {
  count: number;
  user: { name: string };
}

const tree: SignalTree<AppState> = signalTree<AppState>({
  count: 0,
  user: { name: 'Ada' },
});

function inspect(tree: SignalTree<AppState>) {
  return tree.$.count();
}
```

On v14 that annotation did **not** compile, because `SignalTreeBuilder.bind()`
was declared more loosely than the `NodeAccessor<T>` it actually returns. That is
fixed in 15.0.

---

## 3. `composeEnhancers` removed

```ts
// before
import { composeEnhancers } from '@signaltree/core/authoring';
const tree = signalTree({ count: 0 }).with(composeEnhancers(a, b));

// after
const tree = signalTree({ count: 0 }).with(a).with(b);
```

Note that built-in enhancers are **factories** — call them:

```ts
import { signalTree, batching, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(batching()).with(devTools());

tree.batch(() => {
  /* ... */
});
```

### Chained `.with()` is not merely equivalent syntax

It is the canonical application path, and it does things `composeEnhancers` could
not. `composeEnhancers` was a plain left fold that called its children directly,
so those children never passed through `.with()` — and `.with()` is where the
enhancer protocol lives.

**It preserves your types.** `.with()` returns `this & TAdded`, so every
enhancer's additions accumulate and stay statically available:

```ts
const tree = signalTree({ count: 0 }).with(a).with(b);
tree.alpha(); // ✅ from the first enhancer
tree.beta(); // ✅ from the second
```

`composeEnhancers` erased them. Its type used one `T` for both its parameter and
its return, leaving nowhere to carry what an enhancer *adds*. With two enhancers
the additions vanished silently; with a single enhancer the result could not be
applied at all, because `T` inferred from the return and then demanded it as
input.

**It participates in enhancer metadata and validation.** Under
`plannedSignalTree()`, individually applied enhancers get duplicate detection,
dependency validation and ordering. A composed fold hid its children from all of
it — and the dependency check is fail-closed, so bypassing it meant an enhancer
declaring an unmet requirement ran anyway instead of throwing.

If you were relying on `composeEnhancers` to force raw source order past that
check, there is no supported replacement: that was an undocumented bypass of a
safety check, and removing it is deliberate. Declare the ordering you need with
enhancer metadata instead.

### Composing your own helper

If you had a reusable enhancer bundle, make it a function that applies them in
order and let the return type infer:

```ts
function withStandardEnhancers<T extends object>(tree: SignalTree<T>) {
  return tree.with(batching()).with(devTools());
}
```

Do not annotate the return type by hand — inference carries the accumulated
additions, and writing it out is how they get lost.

---

## Not changed

- `createEnhancer` — unchanged.
- `resolveEnhancerOrder` — unchanged; it is the supported way to express
  dependency-aware ordering.
- `ENHANCER_META` — unchanged.
- Variadic `.with(a, b)` — still does **not** exist. Chain the calls.

---

## Checklist

```text
[ ] replace SignalTreeBase<T> with SignalTree<T>
[ ] route any tree.<key> state access through tree.$.<key>
[ ] replace composeEnhancers(a, b) with .with(a).with(b)
[ ] make sure built-in enhancers are CALLED: .with(batching()), not .with(batching)
[ ] typecheck — every change above is compile-time visible
```

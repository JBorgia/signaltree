## Deep Partial Updates & Sparse Merging

SignalTree accepts updater functions that return either a full replacement state or a `DeepPartial<T>` describing only the leaves you want to change.

### Key Properties

1. Plain object branches are merged shallowly per level while recursing: unspecified keys are preserved.
2. Arrays and built-in objects (`Date`, `Map`, `Set`, `RegExp`, `URL`, `Blob`, `File`, etc.) are treated as atomic and fully replaced when included in a patch.
3. Callable proxy branches (`tree.$.some.nested`) delegate the deep patch to their own `.update` logic, ensuring consistent sparse semantics at every depth.
4. Missing paths are ignored (with a debug warning if `debugMode: true`).
5. Patches never delete keys; absence ≠ removal. Explicit deletion helpers may be introduced later.

### Examples

```ts
const tree = signalTree({
  user: { profile: { name: 'Ada', email: 'ada@example.com' }, prefs: { theme: 'dark', notifications: true } },
  items: [1, 2, 3],
  meta: { loaded: false },
});

// Update just a deep leaf
tree.update(() => ({ user: { profile: { name: 'Grace' } } }));
// => email, prefs.theme, prefs.notifications all preserved.

// Replace array (append new value)
tree.update((s) => ({ items: [...s.items, 4] }));

// Mixed patch
tree.update(() => ({
  user: { prefs: { notifications: false } },
  meta: { loaded: true },
}));
```

### Branch-Level set()

Every callable proxy (e.g. `tree.$.user`) exposes a `.set(partial)` that behaves like `tree.update(() => ({ user: partial }))` with the same deep-partial semantics.

```ts
tree.$.user.set({ profile: { email: 'new@example.com' } });
```

### Root set()

`tree.set(partialOrFull)` applies a deep partial to the root (or full replacement if you provide a complete object).

### Property Name Collision Safety

If your state object contains a key literally named `set`, the callable proxy won’t shadow it: accessing `tree.$.set()` still yields the underlying value while `tree.set()` remains the mutation method.

### Time Travel Compatibility

Time travel stores full snapshots after each successful update, so sparse patches produce consistent undo/redo behavior without reconstructing intermediate partial diffs.

### When to Use Full vs Deep Partial

| Situation                  | Recommendation                       |
| -------------------------- | ------------------------------------ |
| Change many distant leaves | Use multiple specific deep partials  |
| Replace a whole branch     | Use branch `.set(newBranch)`         |
| Append to an array         | Produce a new array (arrays replace) |
| Toggle single flag         | Deep partial targeting that flag     |

### Future Enhancements

Potential future additions:

- Explicit key removal API (`tree.delete(path)` or structured delete patches)
- Structural sharing diff optimization for very large patches
- Optional array diff mode (opt-in) to minimize history footprint

---

For questions or suggestions, open an issue or PR.

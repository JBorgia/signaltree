## Preferred SignalTree Typing Pattern

This page documents the preferred pattern for typing initialized SignalTree state so TypeScript inference preserves literal union types, array element types, and keeps enhancer signatures happy.

### ✅ PREFERRED: Type the initialized object, let inference handle the rest

```typescript
type Themes = 'light' | 'dark' | 'system';

// Type assertions on specific values in the initial state
const store = signalTree({
  user: {
    name: '',
    email: '',
    theme: 'system' as Themes,  // Assert literal type here
  },
  preferences: {
    notifications: true,
    autoSave: true,
  },
  items: [] as Item[],  // Assert array element type here
});

// TypeScript infers the full tree type correctly
// All subsequent operations preserve literal types
```

### ❌ AVOID: Passing a generic type parameter to `signalTree`

```typescript
// Don't do this - fighting against inference
interface State {
  user: { name: string; email: string; theme: Themes };
  preferences: { notifications: boolean; autoSave: boolean };
  items: Item[];
}

const store = signalTree<State>({
  user: { name: '', email: '', theme: 'system' },
  // ...
});
```

### Why this matters

1. **DRY** - Define types once at the source, not in two places
2. **Inference works better** - TypeScript propagates literal types correctly
3. **Enhancer compatibility** - Tree-polymorphic enhancers infer from concrete types
4. **Less maintenance** - Changes to initial state automatically update inferred types

---

Place examples from this page in your code examples and docs to help contributors and consumers follow the pattern consistently.

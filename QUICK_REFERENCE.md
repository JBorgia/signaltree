# SignalTree v6 - Quick Reference

## SignalTree-First Patterns

> 📖 Full guide: [docs/IMPLEMENTATION_PATTERNS.md](docs/IMPLEMENTATION_PATTERNS.md)

```typescript
const tree = signalTree(initialState).with(entities());
const $ = tree.$; // Shorthand for state access

// ✅ DO: Expose signals directly from $ tree
return {
  selectedUserId: $.selected.userId, // Direct signal
  selectedUser, // computed() for derived state only
};

// ❌ DON'T: Wrap signals in computed()
return {
  selectedUserId: computed(() => $.selected.userId()), // Unnecessary!
};

// ✅ DO: Use EntitySignal API
const user = $.users.byId(123)(); // Returns signal, invoke to get value
const all = $.users.all; // Signal<E[]>

// ✅ DO: Use ReturnType inference for types
import type { createMyTree } from './my.tree';
export type MyTree = ReturnType<typeof createMyTree>; // No manual interface!
```

## Setup

```typescript
import { signalTree, entityMap, entities, withPersistence, timeTravel, devTools } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(), // EntitySignal - auto-detected by withEntities()
  settings: { theme: 'dark' },
})
  .with(entities())
  .with(withPersistence({ key: 'app-state' }))
  .with(timeTravel())
  .with(devTools());
```

## Entity CRUD

```typescript
// Create
const id = tree.$.users.addOne({ id: 'u1', name: 'Alice' });

// Read
const user = tree.$.users.byId('u1');
const all = tree.$.users.all; // Signal<User[]>
const count = tree.$.users.count; // Signal<number>
const ids = tree.$.users.ids; // Signal<string[]>

// Update
tree.$.users.updateOne('u1', { name: 'Bob' });

// Delete
tree.$.users.removeOne('u1');

// Upsert
tree.$.users.upsertOne({ id: 'u2', name: 'Charlie' });

// Error handling
tree.$.users.updateOne(
  'u999',
  { name: 'Nope' },
  {
    onError: (err) => console.warn(err.message),
  }
);
```

## Hooks (Observe)

```typescript
const unsub = tree.$.users.tap({
  onAdd: (user, id) => {
    /* new entity added */
  },
  onUpdate: (id, changes, entity) => {
    /* entity updated */
  },
  onRemove: (id, entity) => {
    /* entity removed */
  },
  onChange: () => {
    /* any of above happened */
  },
});

unsub(); // Stop listening
```

## Intercept (Validate/Transform/Block)

```typescript
tree.$.users.intercept({
  onAdd: (user, ctx) => {
    if (!user.email) ctx.block('Email required');
    ctx.transform({ ...user, createdAt: new Date() });
  },

  onUpdate: (id, changes, ctx) => {
    if (changes.name === '') ctx.block('Name cannot be empty');
    ctx.transform({ ...changes, updatedAt: new Date() });
  },

  onRemove: (id, user, ctx) => {
    if (user.role === 'admin') ctx.block('Cannot delete admins');
  },
});
```

## Enhancers

### Batching (Auto-groups mutations)

```typescript
// Multiple mutations fire as one event
tree.$.users.tap({ onChange: () => console.log('changed') });
tree.$.users.addOne(u1); // No log
tree.$.users.addOne(u2); // No log
tree.$.users.addOne(u3); // Log fires once (batched!)
```

### Persistence (Event-driven, not polling)

```typescript
withPersistence({
  key: 'my-app',
  storage: localStorage,
  debounceMs: 1000,
  filter: (path) => !path.startsWith('ui'), // Only persist data
});
```

### TimeTravel (Tracks all mutations)

```typescript
tree.$.users.addOne(u1); // Snapshot 1
tree.$.users.updateOne('u1', { name: 'Alice v2' }); // Snapshot 2

tree.undo(); // Back to Snapshot 1
tree.redo(); // Forward to Snapshot 2
tree.jumpTo(0); // Jump to specific snapshot
tree.getHistory(); // Array of all snapshots
```

### DevTools (Complete history)

```typescript
// Redux DevTools Extension shows all mutations
// Open DevTools, see full state history, time-travel debug
```

### Logging (Automatic)

```typescript
withLogging({
  filter: (path) => !path.startsWith('ui'),
  onLog: (log) => console.log(log.path, log.value),
});
```

## Comparison: v4.x → v5.0

| Feature         | v4.x (Broken)                      | v5.0 (Fixed)                       |
| --------------- | ---------------------------------- | ---------------------------------- |
| **Hooks**       | —                                  | `tree.$.users.tap()` (scoped)      |
| **Batching**    | Global state, race conditions      | Instance-scoped, clean             |
| **Persistence** | 50ms polling, never cleaned up     | Event-driven, proper cleanup       |
| **TimeTravel**  | Misses leaf mutations              | Catches everything                 |
| **DevTools**    | Incomplete history                 | Complete history                   |
| **Types**       | `action: string, payload: unknown` | `(user: User, id: string) => void` |
| **Removal**     | —                                  | `unsub()`                          |

## Common Patterns

### Form with Validation

```typescript
tree.$.users.intercept({
  onUpdate: (id, changes, ctx) => {
    if (changes.email && !isValidEmail(changes.email)) {
      ctx.block('Invalid email');
    }
  },
});

// Form automatically validates on update
tree.$.users.updateOne(userId, formData);
```

### Audit Logging

```typescript
tree.$.users.tap({
  onAdd: (user) => auditLog.write({ action: 'user_created', user }),
  onUpdate: (id, changes) => auditLog.write({ action: 'user_updated', id, changes }),
  onRemove: (id, user) => auditLog.write({ action: 'user_deleted', id, user }),
});
```

### Cascade Updates

```typescript
tree.$.users.tap({
  onRemove: (userId) => {
    // When user deleted, delete their posts
    const userPosts = tree.$.posts.all().filter((p) => p.userId === userId);
    userPosts.forEach((p) => tree.$.posts.removeOne(p.id));
  },
});
```

### Role-Based Access

```typescript
const isAdmin = computed(() => tree.$.currentUser()?.role === 'admin');

tree.$.users.intercept({
  onAdd: (user, ctx) => {
    if (!isAdmin()) ctx.block('Only admins can add users');
  },
});
```

### Reactive Derived State

```typescript
const activeUsers = computed(() => tree.$.users.all().filter((u) => u.status === 'active'));

const userCount = computed(() => tree.$.users.count());

const adminCount = computed(() => tree.$.users.all().filter((u) => u.role === 'admin').length);
```

---

**See:** USAGE_EXAMPLES.md for complete examples

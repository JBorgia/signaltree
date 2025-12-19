# SignalTree Deprecation Plan

This document tracks deprecated APIs scheduled for removal in future major versions.

## Version 6.0 Removal Targets

### 1. `tree.entities<E>(path)` Method

**Status:** Deprecated in v5.x  
**Removal:** v6.0  
**Alternative:** `entityMap<E>()` + `withEntities()` + `tree.$.collectionName`

#### Migration Example

```typescript
// ❌ Old (deprecated):
interface State {
  users: User[];
}
const tree = signalTree<State>({ users: [] });
const helpers = tree.entities<User>('users');
helpers.add(user);
helpers.selectById(id)();
helpers.selectAll()();

// ✅ New (recommended):
import { entityMap, signalTree, withEntities } from '@signaltree/core';

interface State {
  users: entityMap<User>;
}
const tree = signalTree<State>({ users: entityMap<User>() }).with(withEntities());

tree.$.users.add(user);
tree.$.users.byId(id)();
tree.$.users.all();
```

#### Key Differences

| Old API                       | New API                                           |
| ----------------------------- | ------------------------------------------------- |
| `tree.entities<E>('key')`     | `tree.$.key` (auto-detected via `entityMap<E>()`) |
| `helpers.selectById(id)`      | `tree.$.key.byId(id)`                             |
| `helpers.selectAll()`         | `tree.$.key.all()`                                |
| `helpers.selectBy(predicate)` | `tree.$.key.where(predicate)`                     |
| `helpers.selectIds()`         | `tree.$.key.ids()`                                |
| `helpers.selectTotal()`       | `tree.$.key.count()`                              |
| Array-based storage           | Map-based storage (O(1) lookups)                  |

---

### 2. `EntityHelpers<E>` Interface

**Status:** Deprecated in v5.x  
**Removal:** v6.0  
**Alternative:** `EntitySignal<E, K>` interface from `withEntities()`

The old `EntityHelpers` interface is kept for backward compatibility during migration but will be removed alongside `tree.entities()`.

---

### 3. `{ enhancers: [...] }` Config Object Pattern

**Status:** Soft deprecated (not recommended in docs)  
**Removal:** v7.0 (or later)  
**Alternative:** `.with()` chain

```typescript
// ❌ Not recommended:
const tree = signalTree(state, { enhancers: [withBatching(), withLogging()] });

// ✅ Recommended:
const tree = signalTree(state).with(withBatching()).with(withLogging());
```

**Rationale:** The `.with()` chain provides better TypeScript inference and cleaner composition.

---

## Deprecation Timeline

| Version | Changes                                                 |
| ------- | ------------------------------------------------------- |
| v5.x    | Deprecation warnings added, migration docs published    |
| v6.0    | Remove `tree.entities()`, `EntityHelpers` interface     |
| v7.0    | Consider removing `{ enhancers: [...] }` config pattern |

---

## Checking for Deprecated Usage

Run this command to find deprecated patterns in your codebase:

```bash
# Find old entity<T>('id') markers (if any exist)
grep -rn "entity<.*>(" src/ --include="*.ts" | grep -v "entityMap"

# Find old tree.entities() usage
grep -rn "\.entities<" src/ --include="*.ts"

# Find old config object pattern
grep -rn "{ enhancers:" src/ --include="*.ts"
```

---

## Migration Support

- **Documentation:** Full migration guide at [signaltree.dev/docs/migration](https://signaltree.dev/docs/migration)
- **Issues:** Report migration problems at [GitHub Issues](https://github.com/JBorgia/signaltree/issues)
- **Examples:** See the demo app for modern patterns

# Phase 3: EntitySignal Implementation Strategy

## Current Status

- ✅ Phase 1: Type definitions (EntitySignal, EntityConfig, etc.) created in types.ts
- ✅ Phase 2: PathNotifier core implemented (155 lines)
- ⏳ Phase 3: EntitySignal implementation (~500 lines)

## Architecture Decision

### Old API (v4.x, being phased out)

```typescript
tree
  .entities<User>('users') // Returns EntityHelpers
  .add(user)
  .update(id, changes)
  .selectAll(); // Returns Signal<User[]>
```

### New API (v5.0)

```typescript
signalTree({
  users: entityMap<User>(),  // Type marker
}).with(withEntities());

tree.$.users.addOne(user)     // Direct CRUD
tree.$.users.all()()          // Query signal
tree.$.users.tap({ onAdd: ... })  // Hooks
```

## Implementation Plan

### 1. **EntitySignal Implementation** (~400 lines)

- Create `EntitySignalImpl<E, K>` class that implements `EntitySignal<E, K>`
- Storage: `Map<K, E>`
- Key methods:
  - **CRUD**: `addOne`, `updateOne`, `removeOne`, `upsertOne`
  - **Queries**: `all()`, `count()`, `ids()`, `byId()`, `where()`, `find()`
  - **Hooks**: `tap()`, `intercept()`
  - **Batch**: `addMany()`, `updateMany()`, `removeMany()`, `updateWhere()`, `removeWhere()`
- Uses PathNotifier for change notification
- Deep reactive access via EntityNode proxy

### 2. **EntityMap Factory** (~50 lines)

- `entityMap<E, K>()` function that returns a type marker
- Picked up by `withEntities()` during tree creation
- Allows flexible key selection (default: `.id` property)

### 3. **withEntities Enhancer** (~100 lines)

- Intercepts tree creation to detect `entityMap()` markers
- Replaces markers with actual `EntitySignal` instances
- Injects PathNotifier for mutation coordination
- Wire hooks and interceptors to PathNotifier

### 4. **Integration Points** (~100 lines)

- Export from `packages/core/src/lib/public-api.ts`
- Wire into SignalTree constructor via enhancer registry
- Support `.with()` chaining for fluent API

## Key Type Constraints

From `packages/core/src/lib/types.ts` line 600:

```typescript
export interface EntitySignal<E, K extends string | number = string> {
  // Bracket access: tree.$.users['id'] or tree.$.users[123]
  [id: string]: EntityNode<E> | undefined;
  [id: number]: EntityNode<E> | undefined;

  // Methods
  byId(id: K): EntityNode<E> | undefined;
  byIdOrFail(id: K): EntityNode<E>;
  all(): Signal<E[]>;
  count(): Signal<number>;
  ids(): Signal<K[]>;
  // ... many more ...
}
```

## Implementation Order

1. **EntitySignalImpl class** - Core CRUD + queries
2. **EntityNode factory** - Deep access proxies
3. **entityMap() function** - Public factory
4. **withEntities() enhancer** - Integration
5. **Tests** - Cover main paths
6. **Exports** - Make public API

## Tests to Add

- CRUD operations (add, update, remove, upsert)
- Query signals (all, count, ids, byId)
- Hook invocation (tap, onAdd, onUpdate, onRemove)
- Interceptors (block, transform)
- Deep access (tree.$.users['id'].name())
- Error handling (not found, already exists)
- Multiple entities (addMany, updateMany)
- Integration with PathNotifier

## Files to Create/Modify

| File                                                       | Status | Lines |
| ---------------------------------------------------------- | ------ | ----- |
| `packages/core/src/lib/entity-signal.ts`                   | NEW    | ~400  |
| `packages/core/src/enhancers/entities/lib/new-entities.ts` | NEW    | ~150  |
| `packages/core/src/lib/signal-tree.ts`                     | MODIFY | ~20   |
| Tests                                                      | NEW    | ~200  |
| Exports                                                    | MODIFY | ~5    |

## Next Steps

1. Implement `EntitySignalImpl` with full CRUD
2. Create `withEntities()` enhancer integration
3. Add comprehensive tests
4. Update exports
5. Verify with usage examples from USAGE_EXAMPLES.md

## Risk Areas

- Type parameter constraints (K extends string | number)
- Deep property access proxies for EntityNode
- PathNotifier coordination with entity mutations
- Circular reference in hookhandlers
- Testing entity interception before and after mutation

## Success Criteria

- All EntitySignal methods implemented and tested
- Usage examples from USAGE_EXAMPLES.md work without modification
- No TypeScript errors in strict mode
- Tree-shaking test passes
- Bundle size < 200KB gzip for all entity features

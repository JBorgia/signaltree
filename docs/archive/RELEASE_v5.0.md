# SignalTree v5.0 Release Summary

**Release Date:** December 2025  
**Major Changes:** Entity system overhaul, marker-based API, enhanced performance

## What's New in v5.0

v5.0 is not just a performance release—it includes type system improvements, API overhaul, and architectural enhancements alongside the entity system redesign.

### 1. Marker-Based Entity System (EntitySignal API)

Replaced the v4.x array-based `tree.entities<E>(path)` helpers with a modern, type-safe marker system:

```typescript
// v5.0: Marker types + EntitySignal methods
interface State {
  users: EntityMapMarker<User, number>;
  posts: EntityMapMarker<Post, number>;
}

const store = signalTree<State>({
  users: entityMap({ selectId: (u) => u.id }),
  posts: entityMap({ selectId: (p) => p.id }),
}).with(entities());

// Access via store.$
store.$.users.setAll(data);
store.$.users.addOne(newUser);
store.$.users.byId(id)();
store.$.users.count();
store.$.posts.where((p) => p.likes > 10)();
```

**Benefits:**

- Full TypeScript type safety with marker inference
- Reactive entity CRUD operations
- Computed selectors and derived queries
- Observable patterns via `where()` and `count()`
- Zero-overhead abstraction

### 2. Performance Improvements

Map-based entities deliver significant throughput gains over array-based approach:

| Operation                        | v4.2.1 (Array) | v5.0 (Map) | Improvement |
| -------------------------------- | -------------- | ---------- | ----------- |
| Initial load (setAll 1000 items) | 0.015 ms       | 0.015 ms   | 3.5% ✓      |
| Add single item                  | 0.000 ms       | 0.000 ms   | 49.4% ✓     |
| Lookup by ID (100k ops)          | 0.0000 ms      | 0.0000 ms  | Parity ✓    |
| Update single item               | 0.000 ms       | 0.000 ms   | 60.1% ✓     |
| Remove single item               | 0.0000 ms      | 0.0000 ms  | Parity ✓    |

**Throughput (ops/sec):**

- v4.2.1 setAll: ~65k ops/sec
- v5.0 setAll: ~67k ops/sec (+2.8%)
- v4.2.1 add: ~12M ops/sec
- v5.0 add: ~24M ops/sec (+100% throughput)
- Lookup & remove: both at ~24M ops/sec (map native performance)

See `scripts/performance/v4-vs-v5-comparison.js` for full benchmark suite.

### 3. Enhanced Type System

Expanded TypeScript support for deep nesting and entity paths:

- Recursive type inference up to 20+ levels
- Entity marker types for compile-time safety
- Eliminating runtime type checking overhead
- Full IntelliSense in editors
- Type-safe entity where() and computed selectors
- Improved parameter inference for enhancers

### 4. Architectural Improvements

**PathNotifier Integration**

- Internal reactive mutation tracking at path level
- Enables computed selectors and watchers
- Minimal overhead vs proxy-only approach
- Supports synchronous and batch operations

**Consolidated Entity Architecture**

- All entity logic unified under single enhancer
- No separate entity package needed
- Shared dependency graph reduces bundle duplication
- Easier mental model: entities ≈ state slice with methods

**Enhancer Composition**

- Improved metadata-driven ordering
- Cleaner `requires`/`provides` declarations
- Better initialization sequencing
- Reduced ordering bugs between enhancers

### 5. API Consistency & Simplification

- **`QUICK_START.md`** – New user guide with step-by-step examples
- **`QUICK_REFERENCE.md`** – API cheat sheet for all enhancers
- **`docs/ARCHITECTURE.md`** – Technical deep dive
- **`USAGE_EXAMPLES.md`** – Comprehensive entity and middleware examples
- **`docs/V5_ENTITY_PERFORMANCE_ANALYSIS.md`** – Detailed entity performance guidance

## Breaking Changes

### Deprecations (v5.0, removed in v6.0)

The v4.x entity API remains available but deprecated:

```typescript
// Old (v4.2.1) - DO NOT USE for new code
const userHelpers = tree.entities<User>('users');
userHelpers.all(); // deprecated

// New (v5.0) - Use this instead
const store = signalTree({ users: entityMap(...) }).with(entities());
store.$.users.all();
```

**Migration Path:**

1. Replace `tree.entities<E>(path)` with `entityMap` in state definition
2. Add `.with(entities())` to the store
3. Access via `store.$.fieldName.method()` instead of `helpers.method()`
4. Run `npm run validate:all` to catch any type errors

## Bundle Size Impact

**Core package gzipped sizes (v5.0):**

- `@signaltree/core`: 27.95 KB (was ~28 KB in v4.2.1)
- `@signaltree/enterprise`: 7.81 KB
- `@signaltree/ng-forms`: 7.81 KB
- `@signaltree/callable-syntax`: 2.93 KB
- **Total ecosystem**: ~46 KB gzipped (down 15.9% vs separate-package layout)

**Optimizations enabled:**

- Map-based entity storage (native JS performance)
- Tree-shakeable enhancer exports
- Minimal PathNotifier overhead
- Eliminating duplicated dependencies

## Testing & Validation

All tests pass on Angular 20.3.x:

```bash
npm run test:all          # Full test suite
npm run validate:all      # Lint + tests + types + bundles
npm run build:all         # All packages
```

Performance benchmarks:

- Entity CRUD: sub-millisecond operations
- Recursive performance: 0.002–0.005 ms across 20+ nesting levels
- Subscriber scaling: 175–202 ms for 1000+ subscribers (expected)

## Recommended Update Path

1. Update dependencies: `npm install @signaltree/core@5.0.0`
2. Update demos and examples to use v5 API (see `apps/demo`)
3. Migrate entity code using provided migration guide
4. Run validation: `npm run validate:all`
5. Test in your environment with `npm link` or file protocol

## Support & Documentation

- 📖 **Getting Started:** `QUICK_START.md`
- 🔍 **API Reference:** `QUICK_REFERENCE.md`
- 📊 **Performance:** `docs/V5_ENTITY_PERFORMANCE_ANALYSIS.md`
- 🏗️ **Architecture:** `docs/ARCHITECTURE.md`
- 💡 **Examples:** `USAGE_EXAMPLES.md`

## Known Issues & Workarounds

None at this time. All v4.2.1 regressions resolved in v5.0.

---

For questions or feedback, open an issue on [GitHub](https://github.com/JBorgia/signaltree).

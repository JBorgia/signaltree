# SignalTree Core Extensions Proposal for Dev Tracing

## Overview

To enable high-quality dev tooling like the guardrails enhancer without runtime cost, we propose minimal additions to SignalTree core that expose dev-only hooks and metadata plumbing.

## Proposed Extensions

### 1. Dev Tracing Hooks (Zero Production Cost)

Add optional dev-only hooks that enhancers can subscribe to for observing state operations:

```typescript
// In core/src/lib/types.ts
export interface DevHooks {
  onRead?: (path: string, value: unknown) => void;
  onWrite?: (path: string, oldValue: unknown, newValue: unknown, metadata?: UpdateMetadata) => void;
  onComputeStart?: (id: string, dependencies: string[]) => void;
  onComputeEnd?: (id: string, duration: number, result: unknown) => void;
  onEffectRun?: (id: string, dependencies: string[]) => void;
  onSignalCreate?: (path: string) => void;
  onSignalDispose?: (path: string) => void;
  onRecomputation?: (path: string, trigger: string) => void;
}

// In tree implementation
export function signalTree<T>(initial: T, config?: TreeConfig): ISignalTree<T> {
  const tree = createTree(initial, config);

  // Only in dev builds
  if (__DEV__) {
    tree.__devHooks = createDevHooks();
  }

  return tree;
}

function createDevHooks(): DevHooks {
  const hooks: DevHooks = {};

  // Enhancers can patch these hooks
  return hooks;
}
```

**Implementation Strategy:**

- Wrap in `__DEV__` checks so they compile away in production
- Use empty stubs that enhancers can override
- Keep overhead minimal - just function calls, no complex logic

### 2. Update Metadata Plumbing

Allow metadata to flow through the update pipeline:

```typescript
// Extend update methods to accept metadata
export interface ISignalTree<T> {
  update(value: Partial<T>, metadata?: UpdateMetadata): void;
  $.set(path: Path, value: unknown, metadata?: UpdateMetadata): void;
}

export interface UpdateMetadata {
  // Core fields
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  timestamp?: number;
  correlationId?: string;

  // Enhancer-specific fields
  [key: string]: unknown;
}

// In middleware
export interface Middleware {
  pre?: (update: UpdateContext) => UpdateContext | void;
  post?: (update: UpdateContext, result: unknown) => unknown | void;
}

export interface UpdateContext {
  path: string;
  value: unknown;
  oldValue?: unknown;
  metadata?: UpdateMetadata;
  tree: ISignalTree<unknown>;
}
```

**Benefits:**

- Enhancers can communicate intent
- Enables "intent-aware" suppression of warnings
- Supports correlation of related updates
- No runtime cost if unused

### 3. Branch-Scoped Configuration for Core Enhancers

Add path filtering to existing enhancers:

```typescript
// Enhanced devtools options
export interface DevToolsOptions {
  name?: string;
  // NEW: Branch filtering
  include?: string[]; // Only include these paths
  exclude?: string[]; // Exclude these paths
  maxDepth?: number; // Limit depth
  sampleRate?: number; // 0-1 for sampling large branches
}

// Enhanced serialization options
export interface SerializationOptions {
  key?: string;
  storage?: Storage;
  debounce?: number;
  // NEW: Branch filtering
  include?: string[]; // Only persist these paths
  exclude?: string[]; // Never persist these paths
  transform?: (value: unknown, path: string) => unknown;
}

// Usage
const tree = signalTree(initial).with(
  devTools({
    include: ['ui', 'user'],
    exclude: ['cache', 'temp'],
  }),
  serialization({
    include: ['user', 'settings'],
    exclude: ['cache', 'internal'],
  })
);
```

**Implementation:**

- Use existing path matching utilities
- Filter during snapshot/restore operations
- Minimal overhead - just path checking

### 4. Subtree Lifecycle Management

Enable proper cleanup and ownership tracking:

```typescript
// New scope API for subtrees
export interface ISignalTree<T> {
  // Create a scoped subtree with lifecycle
  scope<K extends keyof T>(path: K, initializer?: () => T[K], options?: ScopeOptions): ScopedTree<T[K]>;
}

export interface ScopeOptions {
  disposable?: boolean; // Auto-dispose when parent disposes
  lazy?: boolean; // Create on first access
  isolated?: boolean; // Don't inherit parent enhancers
  onDispose?: () => void; // Cleanup callback
}

export interface ScopedTree<T> extends ISignalTree<T> {
  dispose(): void;
  isDisposed(): boolean;
  parent: ISignalTree<unknown>;
}

// Usage
const tree = signalTree({ features: {} });

// Create a scoped feature tree
const featureTree = tree.scope('features.dashboard', () => ({ data: [], config: {} }), {
  disposable: true,
  onDispose: () => console.log('Dashboard cleanup'),
});

// Later: dispose when feature unmounts
featureTree.dispose();
```

**Benefits:**

- Proper cleanup of feature-specific state
- Memory leak prevention
- Clear ownership semantics
- Enables per-feature enhancer composition

## Integration with Guardrails

With these extensions, the guardrails enhancer becomes much cleaner:

```typescript
export function guardrails(config: GuardrailsConfig): Enhancer {
  return (tree) => {
    if (!__DEV__) return tree;

    // Hook into dev tracing
    if (tree.__devHooks) {
      tree.__devHooks.onRead = (path, value) => {
        // Track read patterns for dependency analysis
        trackRead(path);
      };

      tree.__devHooks.onRecomputation = (path, trigger) => {
        // Count recomputations for budget checking
        incrementRecomputations(path, trigger);
      };

      tree.__devHooks.onSignalDispose = (path) => {
        // Track disposal for memory leak detection
        trackDisposal(path);
      };
    }

    // Intercept writes via path notifier/entity hooks (middleware removed)
    tree.pathNotifier?.subscribe((value, prev, path) => {
      analyzeUpdate({ path, value, prev });
      trackMetrics({ path, value, prev }, {});
    });
    return tree;
  };
}
```

## Implementation Timeline

### Phase 1: Core Hooks (Week 1)

- Add DevHooks interface
- Implement hook points in signal creation/disposal
- Add **DEV** gating

### Phase 2: Metadata Plumbing (Week 1)

- Extend update methods with metadata parameter
- Flow metadata through middleware
- Update type definitions

### Phase 3: Branch Filtering (Week 2)

- Add options to existing enhancers
- Implement path filtering logic
- Update documentation

### Phase 4: Scope API (Week 2-3)

- Design scope lifecycle
- Implement disposal tracking
- Add tests for cleanup

## Bundle Size Impact

All additions are dev-only or opt-in:

- Dev hooks: 0 bytes in production (compiled away)
- Metadata: ~200 bytes (only if used)
- Branch filtering: ~500 bytes (only in enhancers that use it)
- Scope API: ~1KB (only if used)

Total production impact for apps not using these features: **0 bytes**

## Breaking Changes

None. All additions are:

- Optional (existing code works unchanged)
- Backward compatible (new parameters have defaults)
- Tree-shakeable (unused features are removed)

## Migration Guide

No migration needed. Existing code continues to work. To adopt:

1. **For metadata:** Add metadata parameter to updates where needed
2. **For filtering:** Add include/exclude options to enhancer configs
3. **For scopes:** Use tree.scope() for feature-specific state
4. **For dev hooks:** Enhancers can check for and use tree.\_\_devHooks

## Testing Plan

### Unit Tests

- DevHooks called correctly in dev, absent in prod
- Metadata flows through pipeline
- Branch filtering works correctly
- Scope lifecycle and disposal

### Integration Tests

- Guardrails enhancer works with all hooks
- No performance regression
- Tree-shaking removes unused features

### Bundle Analysis

- Verify zero production cost
- Check dev build size increase (<5KB)

## Documentation Updates

### API Reference

- Document all new interfaces
- Add examples for each feature
- Show integration patterns

### Migration Guide

- "Adopting Dev Hooks" section
- "Using Metadata" guide
- "Branch Filtering" examples

### Best Practices

- When to use scopes
- Metadata conventions
- Performance considerations

## Conclusion

These minimal, focused extensions enable powerful dev tooling while maintaining SignalTree's core philosophy:

- Zero production cost
- Progressive enhancement
- Backward compatibility
- Tree-shakeable features

The changes are small in scope but high in impact, unlocking the ability to build sophisticated development tools like guardrails without compromising the production experience.

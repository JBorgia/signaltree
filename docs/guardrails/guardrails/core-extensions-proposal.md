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
export function signalTree<T>(initial: T, config?: TreeConfig): SignalTree<T> {
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

Implementation strategy:
- Wrap in `__DEV__` checks so they compile away in production
- Use empty stubs that enhancers can override
- Keep overhead minimal — just function calls, no complex logic

### 2. Update Metadata Plumbing

Allow metadata to flow through the update pipeline:

```typescript
export interface SignalTree<T> {
  update(value: Partial<T>, metadata?: UpdateMetadata): void;
  $.set(path: Path, value: unknown, metadata?: UpdateMetadata): void;
}

export interface UpdateMetadata {
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  timestamp?: number;
  correlationId?: string;
  [key: string]: unknown;
}

export interface Middleware {
  pre?: (update: UpdateContext) => UpdateContext | void;
  post?: (update: UpdateContext, result: unknown) => unknown | void;
}

export interface UpdateContext {
  path: string;
  value: unknown;
  oldValue?: unknown;
  metadata?: UpdateMetadata;
  tree: SignalTree<unknown>;
}
```

Benefits:
- Enhancers can communicate intent
- Enables intent-aware suppression of warnings
- Correlate related updates
- No runtime cost if unused

### 3. Branch-Scoped Configuration for Core Enhancers

Add path filtering to existing enhancers:

```typescript
export interface DevToolsOptions {
  name?: string;
  include?: string[];  // Only include these paths
  exclude?: string[];  // Exclude these paths
  maxDepth?: number;   // Limit depth
  sampleRate?: number; // 0-1 for sampling large branches
}

export interface SerializationOptions {
  key?: string;
  storage?: Storage;
  debounce?: number;
  include?: string[];  // Only persist these paths
  exclude?: string[];  // Never persist these paths
  transform?: (value: unknown, path: string) => unknown;
}
```

### 4. Subtree Lifecycle Management

```typescript
export interface SignalTree<T> {
  scope<K extends keyof T>(
    path: K,
    initializer?: () => T[K],
    options?: ScopeOptions
  ): ScopedTree<T[K]>;
}

export interface ScopeOptions {
  disposable?: boolean;
  lazy?: boolean;
  isolated?: boolean;
  onDispose?: () => void;
}

export interface ScopedTree<T> extends SignalTree<T> {
  dispose(): void;
  isDisposed(): boolean;
  parent: SignalTree<unknown>;
}
```

Benefits:
- Proper cleanup of feature-specific state
- Memory leak prevention
- Clear ownership semantics
- Enables per-feature enhancer composition

## Integration with Guardrails

```typescript
export function withGuardrails(config: GuardrailsConfig): Enhancer {
  return (tree) => {
    if (!__DEV__) return tree;
    
    if (tree.__devHooks) {
      tree.__devHooks.onRead = (path, value) => trackRead(path);
      tree.__devHooks.onRecomputation = (path, trigger) => incrementRecomputations(path, trigger);
      tree.__devHooks.onSignalDispose = (path) => trackDisposal(path);
    }
    
    return tree.with(withMiddleware({
      pre: (update) => { if (!update.metadata?.suppressGuardrails) analyzeUpdate(update); },
      post: (update, result) => { trackMetrics(update, result); }
    }));
  };
}
```

Production impact for apps not using these features: 0 bytes.

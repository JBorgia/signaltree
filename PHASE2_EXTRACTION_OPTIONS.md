# 12 Ways to Extract Phase 2 Performance Features

**Goal**: Keep `@signaltree/core` at 9KB, make performance features optional

---

## Approach 1: Separate Performance Package (Standard)

**Package Structure**:

```
@signaltree/core (9KB)
@signaltree/performance (2.4KB)
```

**Implementation**:

```typescript
// core/src/lib/signal-tree.ts - Remove Phase 2 features
export class SignalTree<T> {
  // Keep basic update()
  update(newValue: T): void {
    /* ... */
  }

  // Remove updateOptimized(), PathIndex integration
}

// performance/src/lib/index.ts
export { OptimizedUpdateEngine } from './update-engine';
export { DiffEngine } from './diff-engine';
export { PathIndex } from './path-index';

// performance/src/lib/enhancer.ts
export function withPerformance(): TreeEnhancer {
  return (tree) => {
    const engine = new OptimizedUpdateEngine(tree);
    tree.updateOptimized = (newValue, options) => {
      return engine.update(tree.root, newValue, options);
    };
    return tree;
  };
}
```

**Usage**:

```typescript
// Small apps - 9KB
import { signalTree } from '@signaltree/core';
const tree = signalTree(state);

// Large apps - 11.4KB
import { signalTree } from '@signaltree/core';
import { withPerformance } from '@signaltree/performance';

const tree = signalTree(state).with(withPerformance());
tree.updateOptimized(newState); // Now available
```

**Pros**: ✅ Clean separation, existing enhancer pattern
**Cons**: ⚠️ Requires refactoring, breaking change

---

## Approach 2: Dynamic Import (Code Splitting)

**Keep in Core, Lazy Load**:

```typescript
// core/src/lib/signal-tree.ts
export class SignalTree<T> {
  private _updateEngine?: OptimizedUpdateEngine;

  async updateOptimized(newValue: T, options?: UpdateOptions): Promise<UpdateResult> {
    // Dynamic import - only loads when called
    if (!this._updateEngine) {
      const { OptimizedUpdateEngine } = await import('./performance/update-engine');
      this._updateEngine = new OptimizedUpdateEngine(this.index);
    }
    return this._updateEngine.update(this.root, newValue, options);
  }
}
```

**Bundle Impact**:

- Initial load: 9KB
- After first `updateOptimized()` call: 11.4KB
- Never called: Stays 9KB (tree-shaken)

**Pros**: ✅ No breaking changes, automatic optimization
**Cons**: ⚠️ Async API, bundler dependency

---

## Approach 3: Plugin System

**Create Plugin Architecture**:

```typescript
// core/src/lib/plugin-system.ts
export interface SignalTreePlugin<T = any> {
  name: string;
  version: string;
  install(tree: SignalTree<T>): void | Promise<void>;
}

// core/src/lib/signal-tree.ts
export class SignalTree<T> {
  private plugins = new Map<string, SignalTreePlugin>();

  use(plugin: SignalTreePlugin<T>): this {
    plugin.install(this);
    this.plugins.set(plugin.name, plugin);
    return this;
  }
}

// performance/src/lib/plugin.ts
export const performancePlugin: SignalTreePlugin = {
  name: 'performance',
  version: '1.0.0',
  install(tree) {
    const engine = new OptimizedUpdateEngine(tree);
    tree.updateOptimized = (newValue, options) => {
      return engine.update(tree.root, newValue, options);
    };
  },
};
```

**Usage**:

```typescript
import { signalTree } from '@signaltree/core';
import { performancePlugin } from '@signaltree/performance';

const tree = signalTree(state).use(performancePlugin);
tree.updateOptimized(newState); // Available after plugin
```

**Pros**: ✅ Extensible, follows plugin patterns
**Cons**: ⚠️ New API pattern for SignalTree

---

## Approach 4: Conditional Import with Tree-Shaking

**Use Import Conditions**:

```typescript
// core/src/lib/signal-tree.ts
import type { OptimizedUpdateEngine } from './performance/update-engine';

export class SignalTree<T> {
  updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult {
    // Conditional require - tree-shaken if not used
    if (typeof this.updateOptimized === 'function') {
      const { OptimizedUpdateEngine } = require('./performance/update-engine');
      // ... use it
    }
    throw new Error('Performance features not loaded');
  }
}

// performance/index.ts - Separate entrypoint
export { OptimizedUpdateEngine } from './update-engine';
export { enablePerformance } from './enable';
```

**Package.json exports**:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./performance": "./src/performance/index.ts"
  }
}
```

**Usage**:

```typescript
// Without performance - 9KB
import { signalTree } from '@signaltree/core';

// With performance - 11.4KB
import { signalTree } from '@signaltree/core';
import { enablePerformance } from '@signaltree/core/performance';

enablePerformance(); // Patches SignalTree prototype
tree.updateOptimized(newState);
```

**Pros**: ✅ Single package, optional import
**Cons**: ⚠️ Prototype patching, less explicit

---

## Approach 5: Factory Pattern

**Different Factory Functions**:

```typescript
// core/src/lib/factories.ts
export function signalTree<T>(state: T): SignalTree<T> {
  return new SignalTree(state); // Basic, 9KB
}

export function signalTreeOptimized<T>(state: T): OptimizedSignalTree<T> {
  return new OptimizedSignalTree(state); // With performance, 11.4KB
}

// performance/src/lib/optimized-tree.ts
export class OptimizedSignalTree<T> extends SignalTree<T> {
  private engine: OptimizedUpdateEngine;

  constructor(state: T) {
    super(state);
    this.engine = new OptimizedUpdateEngine(this.index);
  }

  updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult {
    return this.engine.update(this.root, newValue, options);
  }
}
```

**Usage**:

```typescript
// Small apps - 9KB
import { signalTree } from '@signaltree/core';
const tree = signalTree(state);

// Large apps - 11.4KB
import { signalTreeOptimized } from '@signaltree/performance';
const tree = signalTreeOptimized(state);
tree.updateOptimized(newState);
```

**Pros**: ✅ Clear intent, type-safe
**Cons**: ⚠️ Two factory functions to maintain

---

## Approach 6: Capability Detection

**Progressive Enhancement**:

```typescript
// core/src/lib/signal-tree.ts
export class SignalTree<T> {
  get supportsOptimizedUpdates(): boolean {
    return typeof (this as any).updateOptimized === 'function';
  }

  update(newValue: T): void {
    // Basic update always available
  }
}

// performance/src/lib/augment.ts
import { SignalTree } from '@signaltree/core';

declare module '@signaltree/core' {
  interface SignalTree<T> {
    updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult;
  }
}

export function augmentWithPerformance() {
  SignalTree.prototype.updateOptimized = function (newValue, options) {
    // Implementation
  };
}
```

**Usage**:

```typescript
import { signalTree } from '@signaltree/core';

const tree = signalTree(state);

if (tree.supportsOptimizedUpdates) {
  tree.updateOptimized(newState); // Available
} else {
  tree.update(newState); // Fallback
}

// In performance-critical code
import { augmentWithPerformance } from '@signaltree/performance';
augmentWithPerformance(); // Adds method globally
```

**Pros**: ✅ Graceful degradation, feature detection
**Cons**: ⚠️ Global side effects

---

## Approach 7: Workspace Monorepo with Peer Dependencies

**Split into Separate npm Packages**:

```
@signaltree/core@4.0.0 (9KB)
@signaltree/performance@1.0.0 (2.4KB, peer: @signaltree/core@^4.0.0)
```

**Performance Package**:

```json
{
  "name": "@signaltree/performance",
  "peerDependencies": {
    "@signaltree/core": "^4.0.0"
  }
}
```

**Implementation**:

```typescript
// @signaltree/performance
import type { SignalTree } from '@signaltree/core';

export class PerformanceEnhancer<T> {
  constructor(private tree: SignalTree<T>) {}

  updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult {
    // Implementation
  }
}

export function enhance<T>(tree: SignalTree<T>): SignalTree<T> & {
  updateOptimized: PerformanceEnhancer<T>['updateOptimized'];
} {
  const enhancer = new PerformanceEnhancer(tree);
  return Object.assign(tree, {
    updateOptimized: enhancer.updateOptimized.bind(enhancer),
  });
}
```

**Usage**:

```typescript
import { signalTree } from '@signaltree/core';
import { enhance } from '@signaltree/performance';

const tree = enhance(signalTree(state));
tree.updateOptimized(newState); // TypeScript knows it exists
```

**Pros**: ✅ True separation, clear dependencies
**Cons**: ⚠️ More packages to publish/maintain

---

## Approach 8: Build-Time Feature Flags

**Use Environment Variables**:

```typescript
// core/src/lib/signal-tree.ts
export class SignalTree<T> {
  update(newValue: T): void { /* ... */ }

  // Only included if BUILD_PERFORMANCE=true
  ...(process.env.BUILD_PERFORMANCE === 'true' ? {
    updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult {
      // Implementation
    }
  } : {})
}
```

**Package.json scripts**:

```json
{
  "scripts": {
    "build": "BUILD_PERFORMANCE=false nx build core",
    "build:full": "BUILD_PERFORMANCE=true nx build core"
  }
}
```

**Publish Both Versions**:

```json
{
  "name": "@signaltree/core",
  "version": "4.0.0",
  "exports": {
    ".": "./fesm2022/signaltree-core.mjs",
    "./full": "./fesm2022/signaltree-core-full.mjs"
  }
}
```

**Usage**:

```typescript
// Minimal - 9KB
import { signalTree } from '@signaltree/core';

// Full featured - 11.4KB
import { signalTree } from '@signaltree/core/full';
```

**Pros**: ✅ Single package, multiple builds
**Cons**: ⚠️ Build complexity, confusing exports

---

## Approach 9: Decorator/Mixin Pattern

**Composable Mixins**:

```typescript
// core/src/lib/mixins/performance.ts
export function PerformanceMixin<T extends Constructor<SignalTree<any>>>(Base: T) {
  return class extends Base {
    private engine?: OptimizedUpdateEngine;

    updateOptimized(newValue: any, options?: UpdateOptions): UpdateResult {
      if (!this.engine) {
        this.engine = new OptimizedUpdateEngine(this.index);
      }
      return this.engine.update(this.root, newValue, options);
    }
  };
}

// Usage without performance
import { SignalTree } from '@signaltree/core';
const tree = new SignalTree(state);

// Usage with performance
import { SignalTree } from '@signaltree/core';
import { PerformanceMixin } from '@signaltree/performance';

const PerformantTree = PerformanceMixin(SignalTree);
const tree = new PerformantTree(state);
tree.updateOptimized(newState);
```

**Pros**: ✅ Composable, TypeScript-friendly
**Cons**: ⚠️ Uncommon pattern in JS ecosystem

---

## Approach 10: Proxy-Based Feature Addition

**Transparent Enhancement**:

```typescript
// performance/src/lib/proxy-enhancer.ts
export function createPerformantTree<T>(state: T): SignalTree<T> {
  const baseTree = signalTree(state);
  const engine = new OptimizedUpdateEngine(baseTree.index);

  return new Proxy(baseTree, {
    get(target, prop) {
      if (prop === 'updateOptimized') {
        return (newValue: T, options?: UpdateOptions) => {
          return engine.update(target.root, newValue, options);
        };
      }
      return target[prop];
    },
  }) as SignalTree<T> & { updateOptimized: typeof engine.update };
}
```

**Usage**:

```typescript
// Without performance - 9KB
import { signalTree } from '@signaltree/core';
const tree = signalTree(state);

// With performance - 11.4KB
import { createPerformantTree } from '@signaltree/performance';
const tree = createPerformantTree(state);
tree.updateOptimized(newState); // Proxied through
```

**Pros**: ✅ No modification to core, transparent
**Cons**: ⚠️ Proxy overhead, debugging complexity

---

## Approach 11: Configuration-Based Loading

**Runtime Configuration**:

```typescript
// core/src/lib/config.ts
export interface SignalTreeConfig {
  features: {
    performance?: boolean;
    devtools?: boolean;
  };
}

// core/src/lib/factory.ts
export function signalTree<T>(state: T, config?: SignalTreeConfig): SignalTree<T> {
  const tree = new SignalTree(state);

  if (config?.features?.performance) {
    // Lazy load performance module
    import('./performance').then((mod) => {
      mod.enablePerformance(tree);
    });
  }

  return tree;
}
```

**Usage**:

```typescript
// Minimal - 9KB
const tree = signalTree(state);

// With performance - 11.4KB (loaded async)
const tree = signalTree(state, {
  features: { performance: true },
});

// Later...
await tree.whenReady(); // Wait for dynamic imports
tree.updateOptimized(newState);
```

**Pros**: ✅ Flexible, centralized config
**Cons**: ⚠️ Async initialization complexity

---

## Approach 12: Secondary Entry Points with Facade

**Multiple Package Exports**:

```typescript
// packages/core/src/index.ts (main export - 9KB)
export { SignalTree } from './lib/signal-tree';
export { signalTree } from './lib/factory';

// packages/core/src/performance.ts (secondary export - +2.4KB)
export * from './lib/enterprise/path-index';
export * from './lib/enterprise/diff-engine';
export * from './lib/enterprise/update-engine';
export { signalTreePerformant } from './lib/enterprise-factory';

// packages/core/src/lib/enterprise-factory.ts
import { SignalTree } from './signal-tree';
import { OptimizedUpdateEngine } from './performance/update-engine';

export function signalTreePerformant<T>(state: T): SignalTree<T> {
  const tree = signalTree(state);
  const engine = new OptimizedUpdateEngine(tree.index);

  (tree as any).updateOptimized = (newValue: T, options?: UpdateOptions) => {
    return engine.update(tree.root, newValue, options);
  };

  return tree as SignalTree<T> & {
    updateOptimized(newValue: T, options?: UpdateOptions): UpdateResult;
  };
}
```

**Package.json**:

```json
{
  "name": "@signaltree/core",
  "exports": {
    ".": {
      "types": "./src/index.d.ts",
      "default": "./fesm2022/signaltree-core.mjs"
    },
    "./performance": {
      "types": "./src/performance.d.ts",
      "default": "./fesm2022/signaltree-core-performance.mjs"
    }
  }
}
```

**Usage**:

```typescript
// Minimal - 9KB
import { signalTree } from '@signaltree/core';
const tree = signalTree(state);

// With performance - 11.4KB
import { signalTreePerformant } from '@signaltree/core/performance';
const tree = signalTreePerformant(state);
tree.updateOptimized(newState);
```

**Pros**: ✅ Single package, clear imports, tree-shakeable
**Cons**: ⚠️ Export map complexity, bundler support needed

---

## 📊 Comparison Matrix

| Approach                | Bundle Control | Migration Effort | Complexity | Tree-Shakeable | Recommendation      |
| ----------------------- | -------------- | ---------------- | ---------- | -------------- | ------------------- |
| 1. Separate Package     | ⭐⭐⭐⭐⭐     | ⭐⭐             | ⭐⭐⭐     | ⭐⭐⭐⭐⭐     | 🏆 Best for v4.0    |
| 2. Dynamic Import       | ⭐⭐⭐⭐       | ⭐⭐⭐⭐⭐       | ⭐⭐⭐⭐   | ⭐⭐⭐⭐       | ⭐ Quick win        |
| 3. Plugin System        | ⭐⭐⭐⭐       | ⭐⭐⭐           | ⭐⭐⭐     | ⭐⭐⭐⭐       | ⭐ Future-proof     |
| 4. Conditional Import   | ⭐⭐⭐         | ⭐⭐⭐⭐         | ⭐⭐⭐⭐   | ⭐⭐⭐         | ⚠️ Tricky           |
| 5. Factory Pattern      | ⭐⭐⭐⭐       | ⭐⭐⭐⭐         | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐       | ⭐ Clean API        |
| 6. Capability Detection | ⭐⭐⭐         | ⭐⭐⭐⭐         | ⭐⭐⭐     | ⭐⭐⭐         | ⚠️ Side effects     |
| 7. Peer Dependencies    | ⭐⭐⭐⭐⭐     | ⭐⭐             | ⭐⭐       | ⭐⭐⭐⭐⭐     | 🏆 Best separation  |
| 8. Build Flags          | ⭐⭐⭐         | ⭐⭐⭐⭐         | ⭐⭐       | ⭐⭐           | ⚠️ Build complexity |
| 9. Decorator/Mixin      | ⭐⭐⭐⭐       | ⭐⭐⭐           | ⭐⭐⭐     | ⭐⭐⭐⭐       | ⚠️ Uncommon         |
| 10. Proxy-Based         | ⭐⭐⭐⭐       | ⭐⭐⭐⭐⭐       | ⭐⭐⭐     | ⭐⭐⭐⭐       | ⚠️ Debugging issues |
| 11. Config-Based        | ⭐⭐⭐         | ⭐⭐⭐⭐         | ⭐⭐       | ⭐⭐⭐         | ⚠️ Async complexity |
| 12. Secondary Exports   | ⭐⭐⭐⭐⭐     | ⭐⭐⭐⭐         | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐     | 🏆 Best of both     |

---

## 🎯 Top 3 Recommendations

### 🥇 #1: Separate Package (Approach 1 + 7)

**Best for**: v4.0 major release

```typescript
// @signaltree/core@4.0.0 (9KB)
import { signalTree } from '@signaltree/core';

// @signaltree/performance@1.0.0 (2.4KB)
import { withPerformance } from '@signaltree/performance';

const tree = signalTree(state).with(withPerformance());
```

**Why**: Clean separation, clear intent, follows existing enhancer pattern

---

### 🥈 #2: Secondary Exports (Approach 12)

**Best for**: Maintaining single package

```typescript
// Minimal
import { signalTree } from '@signaltree/core';

// Performance
import { signalTreePerformant } from '@signaltree/core/performance';
```

**Why**: Single package, tree-shakeable, clear imports, no breaking changes to core

---

### 🥉 #3: Dynamic Import (Approach 2)

**Best for**: Quick implementation, no API changes

```typescript
// Stays 9KB until first call
const tree = signalTree(state);

// Lazy loads performance module
await tree.updateOptimized(newState);
```

**Why**: Zero breaking changes, automatic optimization, easiest to implement

---

## 💡 My Recommendation

**Combine Approach 12 (Secondary Exports) + Approach 2 (Dynamic Import)**:

```typescript
// packages/core/src/index.ts - 9KB
export { signalTree } from './lib/factory';

// packages/core/src/performance.ts - Secondary export
export { signalTreePerformant } from './lib/enterprise-factory';
export * from './lib/enterprise/index';

// lib/signal-tree.ts
class SignalTree<T> {
  async updateOptimized(newValue: T, options?: UpdateOptions): Promise<UpdateResult> {
    // Dynamic import - only loads if called
    const { OptimizedUpdateEngine } = await import('./performance/update-engine');
    // ... implementation
  }
}
```

**Benefits**:

- ✅ Core stays 9KB for most users
- ✅ Power users can import from `@signaltree/core/performance`
- ✅ Dynamic import provides automatic optimization
- ✅ Tree-shakeable if `updateOptimized()` never called
- ✅ No breaking changes to existing API

**Migration Path**:

1. Phase 1: Add dynamic imports (v3.1.0)
2. Phase 2: Add secondary exports (v3.2.0)
3. Phase 3: Consider separate package (v4.0.0)

Would you like me to implement any of these approaches?

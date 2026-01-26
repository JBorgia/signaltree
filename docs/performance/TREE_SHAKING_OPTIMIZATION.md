# Tree-Shaking Optimization Guide

## Current Status ✅

Tree-shaking **already works effectively** for @signaltree/core:

- Modern bundlers correctly eliminate unused enhancers
- Barrel imports (`from '@signaltree/core'`) are fully tree-shakeable
- Core-only apps: ~8.5 KB gzipped (verified via testing)

## Optimization Opportunities

### 1. **Production Console Removal** (Potential: -1-2 KB)

**Issue**: Core contains 20+ `console.warn()` calls for helpful dev warnings that bloat production bundles.

**Current**:

```typescript
// packages/core/src/lib/signal-tree.ts
if (!tree.batchUpdate) {
  console.warn(SIGNAL_TREE_MESSAGES.BATCH_NOT_ENABLED);
}
```

**Optimization**:

```typescript
// Use conditional compilation or terser's drop_console
if (__DEV__) {
  console.warn(SIGNAL_TREE_MESSAGES.BATCH_NOT_ENABLED);
}
```

**Implementation Options**:

A. **Build-time constant replacement**:

```typescript
// Add to tsconfig build
declare const __DEV__: boolean;

// In code
if (__DEV__) {
  console.warn(...);
}

// Build script replaces __DEV__ with false for production
// Dead code elimination removes the entire if block
```

B. **Terser configuration** (easier, immediate):

```json
{
  "compress": {
    "drop_console": true,
    "pure_funcs": ["console.warn", "console.log"]
  }
}
```

**Files to optimize**:

- `packages/core/src/lib/signal-tree.ts` (20+ warnings)
- `packages/core/src/lib/utils.ts` (3+ warnings)
- `packages/core/src/enhancers/**/*.ts` (dev warnings)

### 2. **Split Security Validator** (Potential: -2-3 KB for apps not using security)

**Issue**: Security validator is always imported, even if unused.

**Current**:

```typescript
// packages/core/src/index.ts
export { SecurityValidator, SecurityPresets } from './lib/security/security-validator';
```

**Optimization**: Create subpath export

```json
// packages/core/package.json
"exports": {
  "./security": {
    "import": "./dist/lib/security/index.js",
    "types": "./dist/lib/security/index.d.ts"
  }
}
```

**Usage**:

```typescript
// Tree-shakeable: only imported when actually used
import { SecurityValidator } from '@signaltree/core/security';
```

### 3. **Lazy Load Memory Manager** (Potential: -1 KB for non-lazy trees)

**Issue**: Memory manager code included even when `useLazySignals: false`.

**Current**: Always bundled with core
**Optimization**: Conditional import or separate chunk

```typescript
// Instead of direct import
const memoryManager = config.useLazySignals ? await import('./lib/memory/memory-manager') : null;
```

### 4. **Pure Annotations for Better DCE** (Potential: -500 bytes)

**Issue**: Some helper functions might not be marked as side-effect-free.

**Add `/*@__PURE__*/` annotations**:

```typescript
// Before
export const createEnhancer = (meta, fn) => { ... }

// After
export const createEnhancer = /*@__PURE__*/ (meta, fn) => { ... }
```

**Target functions**:

- `composeEnhancers`
- `createEnhancer`
- `resolveEnhancerOrder`
- Utility helpers in `utils.ts`

### 5. **Split Constants** (Potential: -1 KB for minimal apps)

**Issue**: Error messages bundle includes all strings even if unused.

**Current**:

```typescript
// All messages imported together
export const SIGNAL_TREE_MESSAGES = {
  BATCH_NOT_ENABLED: '...',
  MEMOIZE_NOT_ENABLED: '...',
  // 20+ messages
};
```

**Optimization**: Per-feature message constants

```typescript
// Only bundle messages for features you use
export const BATCH_MESSAGES = { ... };
export const MEMOIZE_MESSAGES = { ... };
```

### 6. **Remove Development-Only Type Exports** (Potential: -0 KB but cleaner)

**Current**: Some internal types are exported but only used in tests.

**Audit exports**:

```typescript
// packages/core/src/index.ts
// Remove if only used internally or in tests:
export type { EnhancerMeta, ChainResult } from './lib/types';
```

## Recommended Implementation Priority

### Phase 1: Quick Wins (Immediate, ~2-3 KB savings)

1. ✅ Enable terser `drop_console` for production builds
2. ✅ Add `/*@__PURE__*/` annotations to enhancer factories
3. ✅ Create security subpath export

### Phase 2: Architectural (Next release, ~2-4 KB savings)

4. ⏳ Implement `__DEV__` constant for conditional warnings
5. ⏳ Split constants by feature
6. ⏳ Lazy-load memory manager for non-lazy configs

### Phase 3: Polish (Future, marginal gains)

7. ⏳ Audit and minimize type exports
8. ⏳ Further granular subpath exports if needed

## Build Configuration Examples

### ESBuild (recommended)

```javascript
// esbuild.config.js
{
  minify: true,
  drop: ['console', 'debugger'],
  pure: ['console.log', 'console.warn'],
  define: {
    '__DEV__': 'false'
  }
}
```

### Webpack 5

```javascript
// webpack.config.js
{
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            pure_funcs: ['console.log', 'console.warn'],
          },
        },
      }),
    ];
  }
}
```

### Vite

```javascript
// vite.config.js
{
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        pure_funcs: ['console.warn']
      }
    }
  }
}
```

## Testing Tree-Shaking

Run the verification script:

```bash
npm run test:tree-shaking
```

Or manually test:

```bash
# Build a minimal app
npx esbuild test.ts --bundle --minify --drop:console

# Check what's included
cat bundle.js | grep -o 'batching\|memoization' | sort | uniq
```

## Expected Bundle Sizes (Production, gzipped)

| Usage Pattern      | Current | Optimized (Phase 1) | Optimized (Phase 2) |
| ------------------ | ------- | ------------------- | ------------------- |
| Core only          | 8.5 KB  | **7.0 KB**          | **6.0 KB**          |
| Core + 1 enhancer  | 9.3 KB  | **7.8 KB**          | **6.8 KB**          |
| Core + 3 enhancers | 12 KB   | **10.5 KB**         | **9.5 KB**          |
| Full features      | 27 KB   | **25 KB**           | **23 KB**           |

## Contributing

When adding new features:

1. ✅ Mark factory functions with `/*@__PURE__*/`
2. ✅ Use `if (__DEV__)` for warnings (once implemented)
3. ✅ Add feature to subpath exports if >2 KB
4. ✅ Avoid side effects in module scope
5. ✅ Test tree-shaking with the verification script

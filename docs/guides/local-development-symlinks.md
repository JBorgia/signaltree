# Local Development Symlink Issue: Dual Angular Instance Problem

## Executive Summary

When using `pnpm link` or similar symlink-based local development workflows with SignalTree, Angular's `isSignal()` function may return `false` for SignalTree's signals, causing `effect()` and `computed()` to not properly track signal dependencies.

**This issue does NOT occur when installing SignalTree from npm.**

## Root Cause

### The Symbol Identity Problem

Angular uses `Symbol('SIGNAL')` internally to identify signals. When code does:

```typescript
import { signal, isSignal } from '@angular/core';

const mySignal = signal(0);
isSignal(mySignal); // true - checks for Symbol('SIGNAL')
```

Angular's `isSignal()` checks if the function has a specific `Symbol('SIGNAL')` property attached. **Crucially, each JavaScript module instantiation of `@angular/core` creates a NEW unique symbol:**

```typescript
// In @angular/core (simplified)
const SIGNAL = Symbol('SIGNAL'); // Unique per module load!

export function signal<T>(value: T): WritableSignal<T> {
  const s = () => value;
  s[SIGNAL] = true; // Attach the symbol
  return s;
}

export function isSignal(value: unknown): boolean {
  return typeof value === 'function' && SIGNAL in value;
}
```

### How Symlinks Cause Duplication

When you use `pnpm link`:

```
consumer-app/
├── node_modules/
│   ├── @angular/core@20.2.3     ← Consumer's Angular
│   └── @signaltree/core → SYMLINK → /path/to/signaltree/dist/packages/core
│                                      ↑
│                                      bundler follows symlink
│                                      ↓
signaltree/
├── node_modules/
│   └── @angular/core@20.3.11    ← SignalTree's Angular (DIFFERENT!)
```

The bundler (Vite/esbuild) follows the symlink and resolves `@angular/core` from SignalTree's `node_modules`. This results in:

- **Two different `@angular/core` module instances** loaded at runtime
- **Two different `Symbol('SIGNAL')` values**
- SignalTree signals have Symbol A, but consumer app checks for Symbol B
- `isSignal()` returns `false` for SignalTree signals

### Impact on Angular Reactivity

When `isSignal()` returns `false`, Angular's reactive system breaks:

1. **`effect()`** does not register the signal as a dependency
2. **`computed()`** does not track the signal
3. The signal's value updates work, but **no reactive propagation occurs**
4. UI components don't re-render when SignalTree signals change

## Diagnostic Output

When this issue occurs, you'll see output like:

```
[DEBUG] Native Angular computed: [Function]
[DEBUG] isSignal(native computed): true
[DEBUG] Native computed symbols: [Symbol(SIGNAL)]

[DEBUG] $.loading.state: [Function]
[DEBUG] isSignal($.loading.state): false     ← THE BUG
[DEBUG] $.loading.state symbols: [Symbol(SIGNAL)]  ← Has a SIGNAL, but different instance!
```

Both have a `Symbol(SIGNAL)`, but they are **different symbol instances**.

## Solutions

### 1. Install from npm (Recommended)

```bash
# Remove the symlink
pnpm remove @signaltree/core

# Install from npm registry
pnpm add @signaltree/core@5.1.2
```

When installed from npm, the package files exist directly in the consumer's `node_modules/`, so `@angular/core` imports resolve from the consumer's `node_modules/` - ensuring a single Angular instance.

### 2. Match Angular Versions

If you need local development with symlinks, ensure both workspaces use the **exact same Angular version**:

```bash
# Check SignalTree's Angular version
cd /path/to/signaltree
grep '"@angular/core"' package.json  # e.g., "20.3.11"

# Update consumer to match
cd /path/to/consumer-app
pnpm add @angular/core@20.3.11 @angular/common@20.3.11 # ... etc
```

### 3. Use pnpm Overrides

Force the consumer to provide Angular to the linked package:

```yaml
# consumer-app/pnpm-workspace.yaml or package.json
pnpm:
  overrides:
    '@angular/core': '20.3.11'
```

### 4. Configure Bundler Dedupe

For Vite-based builds, configure deduplication:

```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    dedupe: ['@angular/core', '@angular/common'],
  },
});
```

## Verification

After applying a fix, verify with debug logging:

```typescript
import { computed, isSignal } from '@angular/core';

// In your SignalTree store initialization:
const testSignal = computed(() => 'test');
console.log('isSignal(native):', isSignal(testSignal)); // Should be: true
console.log('isSignal(signaltree):', isSignal($.loading.state)); // Should be: true (was false!)
```

## Why npm Install Works

| Installation Method     | Resolution Path                                                                        | Result                       |
| ----------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| **pnpm link (symlink)** | Bundler follows symlink → resolves from SignalTree's `node_modules/`                   | **Two Angular instances** ❌ |
| **npm/pnpm install**    | Package files in consumer's `node_modules/` → resolves from consumer's `node_modules/` | **One Angular instance** ✅  |

## Related Files

- Demo test component: `apps/demo/src/app/examples/features/fundamentals/examples/effect-reactivity-test/`
- Core signal creation: `packages/core/src/lib/signal-tree.ts`
- Entity signals: `packages/core/src/lib/entity-signal.ts`

## Timeline of Discovery

1. v3 app reported "empty dropdowns" with SignalTree integration
2. Initial diagnosis suspected zoneless mode or entity API issues
3. Created test component in demo app - worked correctly
4. Discovered demo uses TypeScript source paths, v3 uses dist via symlink
5. Added diagnostic logging: `isSignal($.loading.state): false`
6. Identified dual `Symbol('SIGNAL')` as root cause
7. Confirmed npm install resolves the issue

## Key Takeaways

1. **SignalTree core is correct** - the issue is purely a packaging/linking artifact
2. **Symlinks can cause module duplication** - especially with singleton dependencies like Angular
3. **Always test with npm-installed packages** before investigating "bugs"
4. **Symbol identity matters** - two `Symbol('SIGNAL')` values are never equal, even if they have the same description

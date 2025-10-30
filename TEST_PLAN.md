# Comprehensive Test Plan for SignalTree Library

## Overview

This test plan covers all aspects of the SignalTree library after the async enhancer migration. Tests are organized by category with specific commands and expected outcomes.

## Critical Issues to Address First

### 1. TS6305: @signaltree/shared Package Not Compiled
**Status**: ❌ Blocking rollup builds
**Issue**: TypeScript can't find compiled declaration files for @signaltree/shared
**Impact**: Rollup builds fail with type resolution errors

**Fix Commands**:
```bash
# Build shared package first
cd packages/shared
npx nx build shared --configuration=production
cd ../..

# Then build core
npx nx build core --configuration=production
```

### 2. Entities Enhancer Build Hanging
**Status**: ❌ Blocking rollup builds
**Issue**: Rollup hangs indefinitely on entities enhancer
**Possible Causes**: Circular dependency, infinite loop, or memory issue

**Debug Commands**:
```bash
# Try building entities alone
npx rollup -c packages/core/rollup.config.js --input packages/core/src/enhancers/entities/index.ts

# Check for circular imports
npx madge --circular packages/core/src/enhancers/entities/lib/entities.ts

# Increase memory and try again
NODE_OPTIONS="--max-old-space-size=4096" npx rollup -c packages/core/rollup.config.js
```

### 3. Bundle Analysis Script Incompatible
**Status**: ❌ Scripts expect rollup bundles, current build uses Nx TypeScript
**Issue**: `npm run analyze:bundle` expects `dist/packages/*/fesm2022/*.mjs` files
**Impact**: Bundle size analysis won't work with current build output

**Workaround Commands**:
```bash
# Use rollup directly to create bundles for analysis
cd packages/core
npx rollup -c rollup.config.js

# Then run analysis
cd ../..
npm run analyze:bundle

# Alternative: Manual size checking
find dist/packages -name "*.js" -exec wc -c {} \; | sort -n
gzip -c dist/packages/core/src/index.js | wc -c
```

## 1. Unit Tests

**Status**: ✅ Ready to run
**Purpose**: Verify individual components work correctly

### Commands:

```bash
# Run all unit tests
npm run test:all

# Run core tests only
npm run test:core

# Run specific enhancer tests
npx nx test batching
npx nx test memoization
npx nx test middleware
npx nx test serialization

# Skip entities if hanging
npx nx test entities  # May hang - see issue #2 above
```

**Expected**: All tests pass (268+ tests across packages)

## 2. Integration Tests

**Status**: ✅ Ready to run
**Purpose**: Verify components work together

### Commands:

```bash
# Test core with multiple enhancers
npx nx test core --testNamePattern="integration"

# Test middleware async helpers
npx nx test middleware --testNamePattern="async"
```

**Expected**: Integration tests pass, middleware async helpers work correctly

## 3. Build Tests

**Status**: ⚠️ Issues with rollup (see critical issues above)
**Purpose**: Ensure all packages compile successfully

### Commands:

```bash
# Build all packages (Nx build - works)
npm run build:packages

# Build core specifically (Nx build - works)
npx nx build core --configuration=production

# Build individual packages (Nx build - works)
npx nx build batching --configuration=production
npx nx build memoization --configuration=production
npx nx build middleware --configuration=production

# Rollup builds (currently broken - see issues #1 & #2)
cd packages/core
npx rollup -c rollup.config.js  # May fail due to shared/entities issues
```

**Expected**: All builds succeed without TypeScript errors

## 4. Demo App Tests

**Status**: ❌ Has multiple issues
**Purpose**: Verify demo app compiles and runs

### Known Issues:
- TypeScript errors: `tree.state` is of type 'unknown'
- Missing imports: `@signaltree/batching`, `@signaltree/memoization`, etc.
- Time-travel component missing `@signaltree/time-travel`

### Commands:

```bash
# Build demo app (will fail due to missing packages)
npm run build:demo

# Serve demo app (will fail)
npm run dev

# Run demo tests (may work if packages exist)
npm run test:demo
```

**Expected**: After fixes, demo builds and runs without errors

## 5. Type Checking

**Status**: ✅ Ready to run
**Purpose**: Ensure TypeScript types are correct

### Commands:

```bash
# Type check all packages
npx nx run-many -t build --all

# Type check specific packages
npx tsc --noEmit --project packages/core/tsconfig.lib.json
```

**Expected**: No TypeScript errors

## 6. Linting

**Status**: ✅ Ready to run
**Purpose**: Code quality checks

### Commands:

```bash
# Lint all packages
npm run lint:all

# Lint core only
npm run lint:core

# Auto-fix linting issues
npm run lint:fix:all
```

**Expected**: No linting errors or warnings

## 7. Bundle Size Analysis

**Status**: ❌ Needs fixes (see critical issue #3)
**Purpose**: Measure gzipped bundle sizes and validate tree-shaking

### Current Issues:
- `npm run analyze:bundle` expects rollup bundles in `dist/packages/*/fesm2022/*.mjs`
- Current build uses Nx TypeScript compiler, not rollup
- Rollup config exists but has issues (shared package, entities hanging)

### Commands to Fix:

```bash
# Step 1: Fix shared package build (issue #1)
cd packages/shared
npx nx build shared --configuration=production
cd ../..

# Step 2: Fix entities hanging (issue #2)
# Try increasing memory or check for circular deps
NODE_OPTIONS="--max-old-space-size=4096" npx rollup -c packages/core/rollup.config.js

# Step 3: Create rollup bundles
cd packages/core
npx rollup -c rollup.config.js

# Step 4: Run bundle analysis
cd ../..
npm run analyze:bundle
```

### Alternative Bundle Analysis (works with current build):

```bash
# Use source-map-explorer on demo build (once demo builds)
npx source-map-explorer dist/apps/demo/browser/*.js

# Manual size checks
echo "Core bundle sizes:"
find dist/packages/core -name "*.js" -exec wc -c {} \; | sort -n

echo "Enhancer bundle sizes:"
find dist/packages/core/src/enhancers -name "*.js" -exec wc -c {} \; | sort -n

echo "Gzipped core bundle:"
gzip -c dist/packages/core/src/index.js | wc -c

echo "Total packages size:"
du -sh dist/packages/*/
```

**Expected**: Core bundle < 12KB gzipped, individual enhancers < 3KB each

## 8. Performance Benchmarks

**Status**: ✅ Ready to run (but may need updates)
**Purpose**: Measure memory usage and update performance

### Commands:

```bash
# Run performance suite
npm run perf:run

# Run benchmark exports
npm run automation:export

# Run specific benchmarks
npx nx test core --testNamePattern="performance"
```

**Expected**: Benchmarks complete, memory optimizations validated

## 9. Tree-shaking Validation

**Status**: ❌ Needs implementation
**Purpose**: Test selective imports work correctly

### Commands:

```javascript
// Create test files for different import patterns
// Test 1: Import only core
import { create } from '@signaltree/core';

// Test 2: Import core + one enhancer
import { create } from '@signaltree/core';
import { withBatching } from '@signaltree/core/enhancers/batching';

// Test 3: Import multiple enhancers
import { create } from '@signaltree/core';
import { withBatching } from '@signaltree/core/enhancers/batching';
import { withMemoization } from '@signaltree/core/enhancers/memoization';
import { withMiddleware } from '@signaltree/core/enhancers/middleware';
```

### Validation Steps:

1. Create rollup bundles for each import pattern
2. Compare bundle sizes
3. Ensure unused enhancers aren't included

**Expected**: Bundle size increases proportionally with imports

## 10. Async Middleware Verification

**Status**: ✅ Ready to run
**Purpose**: Verify middleware replaces async enhancer functionality

### Commands:

```bash
# Test middleware async helpers
npx nx test middleware --testNamePattern="async"

# Manual verification
node -e "
import { create } from './dist/packages/core/src/index.js';
import { withMiddleware } from './dist/packages/core/src/enhancers/middleware/index.js';
import { createAsyncOperation, trackAsync } from './dist/packages/core/src/enhancers/middleware/lib/async-helpers.js';

const tree = create({ loading: false, data: null }, [withMiddleware()]);
console.log('Async middleware imports successful');
"
```

**Expected**: Middleware async helpers work without async enhancer

## Test Execution Order (Recommended)

1. **Fix Critical Issues First**:
   - Build shared package
   - Fix entities hanging issue
   - Update build process for rollup bundles

2. **Basic Validation**:
   - Unit Tests
   - Type Checking & Linting
   - Build Tests (Nx builds)

3. **Integration & Functionality**:
   - Integration Tests
   - Async Middleware Verification

4. **Bundle & Performance**:
   - Bundle Size Analysis (after fixes)
   - Tree-shaking Validation
   - Performance Benchmarks

5. **End-to-End**:
   - Demo App Tests (after package fixes)

## Success Criteria

- ✅ All unit tests pass (268+ tests)
- ✅ All packages build successfully (Nx and rollup)
- ✅ No TypeScript or linting errors
- ✅ Demo app compiles and runs
- ✅ Bundle sizes meet targets (<12KB core, <3KB enhancers)
- ✅ Tree-shaking reduces bundle sizes appropriately
- ✅ Performance benchmarks show optimizations work
- ✅ Middleware async helpers replace async enhancer functionality

## Quick Diagnostic Commands

```bash
# Check current build status
npm run quality:simple

# Check for circular dependencies
npx madge --circular packages/core/src/

# Check bundle sizes manually
find dist/packages -name "*.js" -exec ls -lh {} \;

# Verify middleware async functionality
npx nx test middleware --testNamePattern="async"
```

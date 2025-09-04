# Bundle Size Optimization Checklist

## Before Adding New Features

- [ ] Check current package size: `npm run size:report`
- [ ] Review size targets for your package
- [ ] Consider size impact of new dependencies
- [ ] Plan for tree-shaking compatibility

## During Development

- [ ] Use production imports (avoid development-only code in production builds)
- [ ] Minimize console statements (remove debug logs)
- [ ] Avoid convenience wrapper functions without clear value
- [ ] Use TypeScript for better optimization opportunities
- [ ] Test tree-shaking with your changes

## Code Review Checklist

- [ ] No debug console statements in production code
- [ ] No redundant exports or re-exports
- [ ] No unused functions or variables
- [ ] Proper TypeScript types for tree-shaking
- [ ] Dependencies are necessary and lightweight

## Before Merging

- [ ] Run full test suite: `npx nx run-many --target=test`
- [ ] Check bundle sizes: `npm run size:check`
- [ ] All packages pass size validation
- [ ] No regressions in bundle analysis report
- [ ] Demo app builds successfully: `npx nx build demo`

## Common Optimizations

### ✅ Good Practices

```typescript
// Direct imports for better tree-shaking
import { specificFunction } from '@signaltree/core';

// Minimal exports
export { coreFunction, CoreType };

// Production-ready code
function productionFunction() {
  // Optimized implementation
}
```

### ❌ Avoid

```typescript
// Barrel imports (can hurt tree-shaking)
import * as SignalTree from '@signaltree/core';

// Debug code in production
console.debug('Development info:', data);

// Unnecessary convenience wrappers
export const enableFeature = (opts) => withFeature(opts);
```

## Size Targets (as of current optimization)

| Package       | Target | Current | Status |
| ------------- | ------ | ------- | ------ |
| core          | 8.00KB | 7.25KB  | ✅     |
| batching      | 1.50KB | 1.27KB  | ✅     |
| serialization | 5.00KB | 4.62KB  | ✅     |
| middleware    | 1.50KB | 1.38KB  | ✅     |
| async         | 2.00KB | 1.85KB  | ✅     |
| entities      | 2.50KB | 2.23KB  | ✅     |
| devtools      | 2.00KB | 1.78KB  | ✅     |
| memoization   | 1.50KB | 1.31KB  | ✅     |
| ng-forms      | 3.00KB | 2.67KB  | ✅     |
| presets       | 1.00KB | 0.89KB  | ✅     |
| time-travel   | 2.50KB | 2.14KB  | ✅     |

## Quick Commands

```bash
# Size check (exit code 0/1 for CI)
npm run size:check

# Full report with recommendations
npm run size:report

# Test affected packages
npx nx affected --target=test

# Build demo app
npx nx build demo
```

## Emergency Size Fixes

If a package exceeds its target:

1. **Identify culprit**: `git diff` recent changes
2. **Quick wins**: Remove console statements, unused imports
3. **Measure impact**: Run `npm run size:report` after each change
4. **Test thoroughly**: `npx nx test <package>`
5. **Update targets if justified**: Edit `scripts/consolidated-bundle-analysis.js`

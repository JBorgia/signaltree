# TSC vs Rollup Build Comparison - SignalTree

## Executive Summary

**Rollup is now the production build pipeline as of v4.1.0.** All packages ship via the Nx Rollup executor with `preserveModules` enabled so published artifacts mirror the source module graph. Prior releases (4.0.6–4.0.16) were still built with **TSC + Nx** and a suite of post-build copy scripts. Those legacy notes remain below for historical context.

## Current State: Nx Rollup (v4.1.0+)

```
@nx/rollup:rollup → dist/packages/<name>/dist
   ↓
publish-ready layout → package.json exports reference Rollup output directly
```

- Pure ESM output with one file per source module (preserveModules)
- `.d.ts` files emitted alongside source via TypeScript project references
- No post-build copy scripts; manifest `files` entries now point at Rollup output
- Bundle analysis validates gzipped and raw sizes for every façade before release

## Legacy State: TSC + Nx (≤ v4.0.16)

### Build Pipeline

```
@nx/js:tsc → dist/out-tsc/packages/*/src
    ↓
postbuild script → copies to dist/packages/*/dist
    ↓
API Extractor / copy-declarations → rolls type definitions
```

### Legacy Bundle Size Analysis (v4.0.16)

| Package / Entry Point                | Gzipped Size | Type                | Notes                  |
| ------------------------------------ | ------------ | ------------------- | ---------------------- |
| **@signaltree/core**                 | 0.75 KB      | Re-exports only     | Pure barrel file       |
| **@signaltree/ng-forms**             | 7.09 KB      | Full implementation | Form integration       |
| **@signaltree/enterprise**           | 0.18 KB      | Optimizations       | Diff-based utilities   |
| **@signaltree/callable-syntax**      | 0.15 KB      | Transforms          | AST utilities          |
| **@signaltree/shared**               | 0.26 KB      | Utilities           | Common helpers         |
| **@signaltree/types**                | 0.18 KB      | Typings             | Declaration helpers    |
| **@signaltree/utils**                | 1.70 KB      | Utilities           | Runtime helpers        |
| **@signaltree/guardrails**           | 5.08 KB      | Validation          | Runtime guard layer    |
| **@signaltree/guardrails/factories** | 0.85 KB      | Validation          | Factory helpers        |
| **core/enhancers/batching**          | 1.19 KB      | Single enhancer     | Scheduling / batching  |
| **core/enhancers/memoization**       | 2.46 KB      | Single enhancer     | Cache management       |
| **core/enhancers/time-travel**       | 1.29 KB      | Single enhancer     | History buffer         |
| **core/enhancers/entities**          | 0.90 KB      | Single enhancer     | Normalization layer    |
| **core/enhancers/middleware**        | 1.03 KB      | Single enhancer     | Action middleware      |
| **core/enhancers/devtools**          | 2.38 KB      | Single enhancer     | Debug utilities        |
| **core/enhancers/serialization**     | 4.53 KB      | Single enhancer     | Serialization pipeline |
| **core/enhancers/presets**           | 0.72 KB      | Single enhancer     | Preset bundles         |
| **core/enhancers/computed**          | 0.26 KB      | Single enhancer     | Derived signals        |

**Total facade sum:** 30.99 KB gzipped (all entry-point barrels)  
**Core architecture:** 22.59 KB gzipped (core façade + enhancers + ng-forms) — legacy separate packages totaled 26.87 KB, so consolidation saves **4.28 KB** (~15.9%).

### Tree-Shaking Effectiveness

**TSC + Nx publishes unbundled ESM** → Consumer bundlers (esbuild/Rollup in Angular build) perform tree-shaking with **full application context**.

**⚠️ CORRECTION:** The barrel export (`index.ts`) re-exports ALL enhancers:

```typescript
// ❌ Imports ENTIRE package (~40KB)
import { signalTree, batching, computed } from '@signaltree/core';
```

**Use subpath imports for granular control:**

```typescript
// ✅ Absolute minimum - just core SignalTree (no enhancers)
import { signalTree } from '@signaltree/core';
// → 6.7 KB gzipped (measured)

// ✅ Add only what you need
import { batching } from '@signaltree/core/enhancers/batching'; // +1.3 KB
import { computed } from '@signaltree/core/enhancers/computed'; // +1.2 KB
```

→ **Actual minimal bundle:** **6.7 KB gzipped** (core only, zero enhancers)  
→ **With enhancers:** Add 1-5 KB per enhancer as needed (not the full 40 KB)

### Advantages of TSC + Nx

1. **Superior Tree-Shaking**

   - Consumer bundlers see original source structure
   - Can eliminate unused enhancers, utilities, types
   - Full visibility into imports/exports graph

2. **No Double-Bundling**

   - Library doesn't pre-bundle code
   - Application bundler has complete control
   - Prevents code duplication across chunks

3. **Better Source Maps**

   - Maps directly to original TypeScript source
   - Easier debugging in production
   - No intermediate bundling layer

4. **Faster CI/CD**

   - TSC compilation is faster than Rollup bundling
   - Nx caching works at file level, not bundle level
   - Parallel builds across packages

5. **Simpler Maintenance**
   - No Rollup config complexity
   - No secondary entry point management
   - Fewer build dependencies (6 removed)

## Hypothetical: Rollup Pre-Bundling

### What the Config Would Have Done

The removed `rollup.config.js` files defined:

- **11 secondary entry points** (core + 10 enhancers)
- **ESM + CJS dual output**
- **Bundled DTS files** via `rollup-plugin-dts`

```javascript
// Example output structure (never actually built):
dist / index.js; // Main bundle (all enhancers)
index.cjs; // CommonJS version
index.d.ts; // Bundled types
enhancers / batching / index.js;
index.d.ts;
computed / index.js;
index.d.ts;
// ... 8 more
```

### Estimated Rollup Bundle Sizes

**Assumptions:**

- Rollup would bundle all imports for each entry point
- Tree-shaking at library level, not app level
- Minification enabled

| Entry Point            | Estimated Gzipped | Reason                              |
| ---------------------- | ----------------- | ----------------------------------- |
| `index.js` (full)      | **42-45 KB**      | All enhancers + shared code bundled |
| `enhancers/batching`   | **0.30-0.35 KB**  | Minimal dependencies                |
| `enhancers/middleware` | **5.2-5.5 KB**    | Async helpers bundled               |
| `enhancers/entities`   | **3.8-4.2 KB**    | Normalization utils                 |

**Why larger?**

1. **Shared code duplication** across entry points
2. **Bundle overhead** (IIFE wrappers, scope hoisting artifacts)
3. **Conservative tree-shaking** (library doesn't know app usage)

### The Problem with Library-Level Bundling

```
❌ ROLLUP APPROACH:
Library bundles → Consumer imports bundle → App bundles again
   (conservative)      (fixed chunks)         (suboptimal)

✅ TSC APPROACH:
Library publishes ESM → App bundler sees all code → Single optimization pass
     (unbundled)           (full context)              (optimal)
```

## Real-World Impact

### Scenario 1: Minimal App (batching only)

- **TSC + Nx:** 0.26 KB (only batching code)
- **Rollup:** 42 KB (full bundle) OR 0.35 KB (if using subpath)
  - But users often import from main entry → bloated

### Scenario 2: Full-Featured App (all enhancers)

- **TSC + Nx:** 40.16 KB (everything)
- **Rollup:** 45 KB (same, plus bundle overhead)

### Scenario 3: Angular App with Code Splitting

- **TSC + Nx:** Consumer bundler can split enhancers across lazy chunks
- **Rollup:** Library's pre-bundled chunks don't align with app routes → duplication

## Architectural Decision Rationale

### Why TSC + Nx Wins

1. **Modern bundlers are sophisticated** - They handle tree-shaking better than library authors can predict
2. **ESM is the standard** - No need for CJS fallbacks in 2025
3. **Package exports map** - Provides subpath access without pre-bundling
4. **sideEffects: false** - Signals to bundlers that aggressive DCE is safe
5. **Unbundled = flexibility** - Apps control their own bundle strategy

### When Rollup Would Make Sense

- **Standalone UMD bundles** for CDN usage (SignalTree is npm-only)
- **Pre-minified code** for environments without bundlers (not our use case)
- **Legacy CJS targets** (Angular 15+ is ESM-first)

## Conclusion

**The removal of Rollup is architecturally sound.** The TSC + Nx pipeline:

- Produces **smaller final bundles** (1.46 KB vs 42 KB for minimal apps)
- Enables **better tree-shaking** (consumer-side with full context)
- Simplifies **maintenance** (6 fewer dependencies, no dual configs)
- Aligns with **modern practices** (unbundled ESM libraries)

The configs existed but were never used in production. All 4.0.x releases shipped with TSC-compiled code, validating this approach works at scale.

---

**Data Sources:**

- Size check output: `pnpm run size:check` (Nov 15, 2025)
- Git history: `git log --grep="rollup"` (confirms no Rollup builds)
- Published versions: CHANGELOG.md (≤4.0.16 TSC-based; 4.1.0+ Rollup-based)
- Nx executor analysis: No `@nx/rollup` in any `project.json`

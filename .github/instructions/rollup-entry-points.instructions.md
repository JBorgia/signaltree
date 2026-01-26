---
applyTo: 'packages/*/project.json'
---

# Nx Rollup additionalEntryPoints - Filename Collision Issue

## The Problem

When using `@nx/rollup:rollup` executor with `additionalEntryPoints`, if multiple entry points have the **same filename** (e.g., all named `index.ts`), Rollup will output them with the same name, causing files to overwrite each other.

### Example of the Problem

```json
// project.json - THIS CAUSES PROBLEMS
{
  "build": {
    "executor": "@nx/rollup:rollup",
    "options": {
      "main": "packages/events/src/index.ts",
      "additionalEntryPoints": [
        "packages/events/src/nestjs/index.ts",   // Output: index.esm.js
        "packages/events/src/angular/index.ts",  // Output: index.esm.js (OVERWRITES!)
        "packages/events/src/testing/index.ts"   // Output: index.esm.js (OVERWRITES!)
      ]
    }
  }
}
```

**Result**: Only one `index.esm.js` survives. The other subpaths are broken.

## The Solution

Create uniquely-named barrel files at the package root that re-export from the subdirectory:

### 1. Create Barrel Files

```typescript
// packages/events/src/nestjs.ts
/**
 * @signaltree/events/nestjs
 * Re-export barrel for NestJS integration.
 */
export * from './nestjs/index';
```

```typescript
// packages/events/src/angular.ts
export * from './angular/index';
```

```typescript
// packages/events/src/testing.ts
export * from './testing/index';
```

### 2. Update project.json

```json
{
  "build": {
    "executor": "@nx/rollup:rollup",
    "options": {
      "main": "packages/events/src/index.ts",
      "additionalEntryPoints": [
        "packages/events/src/nestjs.ts",   // Output: nestjs.esm.js ✓
        "packages/events/src/angular.ts",  // Output: angular.esm.js ✓
        "packages/events/src/testing.ts"   // Output: testing.esm.js ✓
      ]
    }
  }
}
```

### 3. Update package.json exports

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.esm.js"
    },
    "./nestjs": {
      "types": "./nestjs.d.ts",
      "import": "./nestjs.esm.js"
    },
    "./angular": {
      "types": "./angular.d.ts",
      "import": "./angular.esm.js"
    },
    "./testing": {
      "types": "./testing.d.ts",
      "import": "./testing.esm.js"
    }
  }
}
```

## Symptoms of This Issue

- `dist/` folder appears empty or missing expected files
- Only main entry point works, subpaths fail to resolve
- `npm pack --dry-run` shows fewer files than expected
- TypeScript errors: `Module '"package/subpath"' has no exported member 'X'`

## Verification

After building, verify all entry points exist:

```bash
ls dist/packages/events/*.esm.js
# Should show: index.esm.js, nestjs.esm.js, angular.esm.js, testing.esm.js
```

## Packages Using This Pattern

- `@signaltree/events` - nestjs, angular, testing subpaths

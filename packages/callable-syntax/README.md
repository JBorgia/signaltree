## @signaltree/callable-syntax

Zero-runtime callable syntax transform for SignalTree. Enables elegant developer experience that compiles away completely.

### What It Does

```typescript
// You write (with great DX):
tree.$.user.name('Alice');
tree.$.count((n) => n + 1);

// Transform converts to (zero overhead):
tree.$.user.name.set('Alice');
tree.$.count.update((n) => n + 1);

// Getters work unchanged:
const name = tree.$.user.name();
```

### Installation

```bash
npm install @signaltree/core
npm install -D @signaltree/callable-syntax
```

**Key**: Install as dev dependency since it's a build-time tool only.

### Setup for Teams

#### Angular Projects

> **⚠️ Not currently supported on Angular 20+.** The setup below requires the
> legacy `@angular-devkit/build-angular:browser` webpack builder via
> `@angular-builders/custom-webpack`. Modern Angular uses the esbuild-based
> `@angular/build:application` builder, which exposes no supported plugin hook:
> its schema has no `plugins` option, the experimental `codePlugins` passthrough
> runs *after* Angular's compiler plugin has already claimed every `.ts` file
> (so a user plugin receives none of them), and ngtsc's transformer list is
> hardcoded. This was verified against a real build. Until this is resolved,
> treat the transform as unavailable for Angular applications.

```typescript
// angular.json - add to build options (legacy webpack builder only)
{
  "build": {
    "options": {
      "customWebpackConfig": {
        "path": "./webpack.extra.js"
      }
    }
  }
}
```

```javascript
// webpack.extra.mjs
import { SignalTreeSyntaxWebpackPlugin } from '@signaltree/callable-syntax/webpack';

export default {
  plugins: [new SignalTreeSyntaxWebpackPlugin()],
};
```

#### Vite Projects

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { signalTreeSyntaxTransform } from '@signaltree/callable-syntax/vite';

export default defineConfig({
  plugins: [signalTreeSyntaxTransform()],
});
```

### Development Workflow

The transform only affects build output - your TypeScript will still type-check correctly with callable syntax because SignalTree includes the necessary type augmentations.

```typescript
import { signalTree } from '@signaltree/core';

const store = signalTree({
  todos: [] as Todo[],
  filter: 'all' as 'all' | 'active' | 'completed',
});

// TypeScript understands both forms:
store.$.todos(newTodos); // Callable syntax (transforms away)
store.$.todos.set(newTodos); // Direct syntax (stays as-is)

// Getters always stay the same:
const currentTodos = store.$.todos();
```

### Production Build

In production builds, only direct Angular signal calls remain - no runtime overhead, no wrapper functions, no Proxy objects. The callable syntax is purely developer experience sugar.

```

### TypeScript

No per-file imports required in this repo. Types are loaded via root `tsconfig`:

- `@signaltree/core` defines callable `NodeAccessor<T>`.
- Leaves are callable `WritableSignal`s at the type level for consistent DX.
  If you’re consuming externally, include `@signaltree/callable-syntax/augmentation` in your `compilerOptions.types`.

### Configuration Options

| Option          | Description                                 | Default                                         |
| --------------- | ------------------------------------------- | ----------------------------------------------- | -------- | --------- |
| include         | Files to include (RegExp)                   | /src/.\*\.(t                                    | j)sx?$/  |
| exclude         | Files to exclude (RegExp)                   | /node_modules                                   | \.spec\. | \.test\./ |
| rootIdentifiers | Root variable names containing a SignalTree | ['tree'] (exported as DEFAULT_ROOT_IDENTIFIERS) |
| debug           | Log transformed counts                      | false                                           |

### Notes

- Pure dev-time; adds 0 bytes to production bundle.
- Does not modify runtime; you can mix standard `.set()` / `.update()` calls freely.
- **NOT a safe fallback.** If the transform does not run, a callable write is a
  SILENT NO-OP, not an error: a leaf is an Angular signal, and calling a signal
  with an argument returns the current value and ignores the argument. Nothing
  throws and nothing is written. Verify the transform actually runs in every
  build configuration you ship.

### License

Business Source License 1.1 (BSL-1.1) – converts to MIT on Change Date per root project license.
```

```

```

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

```typescript
// angular.json - add to build options
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
- Safe fallback: if plugin absent, callable writes just become runtime errors you can catch in CI (recommend lint rule if enforcing).

### License

Business Source License 1.1 (BSL-1.1) – converts to MIT on Change Date per root project license.
```

```

```

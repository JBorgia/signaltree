## @signaltree/syntax-transform

Zero-runtime optional syntax transform for SignalTree that lets you write:

```ts
tree.$.user.name('Alice'); // set -> transformed to .set('Alice')
tree.$.user.age((a) => a + 1); // update -> transformed to .update(...)
const name = tree.$.user.name(); // getter unchanged
```

### Why

Unified callable syntax without wrapping Angular signals or adding runtime overhead.

### Installation

```bash
pnpm add -D @signaltree/syntax-transform
```

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { signalTreeSyntaxTransform } from '@signaltree/syntax-transform/vite';

export default defineConfig({
  plugins: [signalTreeSyntaxTransform()],
});
```

### Webpack

```ts
// webpack.config.js
const { SignalTreeSyntaxWebpackPlugin } = require('@signaltree/syntax-transform/webpack');

module.exports = {
  plugins: [new SignalTreeSyntaxWebpackPlugin()],
};
```

### TypeScript Augmentation (Optional IntelliSense)

Add once in your app entry:

```ts
import '@signaltree/syntax-transform/augmentation';
```

### Configuration Options

| Option          | Description                                 | Default       |
| --------------- | ------------------------------------------- | ------------- | -------- | --------- |
| include         | Files to include (RegExp)                   | /src/.\*\.(t  | j)sx?$/  |
| exclude         | Files to exclude (RegExp)                   | /node_modules | \.spec\. | \.test\./ |
| rootIdentifiers | Root variable names containing a SignalTree | ['tree']      |
| debug           | Log transformed counts                      | false         |

### Notes

- Pure dev-time; adds 0 bytes to production bundle.
- Does not modify runtime; you can mix standard `.set()` / `.update()` calls freely.
- Safe fallback: if plugin absent, callable writes just become runtime errors you can catch in CI (recommend lint rule if enforcing).

### License

Business Source License 1.1 (BSL-1.1) – converts to MIT on Change Date per root project license.

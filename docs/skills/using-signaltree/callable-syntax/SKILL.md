---
name: signaltree-callable-syntax
description: Guides AI agents enabling the optional build-time @signaltree/callable-syntax transform that lets `tree.$.field(value)` desugar to `.set(value)` and `tree.$.count(n => n + 1)` desugar to `.update(n => n + 1)`. Covers Webpack and Vite plugin configuration. Triggers on @signaltree/callable-syntax, SignalTreeSyntaxWebpackPlugin, signalTreeSyntaxTransform, Vite plugin, Webpack plugin, callable API sugar, set/update shorthand, build-time transform.
---

# Using @signaltree/callable-syntax

## When to use this package

Reach for `@signaltree/callable-syntax` when a team prefers `tree.$.count(5)` over `tree.$.count.set(5)` and `tree.$.count(n => n + 1)` over `tree.$.count.update(n => n + 1)` — shorter ergonomics at no runtime cost. The transform runs at build time, ships **zero bytes** to the browser, and is strictly opt-in: the same code compiles and runs identically without it, because every call site is rewritten to the canonical `.set()` / `.update()` form before emit. Skip it if the team is happy with explicit `.set()` / `.update()` or if adding another build-step plugin is not worth the DX win.

## Install

```bash
npm install --save-dev @signaltree/callable-syntax
```

Peer range (from `peerDependencies`): `@angular/core ^20`. The package bundles its Babel deps (`@babel/parser`, `@babel/traverse`, `@babel/generator`, `@babel/types`) internally, so no extra Babel install is required in the consuming project.

## Mental model

The plugin is a straight Babel-powered AST transform with two rules:

- `tree.$.leaf(value)` where `value` is not a function → `tree.$.leaf.set(value)`
- `tree.$.leaf(fn)` where `fn` is a `FunctionExpression` or `ArrowFunctionExpression` → `tree.$.leaf.update(fn)`

Calls that do not match (template literals, method chains, arbitrary object calls) are left untouched. The transform is scoped by configurable `rootIdentifiers` so only variables the team names as tree roots (default includes common names like `tree`, `store`) get rewritten — random `foo.$.bar(x)` in unrelated code is not touched.

There are three build integrations: a Webpack plugin class, a Vite plugin factory, and the raw `transformCode` function for custom build pipelines. Because the transform runs on already-emitted source (Webpack) or on the input pipeline (Vite), it works regardless of whether the code is authored in TypeScript, tsx, or plain JS.

## Core usage

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { signalTreeSyntaxTransform } from '@signaltree/callable-syntax/vite';

export default defineConfig({
  plugins: [
    signalTreeSyntaxTransform({
      include: /src\/.*\.(t|j)sx?$/,
      exclude: /node_modules|\.spec\.|\.test\./,
      rootIdentifiers: ['tree', 'store', 'state'],
      debug: false,
    }),
  ],
});
```

### Webpack

```ts
// webpack.config.ts
import { SignalTreeSyntaxWebpackPlugin } from '@signaltree/callable-syntax/webpack';
import type { Configuration } from 'webpack';

const config: Configuration = {
  // ...
  plugins: [
    new SignalTreeSyntaxWebpackPlugin({
      test: /src\/.*\.(t|j)sx?$/,
      exclude: /node_modules|\.spec\.|\.test\./,
      rootIdentifiers: ['tree', 'store', 'state'],
      debug: false,
    }),
  ],
};

export default config;
```

### What the transform does

```ts
// Authored
tree.$.count(5);
tree.$.count(n => n + 1);
tree.$.user.name('Ada');

// Emitted (after transform)
tree.$.count.set(5);
tree.$.count.update(n => n + 1);
tree.$.user.name.set('Ada');
```

Non-matching calls are left alone:

```ts
tree.$.items.push(item);           // unchanged — `.push` is a method
doSomething(tree.$.count());       // unchanged — reading the signal
tree.update(s => ({ ...s, x: 1 })); // unchanged — tree-level update
```

## Advanced / less-obvious

- **Type augmentation for the sugar.** Import the augmentation module once (e.g., at the top of your `polyfills.ts` or `app.config.ts`) to tell TypeScript that a callable signal also accepts a value or updater:

  ```ts
  import '@signaltree/callable-syntax/augmentation';
  ```

  Without the augmentation, TypeScript will still complain about `tree.$.count(5)` even though the transform would rewrite it at build time. The augmentation is a pure type-only import.

- **`rootIdentifiers` is a whitelist, not a prefix match.** If one feature module names its tree `userStore` and another names it `cartStore`, list both. There is no glob support; it is a simple identifier-name check against the AST.

- **Works without the plugin.** The package is designed so source that uses the callable form continues to work when the plugin is absent — as long as you have the augmentation imported — because SignalTree's leaf signals are already callable for reads. Writes would fall through to a normal function call and throw at runtime, though, so never ship production code that relies on the transform without enabling it in that build.

- **Testing.** Jest and Vitest do not run the plugin by default. Either enable the plugin in test config or keep test code on explicit `.set()` / `.update()` — the latter is usually simpler.

- **Raw `transformCode`.** For custom pipelines (esbuild, SWC pre-processor, Nx executor), import `transformCode` from `@signaltree/callable-syntax` and wire it into your own loader.

## Gotchas

- Always emit exactly one plugin instance per build. Running the transform twice is idempotent on canonical `.set()` / `.update()` output, but doubles the parse cost.
- The plugin reads from `src/**/*.{ts,tsx,js,jsx}` by default. Library packages whose source is under `packages/*/src/` need their own plugin entry or an adjusted `include`/`test` regex.
- `.spec.` and `.test.` files are excluded by default. If your test harness needs the sugar, override `exclude`.
- Dynamic property access like `tree.$[key](value)` is **not** rewritten — the transform only matches static property access.
- Because the Webpack plugin hooks `emit`, it runs after other loaders. Make sure no later loader re-parses and drops the rewritten output.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.

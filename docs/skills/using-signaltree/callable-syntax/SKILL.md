---
name: signaltree-callable-syntax
description: Guides AI agents enabling the optional build-time @signaltree/callable-syntax transform that lets `tree.$.field(value)` desugar to `.set(value)` and `tree.$.count(n => n + 1)` desugar to `.update(n => n + 1)`. Covers Webpack and Vite plugin configuration. Triggers on @signaltree/callable-syntax, SignalTreeSyntaxWebpackPlugin, signalTreeSyntaxTransform, Vite plugin, Webpack plugin, callable API sugar, set/update shorthand, build-time transform.
---

# Using @signaltree/callable-syntax

Use when a team prefers `tree.$.count(5)` over `tree.$.count.set(5)`. Build-time Babel AST transform — zero runtime bytes. Skip if team is fine with explicit `.set()` / `.update()`.

Install (dev dependency):

```bash
npm install --save-dev @signaltree/callable-syntax
```

Peer: `@angular/core ^20`. Babel deps (`@babel/parser`, `@babel/traverse`, `@babel/generator`, `@babel/types`) bundled internally — don't install separately.

Transform rules:
- Rule A: `tree.$.leaf(value)` where `value` is not a fn → `tree.$.leaf.set(value)`
- Rule B: `tree.$.leaf(fn)` where `fn` is `FunctionExpression` or `ArrowFunctionExpression` → `tree.$.leaf.update(fn)`

Non-matching calls left unchanged. Scoped by `rootIdentifiers` — only variables matching the whitelist are candidates.

Vite:

```ts
// vite.config.ts
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

Webpack:

```ts
// webpack.config.ts
import { SignalTreeSyntaxWebpackPlugin } from '@signaltree/callable-syntax/webpack';
const config = {
  plugins: [
    new SignalTreeSyntaxWebpackPlugin({
      test: /src\/.*\.(t|j)sx?$/,
      exclude: /node_modules|\.spec\.|\.test\./,
      rootIdentifiers: ['tree', 'store', 'state'],
      debug: false,
    }),
  ],
};
```

What the transform does:

```ts skip
// Authored
tree.$.count(5);
tree.$.count(n => n + 1);
tree.$.user.name('Ada');

// Emitted
tree.$.count.set(5);
tree.$.count.update(n => n + 1);
tree.$.user.name.set('Ada');
```

Non-matching (unchanged):

```ts skip
tree.$.items.push(item);            // method — not rewritten
doSomething(tree.$.count());        // read — not rewritten
tree.update(s => ({ ...s, x: 1 })); // tree-level — not rewritten
```

Type augmentation — import once (e.g., `polyfills.ts` or `app.config.ts`):

```ts
import '@signaltree/callable-syntax/augmentation';
```

Without this, TypeScript errors on `tree.$.count(5)` even when the plugin is active. Type-only import, no runtime output.

`rootIdentifiers`: exact-name whitelist, not prefix or glob. **Default is `['tree']` only** — if your store variable is named `store`, `state`, `userStore`, `cartStore`, etc., you MUST pass `rootIdentifiers: ['tree', 'store', 'state', ...]` to the plugin or those call sites are silently skipped.

Testing: Jest and Vitest don't run the plugin by default. Prefer explicit `.set()` / `.update()` in tests; override `exclude` only when testing the transform itself.

Custom pipelines: import `transformCode` from `@signaltree/callable-syntax` and wire into your loader.

Gotchas:
- Exactly one plugin instance per build — two instances doubles parse cost.
- Library packages under `packages/*/src/` need their own `include`/`test` regex entry.
- Dynamic property access `tree.$[key](value)` is not rewritten — static access only.
- Webpack plugin hooks `emit` (after other loaders) — ensure no later loader drops rewritten output.
- Never ship callable-write syntax in production without the plugin enabled; writes fall through to no-op reads.

Related: `using-signaltree` (root), `spec-auditing`, `compression`

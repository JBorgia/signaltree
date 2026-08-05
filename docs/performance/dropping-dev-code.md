# Dropping SignalTree's dev-only code in production

SignalTree ships dev-mode guardrails — the `ST2001`/`ST2002`/`ST2003`/`ST2007`
warnings that catch entity-id collisions, foreign-library method calls, no-op
writes, and dropped derived values. They're advisory: useful while writing code,
useless at runtime in production.

**By default they ship to production anyway.** One line in your build config
removes them, worth **~0.8–1.2 KB gzip** of SignalTree's own code.

## Why they don't drop on their own

Every guardrail sits behind `ngDevMode`:

```ts
if (typeof ngDevMode === 'undefined' || ngDevMode) {
  console.warn(`[SignalTree] [ST2003] …`);
}
```

`ngDevMode` is a **runtime global** that Angular assigns — not a compile-time
constant your bundler substitutes in library code. So the condition is
unresolvable at build time: a minifier can't prove it false, keeps the branch,
and the message strings stay in the output.

The `typeof … === 'undefined' || …` shape is deliberate — it defaults to
*warnings on*, so a plain `<script>` or an unusual toolchain still gets the
diagnostics. The cost of that default is that removal has to be opt-in.

## The fix, by bundler

Define `ngDevMode` as `false` and the whole family folds away.

**Angular** (`angular.json` / `project.json`, `@angular/build` application
builder). Angular's `define` explicitly applies to library code:

```jsonc
{
  "configurations": {
    "production": {
      "define": { "ngDevMode": "false" }
    }
  }
}
```

**Vite**

```ts
export default defineConfig(({ mode }) => ({
  define: mode === 'production' ? { ngDevMode: 'false' } : {},
}));
```

**esbuild**

```js
await build({ define: { ngDevMode: 'false' } });
```

**webpack**

```js
plugins: [new webpack.DefinePlugin({ ngDevMode: false })];
```

Keep it to production configurations. Defining it `false` in development silences
the guardrails you actually want.

## Measured

esbuild, minified, gzip, SignalTree's own code only (Angular/rxjs/tslib
external) — the same methodology as the bundle-budget gate:

| Tree | Default | `ngDevMode: false` | Saved |
|---|---|---|---|
| bare `signalTree()` | 5.86 KB | 5.05 KB | **0.82 KB** |
| with `stored()` | 7.19 KB | 6.23 KB | **0.96 KB** |
| with `form()` | 7.96 KB | 7.00 KB | **0.96 KB** |
| with `entityMap()` | 8.76 KB | 7.61 KB | **1.15 KB** |
| with `persistence()` | 8.55 KB | 7.69 KB | **0.86 KB** |

Re-measured for 13.4.0. The saving grew because that release added four
traversal diagnostics (`ST2008`–`ST2012`) on paths every tree reaches, and made
the debug logging in `persistence()`/devtools/memory-manager foldable — it was
guarded only by a runtime flag before, so its message strings shipped
unconditionally.

Reproduce with `node tools/check-devmode-foldable.mjs`, or measure a scenario
directly the way the budget gate does (`node scripts/v9-budget-checks.js`).

**The guard must be inline to fold.** Writing
`const DEV = typeof ngDevMode === 'undefined' || ngDevMode;` and testing `DEV`
does *not* get folded by esbuild — the const survives minification and the
guarded strings ship anyway. Verified empirically; use the full expression at
each site.

## What does NOT go away, deliberately

Defining `ngDevMode: false` removes **advisory warnings**. It does not remove
**thrown-error messages** — the `ST1xxx` family plus `ST2004`/`ST2005`/`ST2006`,
which reject a raw `load:` function, a marker with conflicting async validators,
and a raw `history` config respectively.

Those stay on purpose. An exception whose message is an opaque integer is useless
in a production stack trace or a bug report, so `constants.ts` keeps one table
for both modes (`PROD_MESSAGES = DEV_MESSAGES`) with each string under ~25
characters. An earlier attempt at numeric-only codes was abandoned for exactly
that reason.

So the honest summary: **advisory prose is removable, error identity is not.**
Don't expect the `[ST` codes to vanish from a production bundle entirely — and if
they did, your next production stack trace would be worse.

## Keeping this true

`tools/check-devmode-foldable.mjs` runs in `pre-publish-validation.sh`. It builds
each target twice and fails if defining `ngDevMode: false` stops shrinking the
output, or if any advisory code survives it. That catches the regression where
someone writes a gate the bundler can't fold — `if (isDev())`, a helper call,
anything that isn't a bare `ngDevMode` comparison — which would silently charge
every consumer for prose they can no longer remove.

When adding an `ST2xxx` code, update `WARN_ONLY_CODES` in that tool: advisory
warning → add it, thrown error → leave it out.

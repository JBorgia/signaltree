# Dropping SignalTree's dev-only code in production

SignalTree ships dev-mode guardrails — the `ST2001`/`ST2002`/`ST2003`/`ST2007`
warnings that catch entity-id collisions, foreign-library method calls, no-op
writes, and dropped derived values. They're advisory: useful while writing code,
useless at runtime in production.

**By default they ship to production anyway.** One line in your build config
removes them, worth **~0.5–0.9 KB gzip** of SignalTree's own code.

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
| bare `signalTree()` | 5.55 KB | 5.04 KB | **0.52 KB** |
| with `entityMap()` | 8.48 KB | 7.61 KB | **0.87 KB** |
| with `form()` | 7.69 KB | 7.00 KB | **0.68 KB** |

Reproduce with `node tools/check-devmode-foldable.mjs`.

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

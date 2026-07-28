# Upgrading to SignalTree 13.2

13.2 carries **one behavior change** plus one type-level improvement.

> **Read this if you use `signalForm()`.** `nativeErrors` now defaults to `true`,
> so built-in validator failures bridged into Angular Signal Forms arrive as
> Angular's branded error classes instead of plain `{ kind, message }` objects.
> This is a **behavior change shipping in a minor** — deliberately, because the
> flip was announced in 11.6.0, deferred through 12.x and 13.x, and has been
> emitting a dev-mode notice the whole time. If you'd rather not take it now,
> pass `nativeErrors: false` and nothing changes.

If your app doesn't use `@signaltree/ng-forms`'s `signalForm()` bridge, or
already passes `nativeErrors` explicitly, **the behavior change is a no-op for
you** — see [§3](#3-also-in-132-computed-slice-names-are-typed) for the part
that's pure upside.

## 1. `signalForm()`: `nativeErrors` defaults to `true`

### What changed

Failures from the **built-in** marker validators — `required`, `email`, `min`,
`max`, `minLength`, `maxLength`, `pattern` — are now emitted as Angular's
branded validation errors (`requiredError()`, `minError(min)`, …):

```ts
const account = signalForm(tree.$.account, { injector });
//                                          ^ nativeErrors defaults to true in 13.2

account.age().value.set(12);
const [err] = account.age().errors();

// 13.2 (branded, the new default)
err instanceof NgValidationError;   // true
err instanceof MinValidationError;  // true
err.min;                            // 18 — a typed constraint, not string-parsed
err.kind;                           // 'min' — still present on branded errors
err.message;                        // 'Too young' — still present

// 13.1 and earlier (plain object, now behind `nativeErrors: false`)
err instanceof NgValidationError;   // false
err.kind;                           // 'min'
err.message;                        // 'Too young'
// err.min                          // ✗ did not exist
```

`kind` and `message` are present in **both** shapes, so code that only reads
those two properties keeps working. What changes is the error's *identity*:
it's now a class instance, and it carries typed constraint properties.

### Why

Branded errors are the Angular-native shape — `instanceof` checks work,
constraint values are typed properties rather than something you parse out of a
message string, and it's what an Angular developer (or coding agent) reaching for
Signal Forms already expects. The plain-object shape was the conservative default
while the bridge was new; it isn't the right thing to hand a fresh caller.

### Migrating

**Option A — keep the old shape (smallest change).** Pass `false` explicitly:

```ts
const account = signalForm(tree.$.account, { injector, nativeErrors: false });
```

This is fully supported, not deprecated. Use it if you have error-rendering code
you don't want to touch right now.

**Option B — adopt branded errors.** No change is needed at all if your template
or code only reads `.kind` / `.message`. You need to act only where you:

- **Narrow on the plain object shape** — e.g. a type guard like
  `'kind' in err && !(err instanceof NgValidationError)`, or a `switch` that
  assumed a bare object. Narrow on the branded classes instead
  (`err instanceof MinValidationError`), or keep using `.kind`, which is
  shape-agnostic.
- **Serialize errors** (logging, telemetry, `JSON.stringify`). A branded error is
  a class instance; `JSON.stringify` will not necessarily produce the same
  payload it did for a plain object. Map to a DTO explicitly:
  `{ kind: err.kind, message: err.message }`.
- **Deep-equal errors in tests** — `toEqual({ kind: 'min', message: '…' })`
  against a branded instance will fail. Assert on the properties, or on
  `toBeInstanceOf(MinValidationError)`.

`NgValidationError` and the per-kind classes import from
`@angular/forms/signals` (Angular's package, not `@signaltree/*`).

### What did NOT change

- **Custom and untagged validators** still emit
  `{ kind: 'signalTree', message }` in **both** modes. Only built-in
  `validators.*` failures have a branded counterpart.
- A built-in re-tagged through `withKind()` (e.g.
  `withKind(validators.min(5), 'custom')`) loses branded emission and falls back
  to the plain shape — `withKind` carries the kind but not `validatorParams`.
  `validators.when()` forwards both, so a wrapped built-in stays branded.
- The marker's own `errors()` / `valid()` signals are unaffected — this option
  governs only what the bridged `FieldTree`'s field state reports.

## 2. Removed: the `nativeErrors` flip advisory

`signalForm()` used to emit a one-time dev-mode `console.info` when
`nativeErrors` was left unset, warning that the default would flip. The flip has
happened, so the notice is gone. Its test-only companion
`__resetNativeErrorsAdvisoryForTests` (module-internal, never exported from the
package barrel) is removed with it.

If you set `nativeErrors` explicitly only to silence that notice, you can now
drop the option — but check which value you pinned first: dropping an explicit
`false` changes behavior.

## 3. Also in 13.2: `.computed()` slice names are typed

No action needed — this only removes a cast you were previously told to write.

`entityMap().computed()` slices have always materialized on `tree.$` at runtime,
but the slice names weren't on the static type, so the docs taught this:

```typescript
// before 13.2 — the documented access pattern
(store.$.plants as any).byUrl();
```

They're now typed, and `.computed()` chains type each name independently:

```typescript
// 13.2
store.$.plants.byUrl();       // Signal<Record<string, PlantDto>>
store.$.plants.activeCount(); // Signal<number>
```

**Delete the `as any` casts** wherever you followed the old guidance. Loader-backed
collections keep their loader surface alongside the slices, and a collection with
no slices resolves to exactly `EntitySignal<E, K>` as before.

The one strictly-observable type change: a slice-bearing collection's resolved
type now includes the slice members, so an *exact*-type assertion in your own code
(e.g. `Equal<typeof store.$.plants, EntitySignal<PlantDto, string>>`) will see the
richer type. Ordinary assignments to `EntitySignal<E, K>` are unaffected — an
intersection is assignable to its member.

See the [entity-collection cookbook §2](entity-collection-cookbook.md) for the
full slices / `find` / `where` surface.

## 4. Nothing else changed

Core state APIs (`signalTree`, `$` path access, `.set`/`.update`, `.derived()`,
markers `entityMap`/`status`/`stored`/`form`, `defineStore`, `asReadonly`), the
`entityMap` loader surface (`loader()`, `loadOrThrow()`, scoped loading), core
`history()`/`trackHistory()`, the `@signaltree/events` bridges, and the
`signalForm()` schema overload are all unchanged. Package boundaries are
unchanged from 13.1. Angular support is 20 / 21 / 22.

The `[ST2005]` single-async-authority rule is unchanged: bridging a `form()`
marker that carries `asyncValidators` still throws — pick one authority.

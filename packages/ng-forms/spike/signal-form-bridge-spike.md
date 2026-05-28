# PR3 Spike — Signal Forms FieldTree per-field binding

**Date:** 2026-05-28
**Outcome:** **Branch A — clean pass.** Angular Signal Forms shipped in `@angular/forms@22.0.0-rc.2`. The bridge is actionable.
**Plan reference:** [docs/architecture/schema-enhancer-plan.md §9](../../../docs/architecture/schema-enhancer-plan.md)

## Spike question

Does Angular Signal Forms permit binding a `FieldTree` leaf to an externally-owned `WritableSignal` (vs. requiring the form to own the whole model object)? Per plan §9.3:

- **Branch A** (clean pass) → ship per-field bridge ✅
- **Branch B** (ambiguous) → ship documented manual-wiring helper
- **Branch C** (clean fail) → no-ship, document limitation

## What Angular 22 Signal Forms provides

`@angular/forms` in v22 exports (via `./signals` subpath):

```ts
// form() takes an EXTERNAL WritableSignal — no internal copy
form<TModel>(model: WritableSignal<TModel>): FieldTree<TModel>
form<TModel>(model, schemaOrOptions): FieldTree<TModel>
form<TModel>(model, schema, options): FieldTree<TModel>

// Each FieldState exposes a per-field writable
interface FieldState<TValue> {
  readonly value: WritableSignal<TValue>;        // ← propagates to model
  readonly controlValue: WritableSignal<TValue>;
  readonly fieldTree: FieldTree<unknown>;
  // … markAsDirty, markAsTouched, etc.
}

// Direct StandardSchema integration — exactly the plan's anticipated point
validateStandardSchema<TSchema, TModel>(
  path: SchemaPath<TModel>,
  schema: StandardSchemaV1<TSchema>,
): void

// Wildcard equivalent for arrays
applyEach<TValue>(
  path: SchemaPath<TValue>,
  schema: SchemaOrSchemaFn<TValue[number]>,
): void

// Plus: apply, applyWhen, applyWhenValue, disabled, hidden, readonly,
// submit, provideSignalFormsConfig, metadata, …
```

Angular's documentation confirms: **"`form` uses the given model as the source of truth and *does not* maintain its own copy of the data. This means that updating the value on a `FieldState` updates the originally passed in model as well."**

## Implications for SignalTree integration

The `WritableSignal<TModel>` requirement is satisfied by **core's existing `toWritableSignal()`**, which converts a SignalTree NodeAccessor into an Angular-compatible writable. The bridge pattern is:

```ts
import { toWritableSignal } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { form, validateStandardSchema, applyEach } from '@angular/forms';

const tree = signalTree({ user: { name: '', email: '' } }).with(
  schemas({ schemas: { 'user.email': z.string().email() } }),
);

// The bridge:
const userForm = form(toWritableSignal(tree.$.user), (user) => {
  // Bridge walks tree.schemas.boundPaths() under 'user.*', queries
  // tree.schemas.schemaFor(path), and binds:
  validateStandardSchema(user.email, z.string().email());
});
```

The bridge package (`@signaltree/ng-forms`) provides:
- A `signalFormBridge(treePath)` helper that returns a `FieldTree` wired to the
  schemas registered on the tree at `treePath`.
- An `applyEachFor(path)` adapter for wildcard schemas (`users.*.email`).
- Optional standalone exports for users who want manual wiring.

## Naming collision resolved

Angular 22's `@angular/forms` exports its own `schema()` factory. We renamed our factory to `schemas()` (plural) to avoid the collision. Both packages can be imported alongside each other without aliases:

```ts
import { schemas } from '@signaltree/schema';            // ✅ ours
import { schema, form, validateStandardSchema } from '@angular/forms';  // ✅ Angular's
```

## Version compatibility

- **Angular 22+**: Signal Forms shipped. `signalFormBridge` works.
- **Angular 20–21**: Signal Forms not present. Bridge code is TypeScript-only at install time; `signalFormBridge` import succeeds only when `@angular/forms@22+` is installed. Users on 20/21 see a clear error at type-check time pointing them to upgrade or use manual `errorsAt(path)` wiring.

`@signaltree/ng-forms`'s `package.json` lists `@angular/forms@22+` as an **optional peer dependency** so npm doesn't force the upgrade on users who don't use the bridge.

## Action items completed

- [x] Spike outcome confirmed: Branch A
- [x] Bridge implementation in `@signaltree/ng-forms` (PR3)
- [x] Factory renamed from `schema()` to `schemas()` to avoid Angular collision
- [x] Demo page updated with bridge example alongside manual-wiring example
- [x] CHANGELOGs reflect the integration story

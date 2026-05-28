# PR3 Spike — Signal Forms FieldTree per-field binding

**Date:** 2026-05-28
**Outcome:** **Deferred** — Angular Signal Forms not yet shipped in available Angular release.
**Plan reference:** [docs/architecture/validation-enhancer-plan.md §9](../../../docs/architecture/validation-enhancer-plan.md)

## Spike question

Does Angular Signal Forms permit binding a `FieldTree` leaf to an externally-owned `WritableSignal` (vs. requiring the form to own the whole model object)? Per plan §9.3:

- **Branch A** (clean pass) → ship per-field bridge
- **Branch B** (ambiguous) → ship documented manual-wiring helper
- **Branch C** (clean fail) → no-ship, document limitation

## Reality at spike time

Angular installed in this workspace: **20.3.11**

Signal Forms is **not yet present** in `@angular/forms@20.3.11`:
- No `form()` factory export
- No `FieldTree` type
- No `validateStandardSchema` integration

Signal Forms RFC ([angular/angular#60851](https://github.com/angular/angular/discussions/60851)) is still in discussion / experimental development. Not yet stable.

## Decision

**Defer `signalFormBridge` to a future release.** This is effectively Branch C, but driven by upstream-not-shipped rather than upstream-doesn't-support. Re-evaluate when Angular ships Signal Forms in a stable release.

## What ships in v1 anyway

Users who want validation today have these paths:

1. **Direct validation** — register schemas with `@signaltree/schema`, read errors via `tree.schema.errorsAt(path)` and wire into your component template manually:

   ```ts
   const tree = signalTree({ user: { email: '' } }).with(
     schema({ schemas: { 'user.email': z.string().email() } })
   );
   // In component template:
   // <div>{{ tree.schema.errorsAt('user.email')() }}</div>
   ```

2. **Existing `formBridge` (Reactive Forms)** — still works with `@signaltree/ng-forms`. Use `tree.schema.errorsAt(path)` alongside FormGroup's own validation.

3. **Future:** when Signal Forms ships, this spike will be revived and the bridge built.

## Action items

- Track Angular Signal Forms RFC status quarterly.
- When stable: re-run spike, attempt per-field binding, ship Branch A or B.
- Until then: PR4 docs explicitly note the gap and the workarounds above.

/**
 * Ambient type shim for Angular 22 Signal Forms.
 *
 * The bridge in this directory imports from `@angular/forms/signals`, which
 * is a subpath that only exists in `@angular/forms@22.0.0+`. TypeScript's
 * classic node resolution does not follow `exports` fields in package.json,
 * so we declare a minimal ambient module here. At the user's install site
 * (assuming they have `@angular/forms@22+` installed), this shim is shadowed
 * by the real types.
 *
 * The shim deliberately uses permissive types so the bridge compiles without
 * coupling to internal Signal Forms type machinery (which is still evolving
 * in 22.x RCs). The bridge is type-safe at its API surface; internals are
 * navigated via runtime property access.
 *
 * @internal
 */
declare module '@angular/forms/signals' {
  import type { WritableSignal } from '@angular/core';
  import type { StandardSchemaV1 } from '@standard-schema/spec';

  /** Re-shape of Angular 22's `form()` factory (subset). */
  export function form<TModel>(
    model: WritableSignal<TModel>,
    schemaFn?: (fieldRoot: unknown) => void,
  ): unknown;

  /** Re-shape of Angular 22's `validateStandardSchema()`. */
  export function validateStandardSchema(
    path: unknown,
    schema: StandardSchemaV1<unknown> | unknown,
  ): void;

  /** Re-shape of Angular 22's `applyEach()` for arrays. */
  export function applyEach(
    path: unknown,
    schema: unknown,
  ): void;
}

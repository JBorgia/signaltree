/**
 * Angular Signal Forms bridge for `@signaltree/schema`.
 *
 * Wires the schemas registered on a SignalTree into an Angular 22 Signal Forms
 * `FieldTree`, automatically calling `validateStandardSchema` for every leaf
 * path the schema enhancer owns under the form's root.
 *
 * **Requires Angular 22+** (`@angular/forms` ships stable Signal Forms via the
 * `./signals` subpath starting in v22.0.0).
 *
 * Apps on Angular 20/21 can still install `@signaltree/schema` and read errors
 * manually via `tree.schemas.errorsAt(path)()`; this subpath simply won't
 * resolve without Angular 22's `@angular/forms/signals`.
 *
 * @packageDocumentation
 */

import type { WritableSignal } from '@angular/core';
import {
  form,
  validateStandardSchema,
  type FieldTree,
} from '@angular/forms/signals';
import { isTraversableNode, toWritableSignal } from '@signaltree/core';
import type { SchemaMethods } from '@signaltree/schema';

declare const ngDevMode: boolean | undefined;

/**
 * Walk `tree.schemas.boundPaths()` under the given root and bind each
 * registered schema into the Signal Forms field tree.
 *
 * Call this from inside a `form()` schema function. The bridge handles the
 * path navigation, the schema lookup against `tree.schemas.schemaFor()`, and
 * the `validateStandardSchema` calls.
 *
 * @example
 * ```ts
 * import { form } from '@angular/forms/signals';
 * import { toWritableSignal } from '@signaltree/core';
 * import { applySignalTreeSchemas } from '@signaltree/ng-forms/signals';
 *
 * const userForm = form(toWritableSignal(tree.$.user), (user) => {
 *   applySignalTreeSchemas(user, tree, 'user');
 * });
 * ```
 *
 * @public
 */
export function applySignalTreeSchemas(
  // At the type level this is a Signal Forms SchemaPathTree; the bridge
  // navigates it dynamically (path segments come from the runtime schema
  // registry), so the static SignalTree shape isn't known here.
  fieldRoot: unknown,
  tree: SchemaMethods,
  rootPath = ''
): void {
  const bound = tree.schemas.boundPaths();
  const prefix = rootPath ? rootPath + '.' : '';

  for (const fullPath of bound) {
    // Filter to paths under this form's root.
    if (rootPath && !fullPath.startsWith(prefix) && fullPath !== rootPath) {
      continue;
    }

    const subPath = rootPath ? fullPath.slice(prefix.length) : fullPath;
    if (!subPath) continue;

    const schema = tree.schemas.schemaFor(fullPath);
    if (!schema) continue;

    // Navigate the field tree to the sub-path via property access.
    // SchemaPathTree exposes nested fields as own properties keyed by the
    // model shape.
    const segments = subPath.split('.');
    let cursor: unknown = fieldRoot;
    for (const seg of segments) {
      if (!isTraversableNode(cursor)) break;
      cursor = (cursor as Record<string, unknown>)[seg];
    }

    if (cursor === null || cursor === undefined) continue;

    // The runtime walk bounds the type narrowing; users get correctly-typed
    // FieldTrees from `form<TModel>(...)` regardless.
    validateStandardSchema(cursor as never, schema as never);
  }
}

/**
 * Implementation of the schema form of `signalForm()` (see
 * `./signal-form.ts` for the public entry and full JSDoc).
 *
 * Builds a Signal Forms `FieldTree` bound to a SignalTree subtree with all
 * registered schemas auto-applied. Reads from the tree's schema registry —
 * no schema arguments needed. Single-source-of-truth is enforced at the type
 * level via the `SchemaMethods` constraint on the `tree` parameter.
 *
 * @internal
 */
export function signalFormBridgeImpl<TModel>(
  tree: SchemaMethods,
  rootPath: string,
  subtree: unknown
): FieldTree<TModel> {
  // toWritableSignal expects a NodeAccessor; subtree is typed as `unknown`
  // because the SignalTree shape isn't statically inferrable here. Users
  // pass `tree.$.<subtree>` which is a NodeAccessor at runtime.
  const writable = toWritableSignal(
    subtree as Parameters<typeof toWritableSignal>[0]
  ) as unknown as WritableSignal<TModel>;
  return form<TModel>(writable, (fieldRoot: unknown) => {
    applySignalTreeSchemas(fieldRoot, tree, rootPath);
    // The schema callback's parameter is typed by Angular as
    // SchemaPathTree<TModel>; the cast above keeps the dynamic walk honest.
  }) as FieldTree<TModel>;
}

/** One-time guard for the signalFormBridge deprecation warning. */
let warnedBridgeAliasDeprecated = false;

/**
 * Build a Signal Forms `FieldTree` bound to a SignalTree subtree with all
 * registered schemas auto-applied.
 *
 * @deprecated Renamed to `signalForm()` in 11.6.0 — same signature, same
 * behavior: `signalForm<TModel>(tree, rootPath, subtree)`. This alias will
 * be removed in the next major. Import `signalForm` from
 * `@signaltree/ng-forms/signals`.
 *
 * @public
 */
export function signalFormBridge<TModel>(
  tree: SchemaMethods,
  rootPath: string,
  subtree: unknown
): FieldTree<TModel> {
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedBridgeAliasDeprecated
  ) {
    warnedBridgeAliasDeprecated = true;
    console.warn(
      '[SignalTree] signalFormBridge() is deprecated — renamed to ' +
        'signalForm() in 11.6.0 (same signature, same behavior). Import ' +
        "signalForm from '@signaltree/ng-forms/signals'. This alias will " +
        'be removed in the next major.'
    );
  }
  return signalFormBridgeImpl<TModel>(tree, rootPath, subtree);
}

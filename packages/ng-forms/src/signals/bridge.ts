/**
 * Angular Signal Forms bridge for `@signaltree/schema`.
 *
 * Wires the schemas registered on a SignalTree into an Angular 22 Signal Forms
 * `FieldTree`, automatically calling `validateStandardSchema` for every leaf
 * path the schema enhancer owns under the form's root.
 *
 * **Requires Angular 22+** (`@angular/forms` ships Signal Forms via the
 * `./signals` subpath starting in v22.0.0).
 *
 * Apps on Angular 20/21 can still install `@signaltree/schema` and read errors
 * manually via `tree.schemas.errorsAt(path)()`; the bridge only activates when
 * Angular 22's Signal Forms primitives are available at runtime.
 *
 * @packageDocumentation
 */

import type { WritableSignal } from '@angular/core';
// These imports resolve to @angular/forms@22+ at the user's install site.
// Local builds use the dev-dep copy in this package.
import { form, validateStandardSchema } from '@angular/forms/signals';
import { toWritableSignal, type ISignalTree } from '@signaltree/core';
import type { SchemaMethods } from '@signaltree/schema';

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
 * import { form } from '@angular/forms';
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
  // The `fieldRoot` is a Signal Forms SchemaPath at the type level — we use
  // `unknown` here because the path-segment navigation is dynamic and the
  // bridge can't statically know the SignalTree shape.
  fieldRoot: unknown,
  tree: ISignalTree<unknown> & SchemaMethods,
  rootPath = '',
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
    // FieldTree exposes nested fields as own properties keyed by the model shape.
    const segments = subPath.split('.');
    let cursor: unknown = fieldRoot;
    for (const seg of segments) {
      if (cursor === null || cursor === undefined) break;
      if (typeof cursor !== 'object' && typeof cursor !== 'function') break;
      cursor = (cursor as Record<string, unknown>)[seg];
    }

    if (cursor === null || cursor === undefined) continue;

    // `validateStandardSchema` takes a SchemaPath. The TS type narrowing here
    // is bounded by the runtime walk; in practice users get correctly-typed
    // FieldTrees via `form<TModel>(...)`.
    validateStandardSchema(cursor as never, schema as never);
  }
}

/**
 * Build a Signal Forms `FieldTree` bound to a SignalTree subtree with all
 * registered schemas auto-applied.
 *
 * Reads from the tree's schema registry — no schema arguments needed. The
 * bridge enforces single-source-of-truth at the type level via the
 * `& SchemaMethods` constraint on the `tree` parameter.
 *
 * @example
 * ```ts
 * import { signalTree } from '@signaltree/core';
 * import { schemas } from '@signaltree/schema';
 * import { signalFormBridge } from '@signaltree/ng-forms/signals';
 * import { z } from 'zod';
 *
 * const tree = signalTree({ user: { name: '', email: '' } }).with(
 *   schemas({
 *     schemas: {
 *       'user.name': z.string().min(2),
 *       'user.email': z.string().email(),
 *     },
 *   }),
 * );
 *
 * const userForm = signalFormBridge(tree, 'user', tree.$.user);
 * // userForm() is a FieldTree<User> with validation auto-wired.
 * ```
 *
 * @public
 */
export function signalFormBridge<TModel>(
  tree: ISignalTree<unknown> & SchemaMethods,
  rootPath: string,
  subtree: unknown,
) {
  // toWritableSignal expects a NodeAccessor; subtree is typed as `unknown`
  // because the SignalTree shape isn't statically inferrable here. Users
  // pass `tree.$.<subtree>` which is a NodeAccessor at runtime.
  const writable = toWritableSignal(
    subtree as Parameters<typeof toWritableSignal>[0],
  ) as WritableSignal<TModel>;
  return form<TModel>(writable, (fieldRoot: unknown) => {
    applySignalTreeSchemas(fieldRoot, tree, rootPath);
  });
}

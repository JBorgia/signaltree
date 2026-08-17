/**
 * THE CONSUMER CONTRACT for `schemas()` — characterization, pre-migration.
 *
 * Type-only, typechecked by `tsconfig.lib.json` (`include: src/**\/*.ts`,
 * excluding only spec/test files). Same `.types.ts` placement as guardrails.
 *
 * CHARACTERIZED BEFORE ASSUMING THE GUARDRAILS SHAPE APPLIES:
 *
 *   - `schemas()` has ONE implementation. Unlike `guardrails` (real + prod
 *     noop) and `devTools` (dev + prod noop), the package has a single entry,
 *     no conditional export, and `package.json#exports` declares only `.` and
 *     `./package.json`. So there is no second declaration to keep in sync —
 *     checked, because the `guardrails` slice found exactly that trap.
 *   - `SchemaMethods` has NO `this`, no conditional types and no state generic.
 *     Every path is `string`-keyed and every result is a `Signal` of a
 *     primitive or record. So nothing here is receiver-derived, which is what
 *     made `timeTravel` risky. Measured, not carried over.
 *   - Its config is REQUIRED (`config: SchemaConfig`), like `persistence`.
 *
 * These rows pin what a call site gets TODAY. No signature changes here; the
 * file is then frozen and must be re-run UNCHANGED after the migration.
 */
import { signalTree } from '@signaltree/core';

import { schemas } from './schema';

import type { Enhancer } from '@signaltree/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Signal } from '@angular/core';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;

interface AppState {
  count: number;
  user: { name: string; age: number };
}

declare const someSchema: StandardSchemaV1;

// The call site under test. No generics, no casts, no annotation.
const tree = signalTree<AppState>({ count: 0, user: { name: 'Ada', age: 36 } });
const validated = tree.with(schemas({ schemas: { 'user.name': someSchema } }));

// ============================================================================
// 1 — the settled-state surface, exact types
// ============================================================================
export type _SettledState = [
  Expect<
    Equal<
      (typeof validated)['schemas']['errors'],
      Signal<Readonly<Record<string, string | null>>>
    >
  >,
  Expect<
    Equal<(typeof validated)['schemas']['errorList'], Signal<readonly string[]>>
  >,
  Expect<Equal<(typeof validated)['schemas']['isValid'], Signal<boolean>>>,
  Expect<Equal<(typeof validated)['schemas']['pending'], Signal<boolean>>>,
  Expect<
    Equal<
      (typeof validated)['schemas']['pendingPaths'],
      Signal<readonly string[]>
    >
  >
];

// ============================================================================
// 2 — per-path access, imperative surface, and the bridge hook
// ============================================================================
export type _PerPathAndImperative = [
  Expect<
    Equal<
      (typeof validated)['schemas']['errorsAt'],
      (path: string) => Signal<string | null>
    >
  >,
  Expect<
    Equal<
      (typeof validated)['schemas']['isValidAt'],
      (path: string) => Signal<boolean>
    >
  >,
  Expect<
    Equal<
      (typeof validated)['schemas']['isPendingAt'],
      (path: string) => Signal<boolean>
    >
  >,
  Expect<Equal<(typeof validated)['schemas']['validate'], () => Promise<boolean>>>,
  Expect<
    Equal<
      (typeof validated)['schemas']['validatePath'],
      (path: string) => Promise<boolean>
    >
  >,
  Expect<Equal<(typeof validated)['schemas']['compact'], () => void>>,
  Expect<
    Equal<
      (typeof validated)['schemas']['schemaFor'],
      (leafPath: string) => StandardSchemaV1 | undefined
    >
  >,
  // Bridge-author surface, reactive — `@signaltree/ng-forms/signals` consumes it.
  Expect<
    Equal<
      (typeof validated)['schemas']['boundPaths'],
      Signal<readonly string[]>
    >
  >
];

export const _isValid: boolean = validated.schemas.isValid();
export const _err: string | null = validated.schemas.errorsAt('user.name')();
export const _run: Promise<boolean> = validated.schemas.validate();

// ============================================================================
// 3 — the state surface is untouched by enhancement
// ============================================================================
export const _count: number = validated.$.count();
export const _name: string = validated.$.user.name();
export const _user: { name: string; age: number } = validated.$.user();

// Rule 0d — a branch keeps all three call forms through the enhancer.
validated.$.user({ age: 37 });
validated.$.user((current) => ({ ...current, age: current.age + 1 }));

// Root call forms — read AND both write forms.
export const _snapshot: AppState = validated();
validated({ count: 1 });
validated((current) => ({ ...current, count: current.count + 1 }));
// @ts-expect-error a root write must not accept a foreign key
validated({ nope: 1 });

// ============================================================================
// 4 — accumulation in BOTH orders, against a real second enhancer
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const schemaThenLabelled = tree
  .with(schemas({ schemas: { 'user.name': someSchema } }))
  .with(labeller);
const labelledThenSchema = tree
  .with(labeller)
  .with(schemas({ schemas: { 'user.name': someSchema } }));

export const _a1: string = schemaThenLabelled.label();
export const _a2: boolean = schemaThenLabelled.schemas.isValid();
export const _a3: string = labelledThenSchema.label();
export const _a4: boolean = labelledThenSchema.schemas.isValid();
export const _a5: number = schemaThenLabelled.$.count();

// ============================================================================
// 5 — config is REQUIRED and checked
// ============================================================================
// @ts-expect-error `schemas()` requires a config
tree.with(schemas());

// ============================================================================
// 6 — negative controls
// ============================================================================
// @ts-expect-error `schemas` requires the enhancer
export type _NoSchemasBefore = (typeof tree)['schemas'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof validated, typeof tree>>;

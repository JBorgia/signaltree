/**
 * `@signaltree/schema`
 *
 * Schema-driven validation for SignalTree. StandardSchema-compatible
 * (Zod, Valibot, ArkType, Effect Schema, …), async-first, observe-only —
 * the enhancer reports verdicts and never blocks writes.
 *
 * @packageDocumentation
 */

export { schemas } from './lib/schema';
export type {
  SchemaConfig,
  SchemaMethods,
  SchemaPath,
} from './lib/types';

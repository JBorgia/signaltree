import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { schemas } from '../lib/schema';
import { syncSchema, asyncSchema, controllableSchema } from './test-helpers';

describe('schemas — imperative validate() / validatePath()', () => {
  it('validate() returns the current isValid() after dispatched runs settle', async () => {
    const tree = signalTree({ a: 'ok', b: 'bad' }).with(
      schemas({
        schemas: {
          a: syncSchema((v) => (v === 'ok' ? null : 'a-err')),
          b: syncSchema((v) => (v === 'ok' ? null : 'b-err')),
        },
        validateOnAttach: false,
      })
    );

    const result = await tree.schemas.validate();
    expect(result).toBe(false);
    expect(tree.schemas.errors()['a']).toBeNull();
    expect(tree.schemas.errors()['b']).toBe('b-err');
  });

  it('validate() returns true when every path passes', async () => {
    const tree = signalTree({ a: 'ok' }).with(
      schemas({
        schemas: { a: syncSchema((v) => (v === 'ok' ? null : 'err')) },
        validateOnAttach: false,
      })
    );

    const result = await tree.schemas.validate();
    expect(result).toBe(true);
  });

  it('validatePath() runs only the schema for the given leaf', async () => {
    const tree = signalTree({ a: 'ok', b: 'bad' }).with(
      schemas({
        schemas: {
          a: syncSchema(() => null),
          b: syncSchema(() => 'b-err'),
        },
        validateOnAttach: false,
      })
    );

    // Touch `a` so it's bound. b is not touched yet.
    (tree as any).$.a.set('ok');

    const result = await tree.schemas.validatePath('a');
    expect(result).toBe(true);
    expect(tree.schemas.errors()['a']).toBeNull();
  });

  // R3 + R6: aggregate pendingPaths must reflect async leaf runs.
  it('pending() and pendingPaths() reflect in-flight async validate() runs (F3)', async () => {
    const ctrl = controllableSchema<string>();
    const tree = signalTree({ a: 'x' }).with(
      schemas({
        schemas: { a: ctrl.schema as StandardSchemaV1 },
        validateOnAttach: false,
      })
    );

    // Kick off validate() — schema is async/controllable, won't settle until we resolve.
    const promise = tree.schemas.validate();

    // Microtask drain so runLeafAwait has reached the async branch.
    await Promise.resolve();

    // Aggregate state must show pending true and pendingPaths includes 'a'.
    expect(tree.schemas.pending()).toBe(true);
    expect(tree.schemas.pendingPaths()).toContain('a');
    expect(tree.schemas.isPendingAt('a')()).toBe(true);

    // Settle the schema — verdict null (valid).
    ctrl.resolveLatest(null);
    await promise;

    // Aggregate state should now be clean.
    expect(tree.schemas.pending()).toBe(false);
    expect(tree.schemas.pendingPaths()).toEqual([]);
    expect(tree.schemas.isPendingAt('a')()).toBe(false);
  });

  // R4 + R6: validate() must await async ancestor schemas before resolving.
  it('validate() awaits async ancestor schemas; resolves to post-validation isValid (F4)', async () => {
    // Build an async ancestor schema that returns an issue for 'email'.
    const ancestorSchema: StandardSchemaV1<unknown, unknown> = {
      '~standard': {
        version: 1,
        vendor: 'test-async-ancestor',
        validate: async (v: unknown) => {
          await new Promise((r) => setTimeout(r, 5));
          if (typeof v === 'object' && v !== null) {
            const obj = v as Record<string, unknown>;
            if (typeof obj['email'] !== 'string' || !String(obj['email']).includes('@')) {
              return { issues: [{ message: 'Invalid email', path: ['email'] }] };
            }
          }
          return { value: v };
        },
      },
    };

    const tree = signalTree({ user: { email: 'bad' } }).with(
      schemas({
        schemas: { user: ancestorSchema },
        validateOnAttach: false,
      })
    );

    // BEFORE the fix: validate() would resolve before the async ancestor settled,
    // and the verdict on user.email would still be null at await time.
    const isValid = await tree.schemas.validate();

    expect(isValid).toBe(false);
    expect(tree.schemas.errorsAt('user.email')()).toBe('Invalid email');
  });

  // Async leaf schema — sanity check that returnvalue tracks settle.
  it('validate() resolves to true after an async-valid leaf schema settles', async () => {
    const tree = signalTree({ a: 'ok' }).with(
      schemas({
        schemas: { a: asyncSchema((v) => (v === 'ok' ? null : 'err'), 5) },
        validateOnAttach: false,
      })
    );

    const isValid = await tree.schemas.validate();
    expect(isValid).toBe(true);
    expect(tree.schemas.errors()['a']).toBeNull();
  });
});

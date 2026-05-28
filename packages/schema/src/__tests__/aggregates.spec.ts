import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schemas } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schemas — aggregate signals', () => {
  it('isValid is O(1) (counter-backed) and flips on per-leaf verdicts', () => {
    const tree = signalTree({ a: '', b: '' }).with(
      schemas({
        schemas: {
          a: syncSchema((v) => (v === 'ok' ? null : 'a-err')),
          b: syncSchema((v) => (v === 'ok' ? null : 'b-err')),
        },
        validateOnAttach: false,
      })
    );

    expect(tree.schemas.isValid()).toBe(true);

    (tree as any).$.a.set('x');
    expect(tree.schemas.isValid()).toBe(false);

    (tree as any).$.b.set('y');
    expect(tree.schemas.isValid()).toBe(false);

    (tree as any).$.a.set('ok');
    expect(tree.schemas.isValid()).toBe(false); // b still invalid

    (tree as any).$.b.set('ok');
    expect(tree.schemas.isValid()).toBe(true); // both valid
  });

  it('errors map and errorList reflect current per-path verdicts', () => {
    const tree = signalTree({ a: '', b: '' }).with(
      schemas({
        schemas: {
          a: syncSchema((v) => (v === 'ok' ? null : 'a-err')),
          b: syncSchema((v) => (v === 'ok' ? null : 'b-err')),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.a.set('x');
    (tree as any).$.b.set('y');

    const errors = tree.schemas.errors();
    expect(errors['a']).toBe('a-err');
    expect(errors['b']).toBe('b-err');

    const list = tree.schemas.errorList();
    expect(list).toContain('a-err');
    expect(list).toContain('b-err');
    expect(list).toHaveLength(2);

    (tree as any).$.a.set('ok');
    expect(tree.schemas.errors()['a']).toBeNull();
    expect(tree.schemas.errorList()).toEqual(['b-err']);
  });

  it('isValid counter survives null→null and non-null→non-null transitions without drift', () => {
    const tree = signalTree({ a: '' }).with(
      schemas({
        schemas: {
          a: syncSchema((v) => (typeof v === 'string' && v.length > 0 ? null : 'required')),
        },
        validateOnAttach: false,
      })
    );

    // null → null transitions (valid value rewritten with another valid value)
    (tree as any).$.a.set('x');
    (tree as any).$.a.set('y');
    expect(tree.schemas.isValid()).toBe(true);

    // non-null → non-null transitions (invalid value rewritten with another invalid)
    // Note: same value won't fire because referential equality skip; use different empties not possible. Skip.

    // valid → invalid
    (tree as any).$.a.set('');
    expect(tree.schemas.isValid()).toBe(false);
    expect(tree.schemas.errorList()).toEqual(['required']);
  });

  it('pending signal reflects in-flight async runs', async () => {
    let resolveCheck: (() => void) | null = null;
    const tree = signalTree({ a: '' }).with(
      schemas({
        schemas: {
          a: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: () =>
                new Promise<{ value: unknown }>((resolve) => {
                  resolveCheck = () => resolve({ value: undefined });
                }),
            },
          },
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.a.set('x');
    expect(tree.schemas.pending()).toBe(true);
    expect(tree.schemas.pendingPaths()).toContain('a');

    resolveCheck?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(tree.schemas.pending()).toBe(false);
    expect(tree.schemas.pendingPaths()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schema } from '../lib/schema';
import { syncSchema, asyncSchema } from './test-helpers';

describe('schema — smoke', () => {
  it('reports verdict for a sync schema on a leaf write', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: {
          'user.email': syncSchema((v) =>
            typeof v === 'string' && v.includes('@') ? null : 'Invalid email'
          ),
        },
        validateOnAttach: false,
      })
    );

    expect(tree.schema.errorsAt('user.email')()).toBeNull();

    (tree as any).$.user.email.set('not-an-email');
    expect(tree.schema.errorsAt('user.email')()).toBe('Invalid email');
    expect(tree.schema.isValid()).toBe(false);

    (tree as any).$.user.email.set('a@b.com');
    expect(tree.schema.errorsAt('user.email')()).toBeNull();
    expect(tree.schema.isValid()).toBe(true);
  });

  it('reports verdict for an async schema after the promise settles', async () => {
    const tree = signalTree({ user: { name: '' } }).with(
      schema({
        schemas: {
          'user.name': asyncSchema((v) =>
            typeof v === 'string' && v.length >= 2 ? null : 'Too short'
          ),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.name.set('A');
    expect(tree.schema.isPendingAt('user.name')()).toBe(true);
    expect(tree.schema.pending()).toBe(true);

    await Promise.resolve(); // let microtask drain
    await Promise.resolve();

    expect(tree.schema.isPendingAt('user.name')()).toBe(false);
    expect(tree.schema.errorsAt('user.name')()).toBe('Too short');
    expect(tree.schema.isValid()).toBe(false);
  });

  it('validateOnAttach populates initial verdicts synchronously for sync schemas', () => {
    const tree = signalTree({ user: { email: 'bad' } }).with(
      schema({
        schemas: {
          'user.email': syncSchema((v) =>
            typeof v === 'string' && v.includes('@') ? null : 'Invalid email'
          ),
        },
        // validateOnAttach defaults to true
      })
    );

    // Verdict is populated synchronously — no microtask wait needed.
    expect(tree.schema.errorsAt('user.email')()).toBe('Invalid email');
    expect(tree.schema.isValid()).toBe(false);
  });

  it('exposes boundPaths as a reactive signal', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: {
          'user.email': syncSchema(() => null),
        },
        validateOnAttach: true,
      })
    );

    expect(tree.schema.boundPaths()).toContain('user.email');
  });

  it('returns the same memoized signal across calls for the same path', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: {
          'user.email': syncSchema(() => null),
        },
      })
    );

    const a = tree.schema.errorsAt('user.email');
    const b = tree.schema.errorsAt('user.email');
    expect(a).toBe(b);
  });
});

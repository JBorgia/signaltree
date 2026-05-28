import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schema } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schema — sync fast-path', () => {
  it('applies sync schema verdict synchronously (no microtask wait)', () => {
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

    (tree as any).$.user.email.set('bad');
    // Read in the same synchronous tick — verdict must be present.
    expect(tree.schema.errorsAt('user.email')()).toBe('Invalid email');
    expect(tree.schema.isValid()).toBe(false);
  });

  it('validateOnAttach: true populates initial errors synchronously', () => {
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

    // No await — verdict is in the synchronous attach pass.
    expect(tree.schema.errors()['user.email']).toBe('Invalid email');
    expect(tree.schema.isValid()).toBe(false);
  });

  it('does not mark sync schemas as pending', () => {
    const tree = signalTree({ a: '' }).with(
      schema({
        schemas: { a: syncSchema(() => 'err') },
        validateOnAttach: false,
      })
    );

    (tree as any).$.a.set('x');
    expect(tree.schema.isPendingAt('a')()).toBe(false);
    expect(tree.schema.pending()).toBe(false);
  });
});

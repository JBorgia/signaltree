import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schemas } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schemas — sync fast-path', () => {
  it('applies sync schema verdict synchronously (no microtask wait)', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schemas({
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
    expect(tree.schemas.errorsAt('user.email')()).toBe('Invalid email');
    expect(tree.schemas.isValid()).toBe(false);
  });

  it('validateOnAttach: true populates initial errors synchronously', () => {
    const tree = signalTree({ user: { email: 'bad' } }).with(
      schemas({
        schemas: {
          'user.email': syncSchema((v) =>
            typeof v === 'string' && v.includes('@') ? null : 'Invalid email'
          ),
        },
        // validateOnAttach defaults to true
      })
    );

    // No await — verdict is in the synchronous attach pass.
    expect(tree.schemas.errors()['user.email']).toBe('Invalid email');
    expect(tree.schemas.isValid()).toBe(false);
  });

  it('does not mark sync schemas as pending', () => {
    const tree = signalTree({ a: '' }).with(
      schemas({
        schemas: { a: syncSchema(() => 'err') },
        validateOnAttach: false,
      })
    );

    (tree as any).$.a.set('x');
    expect(tree.schemas.isPendingAt('a')()).toBe(false);
    expect(tree.schemas.pending()).toBe(false);
  });
});

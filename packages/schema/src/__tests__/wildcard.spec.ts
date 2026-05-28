import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schema } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schema — wildcard matching', () => {
  it('matches a write under a `users.*.email` pattern', () => {
    const tree = signalTree({
      users: {
        u1: { email: '', name: '' },
      },
    }).with(
      schema({
        schemas: {
          'users.*.email': syncSchema((v) =>
            typeof v === 'string' && v.includes('@') ? null : 'Invalid email'
          ),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.users.u1.email.set('bad');
    expect(tree.schema.errorsAt('users.u1.email')()).toBe('Invalid email');

    (tree as any).$.users.u1.email.set('a@b.com');
    expect(tree.schema.errorsAt('users.u1.email')()).toBeNull();
  });

  it('does not fire for paths that do not match the wildcard pattern', () => {
    const tree = signalTree({
      users: {
        u1: { email: '', name: '' },
      },
    }).with(
      schema({
        schemas: {
          'users.*.email': syncSchema(() => 'always-invalid'),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.users.u1.name.set('Alice'); // not email — should not match
    expect(tree.schema.errorsAt('users.u1.name')()).toBeNull();
    expect(tree.schema.isValid()).toBe(true);
  });

  it('specific schema beats wildcard for the same leaf (most-specific wins)', () => {
    const tree = signalTree({
      users: {
        u1: { email: '' },
        u2: { email: '' },
      },
    }).with(
      schema({
        schemas: {
          'users.*.email': syncSchema(() => 'wildcard-error'),
          'users.u1.email': syncSchema(() => 'specific-error'),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.users.u1.email.set('x');
    expect(tree.schema.errorsAt('users.u1.email')()).toBe('specific-error');

    (tree as any).$.users.u2.email.set('x');
    expect(tree.schema.errorsAt('users.u2.email')()).toBe('wildcard-error');
  });

  it('lazily binds new entity paths on first matching write', () => {
    const tree = signalTree({
      users: {
        u1: { email: '' },
      },
    }).with(
      schema({
        schemas: {
          'users.*.email': syncSchema((v) =>
            typeof v === 'string' && v.length > 0 ? null : 'Required'
          ),
        },
        validateOnAttach: false,
      })
    );

    (tree as any).$.users.u1.email.set('a@b.com');

    // Bound path now in boundPaths.
    expect(tree.schema.boundPaths()).toContain('users.u1.email');
  });
});

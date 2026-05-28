import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { schemas } from '../lib/schema';
import { syncSchema } from './test-helpers';

/**
 * Ancestor schemas validate a whole subtree and emit issues with internal
 * `path` arrays. The mapper distributes each issue to the corresponding leaf.
 */

function userObjectSchema(): StandardSchemaV1<unknown, unknown> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test-user-shape',
      validate: (v: unknown): StandardSchemaV1.Result<unknown> => {
        const issues: StandardSchemaV1.Issue[] = [];
        if (typeof v !== 'object' || v === null) {
          return { issues: [{ message: 'must be object' }] };
        }
        const obj = v as Record<string, unknown>;
        if (typeof obj['email'] !== 'string' || !String(obj['email']).includes('@')) {
          issues.push({ message: 'Invalid email', path: ['email'] });
        }
        if (typeof obj['age'] !== 'number' || obj['age'] < 0) {
          issues.push({ message: 'Invalid age', path: ['age'] });
        }
        if (issues.length === 0) return { value: v };
        return { issues };
      },
    },
  };
}

describe('schemas — ancestor schemas (D4 fixed precedence)', () => {
  it('distributes issues to owned leaves under the ancestor', () => {
    const tree = signalTree({ user: { email: '', age: -1 } }).with(
      schemas({
        schemas: { user: userObjectSchema() },
        validateOnAttach: false,
      })
    );

    // Trigger the ancestor schema by writing to one of its leaves.
    (tree as any).$.user.email.set('bad');
    expect(tree.schemas.errorsAt('user.email')()).toBe('Invalid email');
    expect(tree.schemas.errorsAt('user.age')()).toBe('Invalid age');
  });

  it('clears owned-leaf errors when ancestor schema passes', () => {
    const tree = signalTree({ user: { email: '', age: -1 } }).with(
      schemas({
        schemas: { user: userObjectSchema() },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.email.set('bad');
    expect(tree.schemas.errorsAt('user.email')()).toBe('Invalid email');

    (tree as any).$.user.email.set('a@b.com');
    (tree as any).$.user.age.set(25);
    expect(tree.schemas.errorsAt('user.email')()).toBeNull();
    expect(tree.schemas.errorsAt('user.age')()).toBeNull();
    expect(tree.schemas.isValid()).toBe(true);
  });

  it('D4: specific schema beats ancestor — ancestor verdict for that leaf is dropped', () => {
    // Both an ancestor schema (user) and a specific schema (user.email).
    // Specific owns email; ancestor only owns age (per D4 fixed precedence).
    const tree = signalTree({ user: { email: 'a@b.com', age: -1 } }).with(
      schemas({
        schemas: {
          user: userObjectSchema(),
          'user.email': syncSchema(() => null), // always valid (specific)
        },
        validateOnAttach: false,
      })
    );

    // Even if ancestor schema would say email is invalid, the specific
    // schema owns user.email and says valid.
    (tree as any).$.user.email.set('also-bad');
    expect(tree.schemas.errorsAt('user.email')()).toBeNull();

    // Ancestor still owns user.age though.
    (tree as any).$.user.age.set(-5);
    expect(tree.schemas.errorsAt('user.age')()).toBe('Invalid age');
  });
});

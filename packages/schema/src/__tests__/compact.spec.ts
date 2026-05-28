import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schema } from '../lib/schema';
import { syncSchema } from './test-helpers';

/**
 * `compact()` is the registry's manual GC: it evicts bound paths that no
 * longer resolve in the tree. SignalTree top-level writes merge (not replace),
 * so we cannot "remove" entities via the public write API for plain object
 * shapes. These tests target compact()'s contract by direct property delete
 * on the NodeAccessor — the only way SignalTree supports key removal for
 * non-entityMap shapes.
 */
describe('schema — compact() manual GC', () => {
  it('is a no-op when all bound paths still resolve', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.email.set('a@b.com');
    const before = tree.schema.boundPaths();
    tree.schema.compact();
    const after = tree.schema.boundPaths();
    expect(after).toEqual(before);
    expect(after).toContain('user.email');
  });

  it('evicts a bound path whose tree position no longer resolves', () => {
    const tree = signalTree({
      items: { a: { name: 'Alice' } } as Record<string, { name: string }>,
    }).with(
      schema({
        schemas: { 'items.*.name': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    // Bind the path by writing to it.
    (tree as any).$.items.a.name.set('Alice');
    expect(tree.schema.boundPaths()).toContain('items.a.name');

    // Manually delete the entity property from the items NodeAccessor.
    // This is the only way to remove a key from a non-entityMap subtree.
    delete (tree as any).$.items.a;

    tree.schema.compact();
    expect(tree.schema.boundPaths()).not.toContain('items.a.name');
  });

  // H4: pathExists must do a structural-only check. A signal holding null/undefined
  // at an intermediate hop does NOT mean the path is removed — it's transient
  // absence. Eviction should require actual key removal from the parent
  // NodeAccessor, not a null-valued signal.
  it('does NOT evict when an intermediate signal holds null (H4)', () => {
    const tree = signalTree({
      user: { profile: { email: '' } } as { email: string } | null,
    }).with(
      schema({
        schemas: { 'user.profile.email': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    // Bind the path by writing to it.
    (tree as any).$.user.profile.email.set('a@b.com');
    expect(tree.schema.boundPaths()).toContain('user.profile.email');

    // Set the intermediate signal to null (transient absence — not removal).
    // The key 'profile' is still structurally present on $.user.
    (tree as any).$.user.profile.set(null);

    tree.schema.compact();
    // Path is still bound — only structural removal should evict.
    expect(tree.schema.boundPaths()).toContain('user.profile.email');
  });

  it('decrements invalidCount when an invalid path is evicted', () => {
    const tree = signalTree({
      items: { a: { name: '' } } as Record<string, { name: string }>,
    }).with(
      schema({
        schemas: {
          'items.*.name': syncSchema((v) =>
            typeof v === 'string' && v.length > 0 ? null : 'Required'
          ),
        },
        validateOnAttach: false,
      })
    );

    // Bind and make invalid so we have a real error to evict.
    (tree as any).$.items.a.name.set('');
    expect(tree.schema.errorsAt('items.a.name')()).toBe('Required');
    expect(tree.schema.isValid()).toBe(false);

    // Remove + compact.
    delete (tree as any).$.items.a;
    tree.schema.compact();

    // The bound path is gone; isValid returns true again (no invalid paths).
    expect(tree.schema.boundPaths()).not.toContain('items.a.name');
    expect(tree.schema.isValid()).toBe(true);
  });
});

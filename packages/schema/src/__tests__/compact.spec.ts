import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schemas } from '../lib/schema';
import { syncSchema } from './test-helpers';

/**
 * `compact()` is the registry's manual GC: it evicts bound paths that no
 * longer resolve in the tree. SignalTree top-level writes merge (not replace),
 * so we cannot "remove" entities via the public write API for plain object
 * shapes. These tests target compact()'s contract by direct property delete
 * on the NodeAccessor — the only way SignalTree supports key removal for
 * non-entityMap shapes.
 */
describe('schemas — compact() manual GC', () => {
  it('is a no-op when all bound paths still resolve', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schemas({
        schemas: { 'user.email': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.email.set('a@b.com');
    const before = tree.schemas.boundPaths();
    tree.schemas.compact();
    const after = tree.schemas.boundPaths();
    expect(after).toEqual(before);
    expect(after).toContain('user.email');
  });

  it('evicts a bound path whose tree position no longer resolves', () => {
    const tree = signalTree({
      items: { a: { name: '' } } as Record<string, { name: string }>,
    }).with(
      schemas({
        schemas: { 'items.*.name': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    // Bind the path by writing a NEW value (referentially different from initial).
    (tree as any).$.items.a.name.set('Alice');
    expect(tree.schemas.boundPaths()).toContain('items.a.name');

    // Manually delete the entity property from the items NodeAccessor.
    // This is the only way to remove a key from a non-entityMap subtree.
    delete (tree as any).$.items.a;

    tree.schemas.compact();
    expect(tree.schemas.boundPaths()).not.toContain('items.a.name');
  });

  // H4: pathExists must do a structural-only check. A signal holding null/undefined
  // at a leaf does NOT mean the path is removed — it's transient absence.
  // Eviction should require actual key removal from the parent NodeAccessor.
  it('does NOT evict when a leaf signal holds null (H4)', () => {
    const tree = signalTree({
      user: { email: 'a@b.com' as string | null },
    }).with(
      schemas({
        schemas: { 'user.email': syncSchema(() => null) },
        validateOnAttach: false,
      })
    );

    // Bind by writing a new value.
    (tree as any).$.user.email.set('user@example.com');
    expect(tree.schemas.boundPaths()).toContain('user.email');

    // Set the leaf signal to null (transient absence, not structural removal).
    // The key 'email' is still structurally present on $.user.
    (tree as any).$.user.email.set(null);

    tree.schemas.compact();
    // Path is still bound — pathExists is a structural-only check.
    expect(tree.schemas.boundPaths()).toContain('user.email');
  });

  it('decrements invalidCount when an invalid path is evicted', () => {
    const tree = signalTree({
      items: { a: { name: 'Alice' } } as Record<string, { name: string }>,
    }).with(
      schemas({
        schemas: {
          'items.*.name': syncSchema((v) =>
            typeof v === 'string' && v.length > 0 ? null : 'Required'
          ),
        },
        validateOnAttach: false,
      })
    );

    // Bind by writing a new value (different from initial 'Alice'), then
    // write an invalid value so the path holds an error.
    (tree as any).$.items.a.name.set('Bob');     // bind path
    (tree as any).$.items.a.name.set('');         // invalid → error
    expect(tree.schemas.errorsAt('items.a.name')()).toBe('Required');
    expect(tree.schemas.isValid()).toBe(false);

    // Remove + compact.
    delete (tree as any).$.items.a;
    tree.schemas.compact();

    // The bound path is gone; isValid returns true again (no invalid paths).
    expect(tree.schemas.boundPaths()).not.toContain('items.a.name');
    expect(tree.schemas.isValid()).toBe(true);
  });
});

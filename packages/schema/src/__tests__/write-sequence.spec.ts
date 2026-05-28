import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schemas } from '../lib/schema';
import { controllableSchema } from './test-helpers';

describe('schemas — write-sequence guard', () => {
  it('drops stale verdicts when a newer write supersedes them', async () => {
    const ctrl = controllableSchema<string>();
    const tree = signalTree({ user: { email: '' } }).with(
      schemas({
        schemas: { 'user.email': ctrl.schema },
        validateOnAttach: false,
      })
    );

    // Fire writes A, B, C, D, E in sequence.
    (tree as any).$.user.email.set('a');
    (tree as any).$.user.email.set('b');
    (tree as any).$.user.email.set('c');
    (tree as any).$.user.email.set('d');
    (tree as any).$.user.email.set('e');

    // 5 in-flight schema runs (one per set).
    expect(ctrl.pendingCount()).toBe(5);

    // Resolve in reverse order: E first (latest), then D/C/B/A.
    // E is current (version 5), so its verdict applies.
    ctrl.resolveLatest('error-E');
    await Promise.resolve();
    expect(tree.schemas.errorsAt('user.email')()).toBe('error-E');

    // D/C/B/A are stale and must be dropped — they should NOT change the error.
    ctrl.resolveLatest('error-D'); // resolves the latest still-pending = D
    await Promise.resolve();
    expect(tree.schemas.errorsAt('user.email')()).toBe('error-E'); // unchanged

    ctrl.resolveLatest('error-C');
    ctrl.resolveLatest('error-B');
    ctrl.resolveLatest('error-A');
    await Promise.resolve();
    expect(tree.schemas.errorsAt('user.email')()).toBe('error-E'); // still unchanged
  });

  it('clears pending state when the in-flight (current) run settles', async () => {
    const ctrl = controllableSchema<string>();
    const tree = signalTree({ user: { name: '' } }).with(
      schemas({
        schemas: { 'user.name': ctrl.schema },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.name.set('x');
    expect(tree.schemas.isPendingAt('user.name')()).toBe(true);

    ctrl.resolveLatest(null);
    await Promise.resolve();
    expect(tree.schemas.isPendingAt('user.name')()).toBe(false);
    expect(tree.schemas.errorsAt('user.name')()).toBeNull();
  });

  it('orphaned (stale) runs do not flip the pending signal back to true', async () => {
    const ctrl = controllableSchema<string>();
    const tree = signalTree({ user: { name: '' } }).with(
      schemas({
        schemas: { 'user.name': ctrl.schema },
        validateOnAttach: false,
      })
    );

    (tree as any).$.user.name.set('x'); // pending #1
    (tree as any).$.user.name.set('y'); // pending #2, supersedes #1

    // Resolve current (#2) first, then the orphan (#1).
    ctrl.resolveLatest('error-y');
    await Promise.resolve();
    expect(tree.schemas.isPendingAt('user.name')()).toBe(false);

    ctrl.resolveLatest('error-x'); // orphan settles
    await Promise.resolve();
    expect(tree.schemas.isPendingAt('user.name')()).toBe(false); // still false
    expect(tree.schemas.errorsAt('user.name')()).toBe('error-y'); // unchanged
  });

  // M6: explicit race coverage — write A is older but resolves SECOND;
  // write B is newer but resolves FIRST. The verdictSeq guard must apply
  // B's verdict (current version) and discard A's verdict (orphaned).
  it('B-resolves-before-A race: applies latest version, discards older orphan (M6)', async () => {
    const ctrl = controllableSchema<string>();
    const tree = signalTree({ user: { email: '' } }).with(
      schemas({
        schemas: { 'user.email': ctrl.schema },
        validateOnAttach: false,
      })
    );

    // Write A — version 1, will resolve LATE.
    (tree as any).$.user.email.set('a-value');
    // Write B — version 2 (supersedes A), will resolve FIRST.
    (tree as any).$.user.email.set('b-value');

    expect(ctrl.pendingCount()).toBe(2);

    // Resolve B first (most recent — current version).
    ctrl.resolveLatest('B-verdict');
    await Promise.resolve();
    expect(tree.schemas.errorsAt('user.email')()).toBe('B-verdict');

    // Now resolve A (orphan — its version was bumped past it).
    ctrl.resolveLatest('A-verdict');
    await Promise.resolve();

    // B's verdict stands; A's orphaned verdict was discarded.
    expect(tree.schemas.errorsAt('user.email')()).toBe('B-verdict');
  });
});

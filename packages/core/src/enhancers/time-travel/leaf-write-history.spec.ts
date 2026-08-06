import { describe, expect, it } from 'vitest';

import { signalTree } from '../../lib/signal-tree';
import { timeTravel } from './time-travel';

/**
 * Direct leaf writes must land in history.
 *
 * `tree.$.a.b.set(x)` goes straight to a leaf signal — it does not pass through
 * the root callable that timeTravel wraps. If history does not see it, undo
 * silently cannot restore it, which is the worst kind of failure for an undo
 * feature: it appears to work and quietly loses writes.
 *
 * `interceptLeafSignals` routes those writes through the PathNotifier so the
 * flush hook records them. These tests pin that, because it is invisible from
 * the outside until it breaks.
 */
describe('time travel records direct leaf writes', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('undo restores a direct leaf .set()', async () => {
    const tree = signalTree({ user: { profile: { name: 'a' } } }).with(
      timeTravel()
    );

    tree.$.user.profile.name.set('b');
    await flush();
    tree.$.user.profile.name.set('c');
    await flush();
    expect(tree().user.profile.name).toBe('c');

    tree.undo();
    expect(tree().user.profile.name).toBe('b');
  });

  it('undo restores a direct leaf .update()', async () => {
    const tree = signalTree({ count: 0 }).with(timeTravel());

    tree.$.count.update((n) => n + 1);
    await flush();
    tree.$.count.update((n) => n + 1);
    await flush();
    expect(tree().count).toBe(2);

    tree.undo();
    expect(tree().count).toBe(1);
  });

  it('records leaf writes at depth', async () => {
    const tree = signalTree({ a: { b: { c: { d: 1 } } } }).with(timeTravel());

    tree.$.a.b.c.d.set(2);
    await flush();
    expect(tree().a.b.c.d).toBe(2);

    tree.undo();
    expect(tree().a.b.c.d).toBe(1);
  });

  it('redo replays a leaf write that undo rolled back', async () => {
    const tree = signalTree({ n: 1 }).with(timeTravel());

    tree.$.n.set(2);
    await flush();
    tree.undo();
    expect(tree().n).toBe(1);

    tree.redo();
    expect(tree().n).toBe(2);
  });

  it('does not grow history while restoring', async () => {
    const tree = signalTree({ n: 1 }).with(timeTravel());

    tree.$.n.set(2);
    await flush();
    tree.$.n.set(3);
    await flush();
    const before = tree.getHistory().length;

    tree.undo();
    await flush();

    expect(tree.getHistory().length).toBeLessThanOrEqual(before);
  });
});

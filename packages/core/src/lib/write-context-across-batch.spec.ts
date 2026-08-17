import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';
import {
  getActiveWriteContext,
  getPathNotifier,
  withWriteContext,
} from '../authoring';

/**
 * `UpdateMetadata` must survive the batched-notification microtask.
 *
 * PathNotifier batches by default: `notify()` queues, and `flush()` runs the
 * subscribers on a microtask — by which point the `withWriteContext` call that
 * wrapped the write has exited and `getActiveWriteContext()` reads `undefined`.
 *
 * Every consumer of that seam was therefore blind for effectively every write.
 * It was found while wiring guardrails' `suppression` config, whose first
 * implementation read the context at flush time and silently never matched —
 * the same silent-no-op class the surrounding 14.1.2 work exists to remove.
 */
const tick = () => new Promise<void>((r) => queueMicrotask(() => r()));

interface Row {
  id: string;
  v: number;
}

const mkTree = () =>
  signalTree({
    rows: entityMap<Row, string>({ selectId: (r) => r.id }),
  });

describe('write context across the batch boundary', () => {
  it('a subscriber sees the metadata the writer declared', async () => {
    let seen: unknown = 'not-called';
    const unsub = getPathNotifier().subscribe('**', () => {
      seen = getActiveWriteContext();
    });
    const tree = mkTree();

    withWriteContext({ intent: 'hydrate', source: 'serialization' }, () => {
      tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    unsub();

    expect(seen).toEqual({ intent: 'hydrate', source: 'serialization' });
  });

  it('an unwrapped write leaves the context undefined', async () => {
    let seen: unknown = 'not-called';
    const unsub = getPathNotifier().subscribe('**', () => {
      seen = getActiveWriteContext();
    });
    const tree = mkTree();

    tree.$.rows.addOne({ id: 'a', v: 1 });
    await tick();
    unsub();

    expect(seen).toBeUndefined();
  });

  it('does not leak the context beyond the flush', async () => {
    const unsub = getPathNotifier().subscribe('**', () => {
      /* no-op */
    });
    const tree = mkTree();

    withWriteContext({ suppressGuardrails: true }, () => {
      tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    unsub();

    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('coalesced writes to one path keep the last write metadata', async () => {
    const seen: unknown[] = [];
    const unsub = getPathNotifier().subscribe('**', () => {
      seen.push(getActiveWriteContext());
    });
    const tree = mkTree();
    tree.$.rows.addOne({ id: 'a', v: 0 });
    await tick();
    seen.length = 0;

    withWriteContext({ intent: 'bulk' }, () => {
      tree.$.rows.updateOne('a', { v: 1 });
    });
    withWriteContext({ intent: 'user' }, () => {
      tree.$.rows.updateOne('a', { v: 2 });
    });
    await tick();
    unsub();

    // One coalesced notification, carrying the metadata that matches newValue.
    expect(seen).toEqual([{ intent: 'user' }]);
  });
});

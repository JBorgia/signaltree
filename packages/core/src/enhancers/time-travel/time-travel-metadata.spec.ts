import { describe, expect, it } from 'vitest';

import { signalTree } from '../../lib/signal-tree';
import { interceptLeafSignals } from '../../lib/internals/intercept-leaf-signals';
import { resetPathNotifier } from '../../lib/path-notifier';
import type { UpdateMetadata } from '../../lib/types';
import { timeTravel } from './time-travel';

/**
 * PR1: time-travel replay writes are tagged with the ambient write-context
 * `{ intent: 'system', source: 'time-travel' }`. Enhancers (validation,
 * guardrails) consume this via `getActiveWriteContext()` to suppress side
 * effects for replays.
 */
describe('time-travel — replay writes carry source: time-travel (PR1)', () => {
  it('writes performed during undo() carry source=time-travel meta', async () => {
    resetPathNotifier();

    const store = signalTree({ count: 0 }).with(timeTravel());

    // Drive the tree forward so we have history to undo into.
    (store as any).$.count.set(1);
    await Promise.resolve();
    (store as any).$.count.set(2);
    await Promise.resolve();

    // Attach a second leaf interceptor AFTER time-travel has already wrapped
    // the signals. Our wrap sits outside time-travel's, so it observes every
    // .set() including replay writes from restoreState.
    const captured: Array<{ path: string; meta?: UpdateMetadata }> = [];
    const restore = interceptLeafSignals(
      (store as any).$,
      (path, _next, _prev, meta) => {
        captured.push({ path, meta });
      }
    );

    // Undo: synchronously triggers restoreState, which wraps writes in
    // withWriteContext({ intent: 'system', source: 'time-travel' }).
    const t = (store as any).__timeTravel;
    expect(t.canUndo()).toBe(true);
    t.undo();
    await Promise.resolve();

    restore();

    // At least one leaf write must have fired during undo. Every replay
    // write carries the time-travel context (no plain user writes happen
    // inside undo()).
    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const c of captured) {
      expect(c.meta).toBeDefined();
      expect(c.meta?.source).toBe('time-travel');
      expect(c.meta?.intent).toBe('system');
    }
  });

  it('writes performed during jumpTo() carry source=time-travel meta', async () => {
    resetPathNotifier();

    const store = signalTree({ count: 0, label: 'a' }).with(timeTravel());

    (store as any).$.count.set(1);
    await Promise.resolve();
    (store as any).$.label.set('b');
    await Promise.resolve();
    (store as any).$.count.set(2);
    await Promise.resolve();

    const captured: Array<{ path: string; meta?: UpdateMetadata }> = [];
    const restore = interceptLeafSignals(
      (store as any).$,
      (path, _next, _prev, meta) => {
        captured.push({ path, meta });
      }
    );

    const t = (store as any).__timeTravel;
    t.jumpTo(0); // jump to initial state
    await Promise.resolve();

    restore();

    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const c of captured) {
      expect(c.meta?.source).toBe('time-travel');
      expect(c.meta?.intent).toBe('system');
    }
  });

  it('regular user writes (no withWriteContext) carry undefined meta', async () => {
    resetPathNotifier();

    const store = signalTree({ count: 0 }).with(timeTravel());

    const captured: Array<{ path: string; meta?: UpdateMetadata }> = [];
    const restore = interceptLeafSignals(
      (store as any).$,
      (path, _next, _prev, meta) => {
        captured.push({ path, meta });
      }
    );

    (store as any).$.count.set(5);
    await Promise.resolve();

    restore();

    expect(captured.length).toBeGreaterThanOrEqual(1);
    expect(captured[0].meta).toBeUndefined();
  });
});

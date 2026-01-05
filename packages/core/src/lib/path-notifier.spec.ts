import { describe, expect, it, vi } from 'vitest';

import { getPathNotifier, PathNotifier, resetPathNotifier } from './path-notifier';

describe('PathNotifier (batching)', () => {
  it('batches multiple updates to same path and flushes once', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();

    notifier.subscribe('count', (v, p, path) => {
      spy(v, p, path);
    });

    notifier.notify('count', 1, 0);
    notifier.notify('count', 2, 0);
    notifier.notify('count', 3, 0);

    expect(spy).not.toHaveBeenCalled();

    // flush microtask
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3, 0, 'count');
  });

  it('flushSync forces immediate notification', () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();
    notifier.subscribe('x', (v, p, path) => spy(v, p, path));

    notifier.notify('x', 5, 0);
    notifier.flushSync();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(5, 0, 'x');
  });

  it('onFlush is called after flush', async () => {
    const notifier = new PathNotifier();
    const spyFlush = vi.fn();
    notifier.onFlush(spyFlush);

    notifier.notify('a', 1, 0);
    notifier.notify('b', 2, 0);

    expect(spyFlush).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(spyFlush).toHaveBeenCalled();
  });

  it('supports opt-out synchronous mode', () => {
    const notifier = new PathNotifier({ batching: false });
    const spy = vi.fn();
    notifier.subscribe('s', (v, p, path) => spy(v, p, path));

    notifier.notify('s', 1, 0);
    notifier.notify('s', 2, 0);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(2, 0, 's');
  });

  it('getPathNotifier singleton can be reset and toggled', async () => {
    resetPathNotifier();
    const globalN = getPathNotifier();
    expect(globalN).toBeDefined();
    globalN.setBatchingEnabled(true);

    const spy = vi.fn();
    globalN.subscribe('g', (v, p) => spy(v, p, 'g'));
    globalN.notify('g', 1, 0);
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);

    // disable batching
    globalN.setBatchingEnabled(false);
    globalN.notify('g', 2, 1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

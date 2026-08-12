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

  it('propagates ownerPath through batched notifications', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();

    notifier.subscribe('rows.*', (_v, _p, path, ownerPath, _source, subjectIds, positionIds) => {
      spy(path, ownerPath, subjectIds, positionIds);
    });

    notifier.notify('rows.1', { id: 1 }, undefined, 'rows', [17], [3]);
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('rows.1', 'rows', [17], [3]);
  });

  it('treats owner position changes as batching boundaries on the same path', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();

    notifier.subscribe(
      'foo.x',
      (value, prev, path, ownerPath, _source, _subjectIds, positionIds) => {
        spy(value, prev, path, ownerPath, positionIds);
      }
    );

    notifier.notify('foo.x', 'A', 'before-P17', 'foo', undefined, [17]);
    notifier.notify('foo.x', 'B', 'before-P18', 'foo', undefined, [18]);

    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'A', 'before-P17', 'foo.x', 'foo', [17]);
    expect(spy).toHaveBeenNthCalledWith(2, 'B', 'before-P18', 'foo.x', 'foo', [18]);
  });

  it('treats subject changes as batching boundaries on the same path under one owner', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();

    notifier.subscribe(
      'rows.7',
      (value, prev, path, ownerPath, _source, subjectIds, positionIds) => {
        spy(value, prev, path, ownerPath, subjectIds, positionIds);
      }
    );

    notifier.notify(
      'rows.7',
      undefined,
      { id: 7, name: 'first' },
      'rows',
      [17],
      [3]
    );
    notifier.notify(
      'rows.7',
      { id: 7, name: 'replacement' },
      undefined,
      'rows',
      [18],
      [3]
    );

    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      undefined,
      { id: 7, name: 'first' },
      'rows.7',
      'rows',
      [17],
      [3]
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      { id: 7, name: 'replacement' },
      undefined,
      'rows.7',
      'rows',
      [18],
      [3]
    );
  });

  it('marks coalesced writes from different sources as mixed', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();
    const { withWriteContext } = await import('./write-context');

    notifier.subscribe(
      'rows.7',
      (_value, _prev, _path, _ownerPath, source, subjectIds, positionIds) => {
        spy(source, subjectIds, positionIds);
      }
    );

    withWriteContext({ intent: 'system', source: 'time-travel' }, () => {
      notifier.notify('rows.7', { id: 7, name: 'after-replay' }, undefined, 'rows', [17], [3]);
    });
    withWriteContext({ intent: 'user', source: 'devtools' }, () => {
      notifier.notify('rows.7', { id: 7, name: 'after-devtools' }, { id: 7, name: 'after-replay' }, 'rows', [17], [3]);
    });

    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('mixed', [17], [3]);
  });

  it('does not drop owner-only marker notifications during batching', async () => {
    const notifier = new PathNotifier();
    const spy = vi.fn();

    notifier.subscribe('rows', (_v, _p, path, ownerPath) => {
      spy(path, ownerPath);
    });

    notifier.notify('rows', undefined, undefined, 'rows');
    await Promise.resolve();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('rows', 'rows');
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

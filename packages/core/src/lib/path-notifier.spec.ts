import { describe, expect, it, vi } from 'vitest';

import { getPathNotifier, PathNotifier, resetPathNotifier } from './path-notifier';
import type { UpdateMetadata } from './types';

describe('PathNotifier (batching)', () => {
  type ObservedNotification = {
    path: string;
    ownerPath?: string;
    subjectIds?: number[];
    positionIds?: number[];
    meta?: UpdateMetadata;
  };

  const captureNotifications = async (
    emit: (notifier: PathNotifier) => void
  ): Promise<ObservedNotification[]> => {
    const notifier = new PathNotifier();
    const seen: ObservedNotification[] = [];

    notifier.subscribe(
      '**',
      (_value, _prev, path, ownerPath, _source, subjectIds, positionIds, meta) => {
        seen.push({
          path,
          ownerPath,
          subjectIds,
          positionIds,
          meta,
        });
      }
    );

    emit(notifier);
    await Promise.resolve();

    return seen;
  };

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

  it('does not coalesce authoring and realization writes on the same path within one batch', async () => {
    const notifier = new PathNotifier();
    const seen = vi.fn();

    notifier.subscribe(
      'rows.7.name',
      (value, prev, path, ownerPath, _source, subjectIds, positionIds, meta) => {
        seen(value, prev, path, ownerPath, subjectIds, positionIds, meta?.causalMode);
      }
    );

    notifier.notify('rows.7.name', 'B', 'A', 'rows', [17], [3], {
      causalMode: 'authoring',
      mutationIntent: 'replace',
    });
    notifier.notify('rows.7.name', 'C', 'B', 'rows', [17], [3], {
      causalMode: 'realization',
      mutationIntent: 'replace',
    });
    notifier.notify('rows.7.name', 'D', 'C', 'rows', [17], [3], {
      causalMode: 'authoring',
      mutationIntent: 'replace',
    });

    await Promise.resolve();

    expect(seen).toHaveBeenCalledTimes(3);
    expect(seen).toHaveBeenNthCalledWith(
      1,
      'B',
      'A',
      'rows.7.name',
      'rows',
      [17],
      [3],
      'authoring'
    );
    expect(seen).toHaveBeenNthCalledWith(
      2,
      'C',
      'B',
      'rows.7.name',
      'rows',
      [17],
      [3],
      'realization'
    );
    expect(seen).toHaveBeenNthCalledWith(
      3,
      'D',
      'C',
      'rows.7.name',
      'rows',
      [17],
      [3],
      'authoring'
    );
  });

  it('treats implicit and explicit authoring modes as the same batching class', async () => {
    const notifier = new PathNotifier();
    const seen = vi.fn();

    notifier.subscribe(
      'rows.7.name',
      (value, prev, path, ownerPath, _source, subjectIds, positionIds, meta) => {
        seen(value, prev, path, ownerPath, subjectIds, positionIds, meta?.causalMode);
      }
    );

    notifier.notify('rows.7.name', 'B', 'A', 'rows', [17], [3], {
      mutationIntent: 'replace',
    });
    notifier.notify('rows.7.name', 'C', 'B', 'rows', [17], [3], {
      causalMode: 'authoring',
      mutationIntent: 'replace',
    });

    await Promise.resolve();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('C', 'A', 'rows.7.name', 'rows', [17], [3], 'authoring');
  });

  it('still coalesces ordinary authoring writes across unrelated interleaving paths', async () => {
    const notifier = new PathNotifier();
    const seen = vi.fn();

    notifier.subscribe(
      '**',
      (value, prev, path, ownerPath, _source, subjectIds, positionIds, meta) => {
        seen(value, prev, path, ownerPath, subjectIds, positionIds, meta?.causalMode);
      }
    );

    notifier.notify('rows.7.name', 'B', 'A', 'rows', [17], [3], {
      mutationIntent: 'replace',
    });
    notifier.notify('rows.8.name', 'Y', 'X', 'rows', [18], [4], {
      mutationIntent: 'replace',
    });
    notifier.notify('rows.7.name', 'C', 'B', 'rows', [17], [3], {
      mutationIntent: 'replace',
    });

    await Promise.resolve();

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenNthCalledWith(
      1,
      'C',
      'A',
      'rows.7.name',
      'rows',
      [17],
      [3],
      undefined
    );
    expect(seen).toHaveBeenNthCalledWith(
      2,
      'Y',
      'X',
      'rows.8.name',
      'rows',
      [18],
      [4],
      undefined
    );
  });

  it('preserves rekey metadata on the structural notification only when a later same-subject set happens in the same flush', async () => {
    const rekeyedEntity = { id: 42, name: 'pending' };
    const seen = await captureNotifications((notifier) => {
      notifier.notify(
        'rows.42',
        rekeyedEntity,
        rekeyedEntity,
        'rows',
        [17],
        [3],
        {
          historyEffect: {
            kind: 'rekey',
            subject: 17,
            beforeKey: 7,
            afterKey: 42,
          },
        }
      );
      notifier.notify(
        'rows.42.name',
        'later',
        'pending',
        'rows',
        [17],
        [3],
        {
          mutationIntent: 'replace',
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      path: 'rows.42',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        historyEffect: {
          kind: 'rekey',
          subject: 17,
          beforeKey: 7,
          afterKey: 42,
        },
      },
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.42.name',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        mutationIntent: 'replace',
      },
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
  });

  it('preserves rekey metadata on the structural notification only when a later same-subject update happens in the same flush', async () => {
    const rekeyedEntity = { id: 42, name: 'pending' };
    const seen = await captureNotifications((notifier) => {
      notifier.notify(
        'rows.42',
        rekeyedEntity,
        rekeyedEntity,
        'rows',
        [17],
        [3],
        {
          historyEffect: {
            kind: 'rekey',
            subject: 17,
            beforeKey: 7,
            afterKey: 42,
          },
        }
      );
      notifier.notify(
        'rows.42.name',
        'later',
        'pending',
        'rows',
        [17],
        [3],
        {
          mutationIntent: 'derive',
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.meta?.historyEffect).toMatchObject({
      kind: 'rekey',
      subject: 17,
      beforeKey: 7,
      afterKey: 42,
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.42.name',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        mutationIntent: 'derive',
      },
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
  });

  it('does not drop a same-reference structural notification when historyEffect is present', async () => {
    const rekeyedEntity = { id: 42, name: 'pending' };
    const seen = await captureNotifications((notifier) => {
      notifier.notify(
        'rows.42',
        rekeyedEntity,
        rekeyedEntity,
        'rows',
        [17],
        [3],
        {
          historyEffect: {
            kind: 'rekey',
            subject: 17,
            beforeKey: 7,
            afterKey: 42,
          },
        }
      );
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      path: 'rows.42',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        historyEffect: {
          kind: 'rekey',
          subject: 17,
          beforeKey: 7,
          afterKey: 42,
        },
      },
    });
  });

  it('keeps structural metadata on the structural entry when a later same-path notification with matching identity follows it', async () => {
    const seen = await captureNotifications((notifier) => {
      const transactionOwner = { token: 'same-owner' };
      notifier.notify(
        'rows.42',
        { id: 42, name: 'pending' },
        { id: 42, name: 'pending' },
        'rows',
        [17],
        [3],
        {
          transactionId: 1,
          transactionOwner,
          historyEffect: {
            kind: 'rekey',
            subject: 17,
            beforeKey: 7,
            afterKey: 42,
          },
        }
      );
      notifier.notify(
        'rows.42',
        { id: 42, name: 'pending' },
        { id: 42, name: 'pending' },
        'rows',
        [17],
        [3],
        {
          transactionId: 1,
          transactionOwner,
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      path: 'rows.42',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        transactionId: 1,
        historyEffect: {
          kind: 'rekey',
          subject: 17,
          beforeKey: 7,
          afterKey: 42,
        },
      },
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.42',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        transactionId: 1,
      },
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
  });

  it('keeps same-path structural and later entity updates separate within one flush', async () => {
    const seen = await captureNotifications((notifier) => {
      const transactionOwner = { token: 'same-owner' };
      notifier.notify(
        'rows.42',
        { id: 42, name: 'temp' },
        { id: 42, name: 'temp' },
        'rows',
        [17],
        [3],
        {
          transactionId: 1,
          transactionOwner,
          historyEffect: {
            kind: 'rekey',
            subject: 17,
            beforeKey: 7,
            afterKey: 42,
          },
        }
      );
      notifier.notify(
        'rows.42',
        { id: 42, name: 'stable' },
        { id: 42, name: 'temp' },
        'rows',
        [17],
        [3],
        {
          transactionId: 1,
          transactionOwner,
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.meta?.historyEffect).toMatchObject({
      kind: 'rekey',
      subject: 17,
      beforeKey: 7,
      afterKey: 42,
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.42',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
  });

  it('preserves add metadata on the structural notification only when a later same-subject set happens in the same flush', async () => {
    const seen = await captureNotifications((notifier) => {
      notifier.notify(
        'rows.17',
        { id: 17, name: 'pending' },
        undefined,
        'rows',
        [17],
        [3],
        {
          historyEffect: {
            kind: 'add',
            subject: 17,
            key: 17,
            value: { id: 17, name: 'pending' },
          },
        }
      );
      notifier.notify(
        'rows.17.name',
        'later',
        'pending',
        'rows',
        [17],
        [3],
        {
          mutationIntent: 'replace',
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      path: 'rows.17',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        historyEffect: {
          kind: 'add',
          subject: 17,
          key: 17,
        },
      },
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.17.name',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        mutationIntent: 'replace',
      },
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
  });

  it('preserves add metadata on the structural notification only when a later same-subject update happens in the same flush', async () => {
    const seen = await captureNotifications((notifier) => {
      notifier.notify(
        'rows.17',
        { id: 17, name: 'pending' },
        undefined,
        'rows',
        [17],
        [3],
        {
          historyEffect: {
            kind: 'add',
            subject: 17,
            key: 17,
            value: { id: 17, name: 'pending' },
          },
        }
      );
      notifier.notify(
        'rows.17.name',
        'later',
        'pending',
        'rows',
        [17],
        [3],
        {
          mutationIntent: 'derive',
        }
      );
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.meta?.historyEffect).toMatchObject({
      kind: 'add',
      subject: 17,
      key: 17,
    });
    expect(seen[1]).toMatchObject({
      path: 'rows.17.name',
      ownerPath: 'rows',
      subjectIds: [17],
      positionIds: [3],
      meta: {
        mutationIntent: 'derive',
      },
    });
    expect(seen[1]?.meta?.historyEffect).toBeUndefined();
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

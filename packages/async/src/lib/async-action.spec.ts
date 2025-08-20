import { signalTree } from '@signaltree/core';
import { withAsync } from './async';

function delay<T>(
  ms: number,
  value?: T,
  signal?: AbortSignal
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const id = setTimeout(() => resolve(value), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

describe('withAsync / asyncAction integration', () => {
  it('asyncAction executes with lifecycle hooks (success)', async () => {
    const tree = withAsync()(
      signalTree({ status: 'idle', data: null as number | null })
    );
    const action = tree.asyncAction<number, number>(async (n) => n * 2, {
      onStart: () => ({ status: 'pending' }),
      onSuccess: (res) => ({ status: 'success', data: res }),
      onComplete: () => ({ status: 'done' }),
    });
    const p = action.execute(2);
    expect(action.pending()).toBe(true);
    const result = await p;
    expect(result).toBe(4);
    expect(action.pending()).toBe(false);
    expect(tree.unwrap()).toEqual({ status: 'done', data: 4 });
  });

  it('asyncAction handles error and applies onError patch', async () => {
    const tree = withAsync()(
      signalTree({ status: 'idle', error: null as string | null })
    );
    const action = tree.asyncAction<number, number>(
      async () => {
        throw new Error('fail');
      },
      {
        onStart: () => ({ status: 'pending', error: null }),
        onError: (err) => ({ status: 'error', error: err.message }),
        onComplete: () => ({ status: 'final' }),
      }
    );
    await expect(action.execute(1)).rejects.toThrow('fail');
    expect(tree.unwrap()).toEqual({ status: 'final', error: 'fail' });
    expect(action.error()?.message).toBe('fail');
  });

  it('asyncAction ignores stale result from earlier run (replace policy)', async () => {
    const tree = withAsync()(signalTree({ value: 0 }));
    const resolvers: Array<() => void> = [];
    const action = tree.asyncAction<number, number>(
      (n) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(n));
        }),
      {
        onSuccess: (res) => ({ value: res }),
        concurrencyPolicy: 'replace',
        enableCancellation: true,
      }
    );
    const first = action.execute(1); // will resolve later
    const second = action.execute(2); // cancels first
    resolvers[1](); // resolve second
    // Also resolve first to ensure its promise settles (may reject due to abort)
    if (resolvers[0]) {
      try {
        resolvers[0]();
      } catch {
        /* ignore */
      }
    }
    await second;
    // first promise may reject due to abort, ignore
    await first.catch(() => undefined);
    expect(tree.unwrap().value).toBe(2);
  });

  it('cancellation aborts in-flight request', async () => {
    const tree = withAsync()(signalTree({ status: 'idle' }));
    let aborted = false;
    const action = tree.asyncAction<number, number>(
      (n: number, signal?: AbortSignal) =>
        new Promise<number>((resolve, reject) => {
          const t = setTimeout(() => resolve(n * 3), 50);
          signal?.addEventListener('abort', () => {
            aborted = true;
            clearTimeout(t);
            reject(new Error('aborted'));
          });
        }),
      {
        enableCancellation: true,
        label: 'triple',
        onStart: () => ({ status: 'pending' }),
        onError: () => ({ status: 'error' }),
      }
    );
    const first = action.execute(2).catch(() => undefined);
    action.cancel();
    await first;
    expect(aborted).toBe(true);
  });

  it('drop policy ignores new executes while pending', async () => {
    const tree = withAsync()(signalTree({ calls: 0, value: 0 }));
    const action = tree.asyncAction<number, number>(
      (n) =>
        new Promise((resolve) => {
          tree.update((s) => ({ calls: s.calls + 1 }));
          setTimeout(() => resolve(n * 2), 10);
        }),
      {
        concurrencyPolicy: 'drop',
        onSuccess: (res) => ({ value: res }),
      }
    );
    const first = action.execute(2);
    const second = action.execute(4); // should be dropped
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toBe(4);
    expect(r2).toBe(4);
    expect(tree.unwrap().value).toBe(4);
    expect(tree.unwrap().calls).toBe(1);
  });

  it('queue policy processes calls sequentially', async () => {
    const tree = withAsync()(signalTree({ order: [] as number[] }));
    const action = tree.asyncAction<number, number>(
      (n) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(n), 5);
        }),
      {
        concurrencyPolicy: 'queue',
        onSuccess: (res, state) => ({ order: [...state.order, res] }),
      }
    );
    const p1 = action.execute(1);
    const p2 = action.execute(2);
    const p3 = action.execute(3);
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([1, 2, 3]);
    expect(tree.unwrap().order).toEqual([1, 2, 3]);
  });

  it('race policy applies only first settled result', async () => {
    const tree = withAsync()(signalTree({ result: 0 }));
    const action = tree.asyncAction<number, number>(
      (n) =>
        new Promise((resolve) => {
          const d = n === 20 ? 5 : 15;
          setTimeout(() => resolve(n), d);
        }),
      {
        concurrencyPolicy: 'race',
        onSuccess: (res) => ({ result: res }),
      }
    );
    const p1 = action.execute(10);
    const p2 = action.execute(20);
    await Promise.all([p1, p2]);
    expect(tree.unwrap().result).toBe(20);
  });

  it('queue policy continues after error and preserves order', async () => {
    const tree = withAsync()(signalTree({ calls: [] as string[] }));
    let failOnce = true;
    const action = tree.asyncAction<number, void>(
      async (n) => {
        await delay(5);
        if (failOnce && n === 2) {
          failOnce = false;
          throw new Error('boom');
        }
      },
      {
        concurrencyPolicy: 'queue',
        onSuccess: (_, s) => ({ calls: [...s.calls, 'ok'] }),
        onError: (_, s) => ({ calls: [...s.calls, 'err'] }),
      }
    );
    await Promise.allSettled([
      action.execute(1),
      action.execute(2),
      action.execute(3),
    ]);
    expect(tree.unwrap().calls).toEqual(['ok', 'err', 'ok']);
  });
});

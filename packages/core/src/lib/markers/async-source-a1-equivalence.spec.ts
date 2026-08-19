import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';

import { signalTree } from '../signal-tree';
import { asyncSource } from './async-source';

/**
 * A1-1 FALSIFIERS — external acquisition ownership.
 *
 * RFC 0016 Derivation A1. The null: assume SignalTree never invokes
 * user-supplied async acquisition functions; applications perform external work
 * and commit results through ordinary public tree writes. What independently
 * required SignalTree semantic function becomes impossible?
 *
 * METHOD, and it is the point of the file. Methodology Rule 2 says an ABSENCE
 * claim cannot rest on an incomplete vocabulary search. The symmetric
 * discipline applies to a POSITIVE equivalence claim: it must not rest on one
 * toy rewrite. So each behaviour of the real marker is exercised, and the
 * ordinary-store equivalent is run beside it against the SAME assertions.
 *
 * `plainAcquire` below is deliberately unremarkable — a signal triple plus an
 * async function, which is what an application service would write. If it
 * reproduces every measured behaviour, then nothing SignalTree uniquely owns
 * was required to obtain it.
 *
 * These are MEASUREMENTS, not desired behaviour. Where the marker's behaviour is
 * a defect it is labelled DEFECT and must not be read as a contract (Rule 0l).
 */

/** The ordinary-application equivalent. No SignalTree concepts are used. */
function plainAcquire<T>(load: () => Promise<T>, initial: T) {
  const data = signal<T>(initial);
  const loading = signal(false);
  const error = signal<unknown>(null);
  let run = 0;

  const refresh = async () => {
    const mine = ++run;
    loading.set(true);
    error.set(null);
    try {
      const value = await load();
      if (mine !== run) return; // generation guard — see A1-C3
      data.set(value);
    } catch (err) {
      if (mine !== run) return;
      error.set(err);
    } finally {
      if (mine === run) loading.set(false);
    }
  };
  const reset = () => {
    run++;
    loading.set(false);
    error.set(null);
    data.set(initial);
  };
  return { data, loading, error, refresh, reset };
}

const drain = async (turns = 6) => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('A1-1 — what does SignalTree uniquely provide by invoking the loader?', () => {
  it('A1-C1: eager initial acquisition — reproduced exactly', async () => {
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: [],
        load: () => Promise.resolve(['ada']),
      }),
    });
    void tree.$.users();
    await drain();
    expect(tree.$.users.data()).toEqual(['ada']);
    expect(tree.$.users.loading()).toBe(false);

    const plain = plainAcquire(() => Promise.resolve(['ada']), [] as string[]);
    await plain.refresh();
    expect(plain.data()).toEqual(['ada']);
    expect(plain.loading()).toBe(false);
  });

  it('A1-C2: lazy — no acquisition until asked; reproduced by simply not calling', async () => {
    let calls = 0;
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: [],
        lazy: true,
        load: () => {
          calls++;
          return Promise.resolve(['ada']);
        },
      }),
    });
    void tree.$.users();
    await drain();
    expect(calls).toBe(0);

    tree.$.users.refresh();
    await drain();
    expect(calls).toBe(1);

    // The plain equivalent of "lazy" is not calling refresh(). There is no
    // capability here — `lazy` names the absence of an eager call.
    let plainCalls = 0;
    const plain = plainAcquire(() => {
      plainCalls++;
      return Promise.resolve(['ada']);
    }, [] as string[]);
    expect(plainCalls).toBe(0);
    await plain.refresh();
    expect(plainCalls).toBe(1);
  });

  it('A1-C3 DEFECT: the marker lets an obsolete completion win; the plain version does not', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    let call = 0;
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: [],
        lazy: true,
        load: () => (++call === 1 ? first.promise : second.promise),
      }),
    });
    void tree.$.users();
    await drain();

    tree.$.users.refresh();
    tree.$.users.refresh();
    second.resolve(['NEWER']);
    await drain();
    first.resolve(['OLDER']); // started first, completes last
    await drain();

    // MEASURED: the Promise path has no generation guard, so the obsolete
    // completion overwrites the newer result.
    expect(tree.$.users.data()).toEqual(['OLDER']);

    // The ordinary application version guards it in four lines.
    let pcall = 0;
    const pf = deferred<string[]>();
    const ps = deferred<string[]>();
    const plain = plainAcquire(
      () => (++pcall === 1 ? pf.promise : ps.promise),
      [] as string[]
    );
    void plain.refresh();
    void plain.refresh();
    ps.resolve(['NEWER']);
    await drain();
    pf.resolve(['OLDER']);
    await drain();
    expect(plain.data()).toEqual(['NEWER']);
  });

  it('A1-C4: failure recording — reproduced exactly', async () => {
    const boom = new Error('boom');
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: [],
        load: () => Promise.reject(boom),
      }),
    });
    void tree.$.users();
    await drain();
    expect(tree.$.users.error()).toBe(boom);
    expect(tree.$.users.loading()).toBe(false);

    const plain = plainAcquire<string[]>(() => Promise.reject(boom), []);
    await plain.refresh();
    expect(plain.error()).toBe(boom);
    expect(plain.loading()).toBe(false);
  });

  it('A1-C5: reset — reproduced exactly', async () => {
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: ['seed'],
        load: () => Promise.resolve(['ada']),
      }),
    });
    void tree.$.users();
    await drain();
    expect(tree.$.users.data()).toEqual(['ada']);
    tree.$.users.reset();
    expect(tree.$.users.data()).toEqual(['seed']);

    const plain = plainAcquire(() => Promise.resolve(['ada']), ['seed']);
    await plain.refresh();
    expect(plain.data()).toEqual(['ada']);
    plain.reset();
    expect(plain.data()).toEqual(['seed']);
  });

  it('A1-C6: the landed value carries no tree-owned semantics an app write lacks', async () => {
    const tree = signalTree({
      users: asyncSource<string[]>({
        initial: [],
        load: () => Promise.resolve(['ada']),
      }),
      plain: [] as string[],
    });
    void tree.$.users();
    await drain();

    // An ordinary authored write to an ordinary position.
    tree.$.plain.set(['ada']);

    // Same value, same readability, same unwrap participation. The acquired
    // value is not distinguishable as a category from the authored one.
    expect(tree.$.users.data()).toEqual(tree.$.plain());
    expect(tree().plain).toEqual(['ada']);
  });
});

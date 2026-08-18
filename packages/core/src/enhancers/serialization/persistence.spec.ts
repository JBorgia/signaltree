import { afterEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from '../../lib/types';
import { form } from '../../lib/markers/form';
import { persistence } from './serialization';
import { signalTree } from '../../lib/signal-tree';
import { status } from '../../lib/markers/status';
import { createStorageAdapter } from './storage-adapters';

/**
 * `persistence()` is public API — `llms.txt` and the README both teach it — and
 * it had **no dedicated test**. It was the largest uncovered block in
 * serialization.ts, which is also the file 14.0.0 changed most: the payload it
 * writes is the marker snapshot format, so an untested persist path is an
 * untested version of the release's headline change.
 *
 * Everything here drives a real in-memory adapter through
 * `createStorageAdapter`, so the enhancer's contract with the adapter interface
 * is exercised rather than mocked away.
 */
const memoryStorage = () => {
  const map = new Map<string, string>();
  const adapter = createStorageAdapter(
    (k) => map.get(k) ?? null,
    (k, v) => void map.set(k, v),
    (k) => void map.delete(k)
  );
  return { map, adapter };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.restoreAllMocks());

describe('persistence(): save / load / clear', () => {
  it('save() writes the tree under the configured key', async () => {
    const { map, adapter } = memoryStorage();
    const tree = signalTree({ count: 0, user: { name: 'a' } }).with(
      persistence({ key: 'app', storage: adapter, autoSave: false, autoLoad: false })
    );

    tree.$.count.set(7);
    await tree.save();

    expect(map.has('app')).toBe(true);
    expect(JSON.parse(map.get('app') as string).data.count).toBe(7);
  });

  it('load() restores a previously saved tree', async () => {
    const { adapter } = memoryStorage();
    const cfg = { key: 'app', storage: adapter, autoSave: false, autoLoad: false };

    const a = signalTree({ count: 0 }).with(persistence(cfg));
    a.$.count.set(42);
    await a.save();

    const b = signalTree({ count: 0 }).with(persistence(cfg));
    await b.load();

    expect(b.$.count()).toBe(42);
  });

  it('clear() removes the stored payload', async () => {
    const { map, adapter } = memoryStorage();
    const tree = signalTree({ count: 1 }).with(
      persistence({ key: 'app', storage: adapter, autoSave: false, autoLoad: false })
    );

    await tree.save();
    expect(map.has('app')).toBe(true);

    await tree.clear();
    expect(map.has('app')).toBe(false);
  });

  it('load() on an empty store leaves the tree at its initial value', async () => {
    const { adapter } = memoryStorage();
    const tree = signalTree({ count: 5 }).with(
      persistence({ key: 'nothing-here', storage: adapter, autoSave: false, autoLoad: false })
    );

    await expect(tree.load()).resolves.toBeUndefined();
    expect(tree.$.count()).toBe(5);
  });
});

describe('persistence(): autoLoad', () => {
  it('restores on creation when autoLoad is on', async () => {
    const { adapter } = memoryStorage();
    const seed = signalTree({ count: 0 }).with(
      persistence({ key: 'auto', storage: adapter, autoSave: false, autoLoad: false })
    );
    seed.$.count.set(99);
    await seed.save();

    const fresh = signalTree({ count: 0 }).with(
      persistence({ key: 'auto', storage: adapter, autoSave: false, autoLoad: true })
    );
    await flush();

    expect(fresh.$.count()).toBe(99);
  });

  it('does NOT restore when autoLoad is off', async () => {
    const { adapter } = memoryStorage();
    const seed = signalTree({ count: 0 }).with(
      persistence({ key: 'noauto', storage: adapter, autoSave: false, autoLoad: false })
    );
    seed.$.count.set(99);
    await seed.save();

    const fresh = signalTree({ count: 0 }).with(
      persistence({ key: 'noauto', storage: adapter, autoSave: false, autoLoad: false })
    );
    await flush();

    expect(fresh.$.count()).toBe(0);
  });
});

describe('persistence(): autoSave', () => {
  it('persists a write without an explicit save()', async () => {
    const { map, adapter } = memoryStorage();
    const tree = signalTree({ count: 0 }).with(
      persistence({
        key: 'as',
        storage: adapter,
        autoSave: true,
        autoLoad: false,
        debounceMs: 0,
      })
    );

    tree.$.count.set(3);

    // ⚠️ ORDERING, measured: `__flushAutoSave()` called SYNCHRONOUSLY after a
    // write does not flush that write — the debounce timer has not been
    // scheduled yet, so there is nothing to flush. One tick first, then flush.
    // Worth pinning: the naive sequence silently persists nothing, and this
    // test failed exactly that way before the tick was added.
    await flush();
    await (tree as unknown as { __flushAutoSave?: () => Promise<void> })
      .__flushAutoSave?.();

    expect(map.has('as')).toBe(true);
    expect(JSON.parse(map.get('as') as string).data.count).toBe(3);
  });

  it('persists on its own without any flush, given time', async () => {
    const { map, adapter } = memoryStorage();
    const tree = signalTree({ count: 0 }).with(
      persistence({
        key: 'as2',
        storage: adapter,
        autoSave: true,
        autoLoad: false,
        debounceMs: 0,
      })
    );

    tree.$.count.set(4);
    await new Promise((r) => setTimeout(r, 250));

    expect(JSON.parse(map.get('as2') as string).data.count).toBe(4);
  });

  it('does NOT persist a write when autoSave is off', async () => {
    const { map, adapter } = memoryStorage();
    const tree = signalTree({ count: 0 }).with(
      persistence({ key: 'off', storage: adapter, autoSave: false, autoLoad: false })
    );

    tree.$.count.set(5);
    await new Promise((r) => setTimeout(r, 250));

    expect(map.has('off')).toBe(false);
  });
});

describe('persistence(): the 14.0.0 payload actually round-trips markers', () => {

  it('a LOADING status is normalised on load — nothing is in flight after a reload', async () => {
    const { adapter } = memoryStorage();
    const cfg = { key: 'inflight', storage: adapter, autoSave: false, autoLoad: false };

    const a = signalTree({ job: status<Error>() }).with(persistence(cfg));
    a.$.job.setLoading();
    await a.save();

    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const b = signalTree({ job: status<Error>() }).with(persistence(cfg));
    await b.load();

    // `load()` crosses a process boundary in the case it exists for, so a
    // restored LOADING would strand a spinner nothing will resolve.
    expect(b.$.job.loading()).toBe(false);
  });
});

describe('persistence(): configuration is validated', () => {
  it('throws when no storage adapter is available', () => {
    const original = globalThis.window;
    // Simulate a non-browser environment with no explicit adapter.
    (globalThis as { window?: unknown }).window = undefined;
    try {
      expect(() => persistence({ key: 'k' })).toThrow(/storage adapter/i);
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });
});

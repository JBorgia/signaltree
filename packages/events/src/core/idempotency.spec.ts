import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BaseEvent } from './types';
import { InMemoryIdempotencyStore } from './idempotency';

/**
 * `InMemoryIdempotencyStore` — 452 lines at 0% coverage.
 *
 * It is the thing standing between an at-least-once delivery guarantee and a
 * customer being charged twice. It is also pure logic with no I/O, so there was
 * no reason for it to be untested beyond nobody having done it.
 *
 * The cases that matter are the ones where "is this a duplicate?" is genuinely
 * ambiguous: an event still being processed by someone else, a lock whose owner
 * died, a record that has aged out. Those are where a wrong answer is silent.
 */
type Evt = BaseEvent<string, unknown>;

const evt = (id: string, type = 'Test'): Evt =>
  ({ id, type, data: {}, timestamp: Date.now() }) as Evt;

const stores: InMemoryIdempotencyStore[] = [];
/** cleanupIntervalMs: 0 — an interval timer would keep vitest alive. */
const makeStore = (config: Record<string, unknown> = {}) => {
  const s = new InMemoryIdempotencyStore({ cleanupIntervalMs: 0, ...config });
  stores.push(s);
  return s;
};
afterEach(() => {
  while (stores.length) stores.pop()?.dispose?.();
  vi.useRealTimers();
});

describe('first sighting', () => {
  it('a brand new event is not a duplicate', async () => {
    const store = makeStore();
    const result = await store.check(evt('e1'), 'consumer-a');
    expect(result.isDuplicate).toBe(false);
  });

  it('acquires the lock by default', async () => {
    const store = makeStore();
    const result = await store.check(evt('e1'), 'consumer-a');
    expect(result.lockAcquired).toBe(true);
  });

  it('acquireLock: false checks WITHOUT claiming it', async () => {
    const store = makeStore();
    const first = await store.check(evt('e1'), 'c', { acquireLock: false });
    expect(first.lockAcquired).toBeUndefined();

    // Nothing was recorded, so the next check still sees a new event.
    const second = await store.check(evt('e1'), 'c', { acquireLock: false });
    expect(second.isDuplicate).toBe(false);
  });
});

describe('the same event twice', () => {
  it('the second check IS a duplicate while the first still holds the lock', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');

    const second = await store.check(evt('e1'), 'c');

    expect(second.isDuplicate).toBe(true);
    expect(second.processedAt).toBeInstanceOf(Date);
  });

  it('a DIFFERENT consumer is not blocked by the first consumer', async () => {
    // At-least-once fan-out: two consumers must each get the event once.
    const store = makeStore();
    await store.check(evt('e1'), 'consumer-a');

    const other = await store.check(evt('e1'), 'consumer-b');

    expect(other.isDuplicate).toBe(false);
  });

  it('a different EVENT is not blocked', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');
    expect((await store.check(evt('e2'), 'c')).isDuplicate).toBe(false);
  });
});

describe('completion and failure', () => {
  it('a completed event is a duplicate, and returns the cached result', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');
    await store.markCompleted(evt('e1'), 'c', { ok: true });

    const again = await store.check(evt('e1'), 'c');

    expect(again.isDuplicate).toBe(true);
    expect(again.result).toEqual({ ok: true });
  });

  it('a FAILED event is still recorded as seen', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');
    await store.markFailed(evt('e1'), 'c', new Error('boom'));

    const again = await store.check(evt('e1'), 'c');

    expect(again.isDuplicate).toBe(true);
  });

  it('getRecord reflects the lifecycle', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');
    expect((await store.getRecord('e1', 'c'))?.status).toBe('processing');

    await store.markCompleted(evt('e1'), 'c', null);
    expect((await store.getRecord('e1', 'c'))?.status).toBe('completed');
  });

  it('getRecord is null for something never seen', async () => {
    // null, not undefined — asserted the wrong one first and the test caught it.
    expect(await makeStore().getRecord('nope', 'c')).toBeNull();
  });
});

describe('a lock whose owner died', () => {
  it('an EXPIRED processing lock allows reprocessing', async () => {
    // The case that decides whether a crashed consumer wedges an event forever.
    vi.useFakeTimers();
    const store = makeStore({ defaultLockTtlMs: 1000 });
    await store.check(evt('e1'), 'c');

    vi.advanceTimersByTime(2000);
    const retry = await store.check(evt('e1'), 'c');

    expect(retry.isDuplicate).toBe(false);
  });

  it('and the retry re-acquires the lock, counting the attempt', async () => {
    vi.useFakeTimers();
    const store = makeStore({ defaultLockTtlMs: 1000 });
    await store.check(evt('e1'), 'c');

    vi.advanceTimersByTime(2000);
    const retry = await store.check(evt('e1'), 'c', { acquireLock: true });

    expect(retry.lockAcquired).toBe(true);
    expect((await store.getRecord('e1', 'c'))?.attempts).toBe(2);
  });

  it('a lock still WITHIN its ttl is respected', async () => {
    vi.useFakeTimers();
    const store = makeStore({ defaultLockTtlMs: 5000 });
    await store.check(evt('e1'), 'c');

    vi.advanceTimersByTime(1000);

    expect((await store.check(evt('e1'), 'c')).isDuplicate).toBe(true);
  });

  it('releaseLock lets another attempt through', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');

    await store.releaseLock(evt('e1'), 'c');

    expect((await store.check(evt('e1'), 'c')).isDuplicate).toBe(false);
  });
});

describe('records aging out', () => {
  it('an expired record no longer counts as a duplicate', async () => {
    vi.useFakeTimers();
    const store = makeStore({ defaultTtlMs: 1000 });
    await store.check(evt('e1'), 'c');
    await store.markCompleted(evt('e1'), 'c', null);

    vi.advanceTimersByTime(5000);

    expect((await store.check(evt('e1'), 'c')).isDuplicate).toBe(false);
  });

  it('cleanup reports how many it removed', async () => {
    vi.useFakeTimers();
    const store = makeStore({ defaultTtlMs: 1000 });
    await store.check(evt('e1'), 'c');
    await store.check(evt('e2'), 'c');

    vi.advanceTimersByTime(5000);

    expect(await store.cleanup()).toBeGreaterThan(0);
  });

  it('clear empties everything', async () => {
    const store = makeStore();
    await store.check(evt('e1'), 'c');

    await store.clear();

    expect((await store.check(evt('e1'), 'c')).isDuplicate).toBe(false);
  });
});

describe('bounded growth', () => {
  it('maxRecords is enforced, so the store cannot grow forever', async () => {
    const store = makeStore({ maxRecords: 5 });
    for (let i = 0; i < 20; i++) await store.check(evt(`e${i}`), 'c');

    expect(store.getStats().size).toBeLessThanOrEqual(5);
  });

  it('getStats reports size against the configured ceiling', async () => {
    // The real shape is { size, maxRecords } — synchronous. I assumed an async
    // { total, completed } breakdown; the assertion corrected me.
    const store = makeStore({ maxRecords: 100 });
    await store.check(evt('e1'), 'c');
    await store.check(evt('e2'), 'c');

    const stats = store.getStats();

    expect(stats.size).toBe(2);
    expect(stats.maxRecords).toBe(100);
  });
});

import { computed, isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import {
  type AtomicScalarFrame,
  createAtomicScalarStore,
  StaleAtomicScalarFrameError,
} from './atomic-scalar-store';

type ResolvedWrite<TSnapshot extends Record<string, unknown>> = {
  leaf: ReturnType<ReturnType<typeof createAtomicScalarStore<TSnapshot>>['writablePath']>;
  value: unknown;
};

function commitResolvedWrites<TSnapshot extends Record<string, unknown>>(
  frame: AtomicScalarFrame<TSnapshot>,
  writes: readonly ResolvedWrite<TSnapshot>[]
): void {
  for (const write of writes) {
    frame.set(write.leaf as never, write.value as never);
  }
  frame.commit();
}

describe('atomic scalar store spike', () => {
  it('keeps staged writes invisible until commit', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const frame = store.beginFrame();

    frame.set(a, 'A2');
    frame.set(b, 'B2');

    expect(a()).toBe('A');
    expect(b()).toBe('B');
    expect(store.snapshot()).toEqual({ a: 'A', b: 'B' });
  });

  it('discard is inert', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const frame = store.beginFrame();

    frame.set(a, 'A2');
    frame.set(b, 'B2');
    frame.discard();

    expect(a()).toBe('A');
    expect(b()).toBe('B');
    expect(store.snapshot()).toEqual({ a: 'A', b: 'B' });
  });

  it('commits with one root publication and both values appear together', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const pair = computed(() => `${a()}|${b()}`);

    expect(pair()).toBe('A|B');

    const frame = store.beginFrame();
    frame.set(a, 'A2');
    frame.set(b, 'B2');

    expect(pair()).toBe('A|B');

    frame.commit();

    expect(store.publicationCount()).toBe(1);
    expect(pair()).toBe('A2|B2');
    expect(a()).toBe('A2');
    expect(b()).toBe('B2');
  });

  it('keeps leaf object identity stable across a root snapshot swap', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const frame = store.beginFrame();

    frame.set(a, 'A2');
    frame.commit();

    expect(store.writable('a')).toBe(a);
    expect(a()).toBe('A2');
  });

  it('leaves are still native Angular signals with .set() and .update()', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');

    expect(isSignal(a)).toBe(true);
    expect(Object.getOwnPropertySymbols(a).map(String)).toContain('Symbol(SIGNAL)');

    a.set('A2');
    expect(a()).toBe('A2');
    expect(store.snapshot()).toEqual({ a: 'A2', b: 'B' });

    a.update((current) => `${current}!`);
    expect(a()).toBe('A2!');
    expect(store.snapshot()).toEqual({ a: 'A2!', b: 'B' });
  });

  it('readonly views stay attached to the same committed source across a frame commit', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const readonlyA = a.asReadonly();
    const frame = store.beginFrame();

    frame.set(a, 'A2');

    expect(readonlyA()).toBe('A');

    frame.commit();

    expect(a()).toBe('A2');
    expect(readonlyA()).toBe('A2');
    expect(store.writable('a')).toBe(a);
  });

  it('leaf update uses the latest committed value, not a stale lens cache', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');

    b.set('B2');
    a.set('A2');
    a.update((current) => `${current}!`);

    expect(a()).toBe('A2!');
    expect(b()).toBe('B2');
    expect(store.snapshot()).toEqual({ a: 'A2!', b: 'B2' });
  });

  it('leaves the committed source untouched when staging logic throws', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const frame = store.beginFrame();

    expect(() => {
      frame.update(a, () => {
        throw new Error('boom');
      });
    }).toThrow('boom');

    expect(a()).toBe('A');
    expect(b()).toBe('B');
    expect(store.snapshot()).toEqual({ a: 'A', b: 'B' });
  });

  it('refuses to commit a stale frame after a later live write', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const frame = store.beginFrame();

    frame.set(a, 'A2');
    b.set('B2');

    expect(() => frame.commit()).toThrow(StaleAtomicScalarFrameError);
    expect(store.snapshot()).toEqual({ a: 'A', b: 'B2' });
    expect(store.publicationCount()).toBe(1);
    expect(store.revision()).toBe(1);
  });

  it('refuses the second of two frames that began from the same base revision', () => {
    const store = createAtomicScalarStore({ a: 'A', b: 'B' });
    const a = store.writable('a');
    const b = store.writable('b');
    const frame1 = store.beginFrame();
    const frame2 = store.beginFrame();

    frame1.set(a, 'A2');
    frame2.set(b, 'B2');

    frame1.commit();

    expect(store.snapshot()).toEqual({ a: 'A2', b: 'B' });
    expect(store.publicationCount()).toBe(1);
    expect(store.revision()).toBe(1);

    expect(() => frame2.commit()).toThrow(StaleAtomicScalarFrameError);
    expect(store.snapshot()).toEqual({ a: 'A2', b: 'B' });
    expect(store.publicationCount()).toBe(1);
    expect(store.revision()).toBe(1);
  });

  it('supports nested path lenses without leaking staged mutations into the committed root', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
      stats: { count: 1 },
    });
    const name = store.writablePath<string>(['profile', 'name']);
    const enabled = store.writablePath<boolean>(['profile', 'enabled']);
    const committedProfile = store.snapshot().profile;
    const committedStats = store.snapshot().stats;
    const frame = store.beginFrame();

    frame.set(name, 'Alicia');

    expect(name()).toBe('Alice');
    expect(enabled()).toBe(true);
    expect(store.snapshot().profile).toBe(committedProfile);
    expect(store.snapshot().stats).toBe(committedStats);
    expect(store.snapshot().profile.name).toBe('Alice');
  });

  it('clones mutated nested ancestors on commit while preserving untouched sibling references', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
      stats: { count: 1 },
    });
    const name = store.writablePath<string>(['profile', 'name']);
    const committedProfile = store.snapshot().profile;
    const committedStats = store.snapshot().stats;
    const frame = store.beginFrame();

    frame.set(name, 'Alicia');
    frame.commit();

    expect(name()).toBe('Alicia');
    expect(store.snapshot().profile).not.toBe(committedProfile);
    expect(store.snapshot().stats).toBe(committedStats);
    expect(store.snapshot()).toEqual({
      profile: { name: 'Alicia', enabled: true },
      stats: { count: 1 },
    });
  });

  it('keeps nested path lens identity stable across root publications', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
      stats: { count: 1 },
    });
    const name = store.writablePath<string>(['profile', 'name']);
    const sameName = store.writablePath<string>(['profile', 'name']);

    expect(sameName).toBe(name);

    const frame = store.beginFrame();
    frame.set(name, 'Alicia');
    frame.commit();

    expect(store.writablePath<string>(['profile', 'name'])).toBe(name);
    expect(name()).toBe('Alicia');
  });

  it('applies sibling nested writes against the latest staged snapshot in frame order', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
    });
    const name = store.writablePath<string>(['profile', 'name']);
    const enabled = store.writablePath<boolean>(['profile', 'enabled']);
    const frame = store.beginFrame();

    frame.set(name, 'Alicia');
    frame.set(enabled, false);
    frame.commit();

    expect(store.snapshot()).toEqual({
      profile: { name: 'Alicia', enabled: false },
    });
  });

  it('lets a later parent write override an earlier child write in the same frame', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
    });
    const profile = store.writablePath<{ name: string; enabled: boolean }>(['profile']);
    const name = store.writablePath<string>(['profile', 'name']);
    const frame = store.beginFrame();

    frame.set(name, 'Alicia');
    frame.set(profile, { name: 'Bob', enabled: false });
    frame.commit();

    expect(store.snapshot()).toEqual({
      profile: { name: 'Bob', enabled: false },
    });
  });

  it('lets a later child write refine an earlier parent write in the same frame', () => {
    const store = createAtomicScalarStore({
      profile: { name: 'Alice', enabled: true },
    });
    const profile = store.writablePath<{ name: string; enabled: boolean }>(['profile']);
    const name = store.writablePath<string>(['profile', 'name']);
    const frame = store.beginFrame();

    frame.set(profile, { name: 'Bob', enabled: false });
    frame.set(name, 'Alicia');
    frame.commit();

    expect(store.snapshot()).toEqual({
      profile: { name: 'Alicia', enabled: false },
    });
  });

  it('frame update uses the latest staged value, not the committed value', () => {
    const store = createAtomicScalarStore({ count: 1 });
    const count = store.writable('count');
    const frame = store.beginFrame();

    frame.set(count, 2);
    frame.update(count, (current) => current + 1);

    expect(count()).toBe(1);

    frame.commit();

    expect(count()).toBe(3);
    expect(store.snapshot()).toEqual({ count: 3 });
  });

  it('can commit a realization-shaped batch over already-resolved leaf refs with one publication', () => {
    const store = createAtomicScalarStore({
      a: 'A',
      b: 'B',
    });
    const a = store.writable('a');
    const b = store.writable('b');
    const pair = computed(() => `${a()}|${b()}`);
    const writes: readonly ResolvedWrite<{ a: string; b: string }>[] = [
      { leaf: a, value: 'A2' },
      { leaf: b, value: 'B2' },
    ];

    commitResolvedWrites(store.beginFrame(), writes);

    expect(store.publicationCount()).toBe(1);
    expect(pair()).toBe('A2|B2');
    expect(store.writable('a')).toBe(a);
    expect(store.writable('b')).toBe(b);
  });

  it('refuses a stale realization-shaped batch and preserves the intervening live write', () => {
    const store = createAtomicScalarStore({
      a: 'A',
      b: 'B',
    });
    const a = store.writable('a');
    const b = store.writable('b');
    const writes: readonly ResolvedWrite<{ a: string; b: string }>[] = [
      { leaf: a, value: 'A2' },
      { leaf: b, value: 'B2' },
    ];
    const frame = store.beginFrame();

    for (const write of writes) {
      frame.set(write.leaf as never, write.value as never);
    }

    b.set('B-live');

    expect(() => frame.commit()).toThrow(StaleAtomicScalarFrameError);
    expect(store.snapshot()).toEqual({ a: 'A', b: 'B-live' });
    expect(store.publicationCount()).toBe(1);
  });
});

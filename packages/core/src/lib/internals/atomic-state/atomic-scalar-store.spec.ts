import { computed, isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { createAtomicScalarStore } from './atomic-scalar-store';

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
});

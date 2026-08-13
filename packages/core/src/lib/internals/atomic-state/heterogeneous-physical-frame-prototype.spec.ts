import { computed, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { createHeterogeneousPhysicalFramePrototype } from './heterogeneous-physical-frame-prototype';

describe('heterogeneous physical frame prototype', () => {
  it('commits scalar and rekey mutations through one coherent boundary', () => {
    TestBed.runInInjectionContext(() => {
      const prototype = createHeterogeneousPhysicalFramePrototype([
        { key: 'A', subjectId: 1, name: 'Alice' },
        { key: 'C', subjectId: 2, name: 'Carol' },
      ]);
      const name = prototype.name(1);
      const initialSlot = prototype.slotIndexForSubject(1);
      const view = computed(() => `${prototype.keyForSubject(1)}|${name()}`);
      const seen: string[] = [];

      effect(() => {
        seen.push(view());
      });
      TestBed.flushEffects();

      const frame = prototype.beginFrame();
      frame.rekey(1, 'A', 'B');
      frame.setName(1, 'Alicia');

      expect(prototype.hasKey('A')).toBe(true);
      expect(prototype.hasKey('B')).toBe(false);
      expect(prototype.keyForSubject(1)).toBe('A');
      expect(name()).toBe('Alice');
      expect(seen).toEqual(['A|Alice']);

      frame.commit();

      expect(prototype.hasKey('A')).toBe(false);
      expect(prototype.hasKey('B')).toBe(true);
      expect(prototype.keyForSubject(1)).toBe('B');
      expect(name()).toBe('Alicia');
      expect(prototype.slotIndexForSubject(1)).toBe(initialSlot);
      expect(seen).toEqual(['A|Alice']);

      TestBed.flushEffects();

      expect(seen).toEqual(['A|Alice', 'B|Alicia']);
    });
  });

  it('refuses an occupied rekey target before commit and preserves all state', () => {
    const prototype = createHeterogeneousPhysicalFramePrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
      { key: 'B', subjectId: 2, name: 'Bob' },
    ]);
    const frame = prototype.beginFrame();
    frame.setName(1, 'Alicia');

    expect(() => frame.rekey(1, 'A', 'B')).toThrow('Key B is already occupied by subject 2.');
    expect(prototype.keyForSubject(1)).toBe('A');
    expect(prototype.name(1)()).toBe('Alice');
    expect(prototype.revision()).toBe(0);
  });

  it('treats same-key rekey as a physical no-op and publishes nothing', () => {
    TestBed.runInInjectionContext(() => {
      const prototype = createHeterogeneousPhysicalFramePrototype([
        { key: 'A', subjectId: 1, name: 'Alice' },
      ]);
      const seen: string[] = [];

      effect(() => {
        seen.push(`${prototype.keyForSubject(1)}|${prototype.name(1)()}`);
      });
      TestBed.flushEffects();

      const frame = prototype.beginFrame();
      frame.rekey(1, 'A', 'A');
      frame.commit();
      TestBed.flushEffects();

      expect(prototype.revision()).toBe(0);
      expect(seen).toEqual(['A|Alice']);
    });
  });

  it('nets repeated same-subject rekeys in one frame and preserves subject order', () => {
    const prototype = createHeterogeneousPhysicalFramePrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
      { key: 'D', subjectId: 2, name: 'Dana' },
    ]);
    const frame = prototype.beginFrame();

    frame.rekey(1, 'A', 'B');
    frame.rekey(1, 'B', 'C');
    frame.commit();

    expect(prototype.subjectForKey('A')).toBeUndefined();
    expect(prototype.subjectForKey('B')).toBeUndefined();
    expect(prototype.subjectForKey('C')).toBe(1);
    expect(prototype.orderedKeys()).toEqual(['C', 'D']);
  });

  it('refuses a stale heterogeneous frame after an ordinary structural write', () => {
    const prototype = createHeterogeneousPhysicalFramePrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
      { key: 'D', subjectId: 2, name: 'Dana' },
    ]);
    const frame = prototype.beginFrame();

    frame.rekey(1, 'A', 'B');
    prototype.rekeyNow(1, 'A', 'C');

    expect(prototype.revision()).toBe(1);
    expect(() => frame.commit()).toThrow('HeterogeneousPhysicalFrame base revision is stale.');
    expect(prototype.keyForSubject(1)).toBe('C');
    expect(prototype.subjectForKey('B')).toBeUndefined();
  });
});

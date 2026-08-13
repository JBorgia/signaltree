import { computed, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { createRekeyTablePrototype } from './rekey-table-prototype';

describe('rekey table prototype', () => {
  it('keeps staged rekeys invisible until commit', () => {
    const table = createRekeyTablePrototype([
      ['A', 1],
      ['C', 2],
    ]);

    const frame = table.beginFrame();
    frame.rekey(1, 'A', 'B');

    expect(table.hasKey('A')).toBe(true);
    expect(table.hasKey('B')).toBe(false);
    expect(table.subjectForKey('A')).toBe(1);
    expect(table.keyForSubject(1)).toBe('A');
    expect(table.orderedKeys()).toEqual(['A', 'C']);
    expect(table.publicationCount()).toBe(0);

    frame.commit();

    expect(table.hasKey('A')).toBe(false);
    expect(table.hasKey('B')).toBe(true);
    expect(table.subjectForKey('B')).toBe(1);
    expect(table.keyForSubject(1)).toBe('B');
    expect(table.orderedKeys()).toEqual(['B', 'C']);
    expect(table.publicationCount()).toBe(1);
  });

  it('preserves SubjectId continuity while changing only the structural key', () => {
    const table = createRekeyTablePrototype([
      ['A', 7],
      ['Z', 9],
    ]);

    const beforeSubject = table.subjectForKey('A');
    const beforeKey = table.keyForSubject(7);

    const frame = table.beginFrame();
    frame.rekey(7, 'A', 'B');
    frame.commit();

    expect(beforeSubject).toBe(7);
    expect(beforeKey).toBe('A');
    expect(table.subjectForKey('A')).toBeUndefined();
    expect(table.subjectForKey('B')).toBe(7);
    expect(table.keyForSubject(7)).toBe('B');
    expect(table.subjectForKey('Z')).toBe(9);
    expect(table.keyForSubject(9)).toBe('Z');
  });

  it('publishes a coherent final mapping only after commit', () => {
    TestBed.runInInjectionContext(() => {
      const table = createRekeyTablePrototype([
        ['A', 1],
        ['C', 2],
      ]);
      const mapping = computed(
        () => `${table.keyForSubject(1) ?? 'missing'}|${table.hasKey('A')}|${table.hasKey('B')}`
      );
      const seen: string[] = [];

      effect(() => {
        seen.push(mapping());
      });
      TestBed.flushEffects();

      const frame = table.beginFrame();
      frame.rekey(1, 'A', 'B');

      expect(mapping()).toBe('A|true|false');
      expect(seen).toEqual(['A|true|false']);

      frame.commit();

      expect(mapping()).toBe('B|false|true');
      expect(seen).toEqual(['A|true|false']);

      TestBed.flushEffects();

      expect(seen).toEqual(['A|true|false', 'B|false|true']);
    });
  });
});

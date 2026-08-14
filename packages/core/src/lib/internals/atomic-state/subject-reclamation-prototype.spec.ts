import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { createSubjectReclamationPrototype } from './subject-reclamation-prototype';

describe('subject reclamation prototype', () => {
  it('plans conservative reclamation as retire backing state but retain the terminal shell', () => {
    const prototype = createSubjectReclamationPrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
    ]);
    const row = prototype.row(1);

    prototype.remove(1, 'A');

    expect(prototype.inventory(1)).toEqual({
      subjectId: 1,
      lifecycle: 'tombstoned',
      present: [
        'subject-record',
        'subject-id',
        'position-id',
        'slot-index',
        'activation-token',
        'value-token',
        'name-facade',
        'row-facade',
        'scalar-backing',
      ],
    });
    expect(prototype.planReclamation(1)).toEqual({
      subjectId: 1,
      eligible: true,
      retire: ['scalar-backing'],
      retain: [
        'subject-record',
        'subject-id',
        'position-id',
        'slot-index',
        'activation-token',
        'value-token',
        'name-facade',
        'row-facade',
      ],
    });

    expect(row()).toBeUndefined();
  });

  it('reclaims backing state while held facades remain deterministic terminal tombstones', () => {
    TestBed.runInInjectionContext(() => {
      const prototype = createSubjectReclamationPrototype([
        { key: 'A', subjectId: 1, name: 'Alice' },
      ]);
      const row = prototype.row(1);
      const name = row.name;
      const seen: string[] = [];
      const slot = prototype.slotIndexForSubject(1);
      const position = prototype.positionIdForSubject(1);

      effect(() => {
        const current = row();
        seen.push(current ? `${current.id}|${name()}` : 'absent');
      });
      TestBed.flushEffects();

      prototype.remove(1, 'A');
      TestBed.flushEffects();

      expect(prototype.lifecycle(1)).toBe('tombstoned');
      expect(prototype.facadeLifecycle(1)).toBe('tombstoned');
      expect(prototype.hasBackingState(1)).toBe(true);
      expect(row()).toBeUndefined();
      expect(name()).toBeUndefined();
      expect(seen).toEqual(['A|Alice', 'absent']);

      prototype.reclaim(1);
      TestBed.flushEffects();

      expect(prototype.lifecycle(1)).toBe('reclaimed');
      expect(prototype.facadeLifecycle(1)).toBe('retired');
      expect(prototype.hasBackingState(1)).toBe(false);
      expect(prototype.slotIndexForSubject(1)).toBe(slot);
      expect(prototype.positionIdForSubject(1)).toBe(position);
      expect(row()).toBeUndefined();
      expect(name()).toBeUndefined();
      expect(seen).toEqual(['A|Alice', 'absent']);
    });
  });

  it('keeps same-key reuse isolated after reclamation and does not reuse subject, position, or slot identities', () => {
    const prototype = createSubjectReclamationPrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
    ]);
    const row = prototype.row(1);
    const name = row.name;
    const originalSlot = prototype.slotIndexForSubject(1);
    const originalPosition = prototype.positionIdForSubject(1);

    prototype.remove(1, 'A');
    prototype.reclaim(1);

    const freshSubject = prototype.addFresh('A', 'Bob');

    expect(freshSubject).not.toBe(1);
    expect(prototype.slotIndexForSubject(freshSubject)).not.toBe(originalSlot);
    expect(prototype.positionIdForSubject(freshSubject)).not.toBe(originalPosition);
    expect(prototype.subjectForKey('A')).toBe(freshSubject);
    expect(prototype.row(freshSubject)()?.name).toBe('Bob');
    expect(row()).toBeUndefined();
    expect(name()).toBeUndefined();
  });

  it('refuses restoring a subject once its backing state has been reclaimed', () => {
    const prototype = createSubjectReclamationPrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
    ]);

    prototype.remove(1, 'A');
    prototype.reclaim(1);

    expect(() => prototype.restore(1, 'B')).toThrow(
      'Subject 1 has been reclaimed and cannot be restored.'
    );
    expect(prototype.keyForSubject(1)).toBeUndefined();
    expect(prototype.subjectForKey('B')).toBeUndefined();
  });

  it('does not plan reclamation for active or already reclaimed subjects', () => {
    const prototype = createSubjectReclamationPrototype([
      { key: 'A', subjectId: 1, name: 'Alice' },
    ]);

    expect(prototype.planReclamation(1)).toEqual({
      subjectId: 1,
      eligible: false,
      retire: [],
      retain: [
        'subject-record',
        'subject-id',
        'position-id',
        'slot-index',
        'activation-token',
        'value-token',
        'scalar-backing',
      ],
    });

    prototype.remove(1, 'A');
    prototype.reclaim(1);

    expect(prototype.planReclamation(1)).toEqual({
      subjectId: 1,
      eligible: false,
      retire: [],
      retain: [],
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  rollbackPrototypeTurn,
  type PrototypeTurn,
  type PrototypeWrite,
} from '../../scripts/rollback-viability-prototype';

type Row = { id: string; value: number };

describe('rollback viability prototype', () => {
  it('case 1: rolls back a scalar write when the turn still owns the visible value', () => {
    const current = { a: { x: 2 } };
    const t42: PrototypeTurn = {
      turnId: 'T42',
      writes: [{ kind: 'scalar', path: 'a.x', before: 1, after: 2 }],
    };

    const result = rollbackPrototypeTurn(current, t42);

    expect(result.status).toBe('applied');
    expect(result.state).toEqual({ a: { x: 1 } });
  });

  it('case 2: preserves a concurrent sibling write while rolling back the owned field', () => {
    const current = { a: { x: 2, y: 9 } };
    const t42: PrototypeTurn = {
      turnId: 'T42',
      writes: [{ kind: 'scalar', path: 'a.x', before: 1, after: 2 }],
    };

    const result = rollbackPrototypeTurn(current, t42, [
      { kind: 'scalar', path: 'a.y', before: 0, after: 9 },
    ]);

    expect(result.status).toBe('applied');
    expect(result.state).toEqual({ a: { x: 1, y: 9 } });
  });

  it('case 3: preserves a concurrent overwrite of the same scalar path', () => {
    const current = { a: { x: 5 } };
    const t42: PrototypeTurn = {
      turnId: 'T42',
      writes: [{ kind: 'scalar', path: 'a.x', before: 1, after: 2 }],
    };

    const result = rollbackPrototypeTurn(current, t42, [
      { kind: 'scalar', path: 'a.x', before: 2, after: 5 },
    ]);

    expect(result.status).toBe('preserved-concurrent');
    expect(result.state).toEqual({ a: { x: 5 } });
  });

  it('case 4: reinserts a removed row at its anchored position inside a concurrent reorder', () => {
    const current = {
      rows: [
        { id: 'd', value: 4 },
        { id: 'a', value: 1 },
        { id: 'c', value: 3 },
      ] satisfies Row[],
    };
    const t42: PrototypeTurn<Row> = {
      turnId: 'T42',
      writes: [
        {
          kind: 'collection-remove',
          path: 'rows',
          removed: { id: 'b', value: 2 },
          removedId: 'b',
          beforeIndex: 1,
          prevId: 'a',
          nextId: 'c',
        },
      ],
    };

    const result = rollbackPrototypeTurn(current, t42, [
      { kind: 'scalar', path: 'rowsOrder', before: 'abcd', after: 'dac' },
    ]);

    expect(result.status).toBe('applied');
    expect(result.state.rows.map((row: Row) => row.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('case 4b: reports cannot reconcile when the anchors no longer bracket a valid slot', () => {
    const current = {
      rows: [
        { id: 'c', value: 3 },
        { id: 'a', value: 1 },
        { id: 'd', value: 4 },
      ] satisfies Row[],
    };
    const t42: PrototypeTurn<Row> = {
      turnId: 'T42',
      writes: [
        {
          kind: 'collection-remove',
          path: 'rows',
          removed: { id: 'b', value: 2 },
          removedId: 'b',
          beforeIndex: 1,
          prevId: 'a',
          nextId: 'c',
        },
      ],
    };

    const result = rollbackPrototypeTurn(current, t42);

    expect(result.status).toBe('cannot-reconcile');
    expect(result.reason).toContain('collection-remove');
    expect(result.state.rows.map((row: Row) => row.id)).toEqual(['c', 'a', 'd']);
  });

  it('case 5: simultaneous pending turns stay isolated by explicit write ownership', () => {
    const current = { a: { x: 2 }, b: { y: 3 } };
    const t42: PrototypeTurn = {
      turnId: 'T42',
      writes: [{ kind: 'scalar', path: 'a.x', before: 1, after: 2 }],
    };
    const t43Writes: PrototypeWrite[] = [
      { kind: 'scalar', path: 'b.y', before: 0, after: 3 },
    ];

    const result = rollbackPrototypeTurn(current, t42, t43Writes);

    expect(result.status).toBe('applied');
    expect(result.state).toEqual({ a: { x: 1 }, b: { y: 3 } });
  });

  it('case 6: dependent writes under a rejected created entity are detected', () => {
    const current = {
      rows: [{ id: 'temp-1', value: 7 }] satisfies Row[],
      rowFields: { 'temp-1': { note: 'child-write' } },
    };
    const t42: PrototypeTurn<Row> = {
      turnId: 'T42',
      writes: [
        {
          kind: 'collection-add',
          path: 'rows',
          entityPath: 'rowFields.temp-1',
          entityId: 'temp-1',
        },
      ],
    };
    const t43Writes: PrototypeWrite[] = [
      {
        kind: 'scalar',
        path: 'rowFields.temp-1.note',
        before: '',
        after: 'child-write',
      },
    ];

    const result = rollbackPrototypeTurn(current, t42, t43Writes);

    expect(result.status).toBe('dependency-conflict');
    expect(result.reason).toContain('rowFields.temp-1');
    expect(result.state).toEqual(current);
  });
});

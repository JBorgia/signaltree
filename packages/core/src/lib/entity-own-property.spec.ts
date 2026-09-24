import { describe, expect, it } from 'vitest';
import { entityMap, signalTree } from '../index';

type Row = { id: number; [key: string]: unknown };

function fixture(key: string) {
  const tree = signalTree({ rows: entityMap<Row, number>() });
  const rows = tree.$.rows;
  rows.addOne({ id: 1, [key]: 'initial' });
  const node = rows.byId(1);
  if (!node) throw new Error('Fixture entity is missing');
  const field = node[key];
  expect(field()).toBe('initial');
  return { tree, rows, field };
}

describe('held entity fields read only current own properties', () => {
  for (const key of [
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'inherited',
    'prototype',
    'literal.dot',
  ]) {
    for (const operation of ['read', 'update'] as const) {
      it(`${operation} sees undefined after own ${key} is omitted`, () => {
        const { tree, rows, field } = fixture(key);
        const prototype = { inherited: 999 };
        const replacement: Row = Object.assign(Object.create(prototype), {
          id: 1,
        });
        try {
          rows.replaceOne(1, replacement);
          expect(Object.prototype.hasOwnProperty.call(replacement, key)).toBe(
            false
          );
          if (operation === 'read') {
            expect(field()).toBeUndefined();
          } else {
            const seen: unknown[] = [];
            field.update((current) => {
              seen.push(current);
              return 8;
            });
            expect(seen).toEqual([undefined]);
            expect(field()).toBe(8);
            expect(
              Object.prototype.hasOwnProperty.call(rows.byId(1)?.(), key)
            ).toBe(true);
          }
          expect(Object.getPrototypeOf(replacement)).toBe(prototype);
          expect(prototype).toEqual({ inherited: 999 });
          expect(
            Object.prototype.hasOwnProperty.call(Object.prototype, 'inherited')
          ).toBe(false);
        } finally {
          tree.destroy();
        }
      });
    }
  }

  for (const operation of ['read', 'update', 'set'] as const) {
    it(`${operation} never evaluates an inherited getter`, () => {
      const { tree, rows, field } = fixture('slot');
      let calls = 0;
      const prototype = Object.defineProperty({}, 'slot', {
        get() {
          calls++;
          throw new Error('inherited getter evaluated');
        },
      });
      const replacement: Row = Object.assign(Object.create(prototype), {
        id: 1,
      });
      try {
        rows.replaceOne(1, replacement);
        if (operation === 'read') expect(field()).toBeUndefined();
        if (operation === 'update')
          field.update((current) => {
            expect(current).toBeUndefined();
            return 8;
          });
        if (operation === 'set') field.set(8);
        expect(calls).toBe(0);
        if (operation !== 'read') expect(field()).toBe(8);
      } finally {
        tree.destroy();
      }
    });
  }

  it('preserves own getter receiver and updater input', () => {
    const { tree, rows, field } = fixture('slot');
    const receivers: unknown[] = [];
    const replacement: Row = {
      id: 1,
      base: 7,
      get slot() {
        receivers.push(this);
        return Number(this.base) * 2;
      },
    };
    try {
      rows.replaceOne(1, replacement);
      expect(field()).toBe(14);
      field.update((current) => {
        expect(current).toBe(14);
        return 15;
      });
      expect(field()).toBe(15);
      expect(receivers.length).toBeGreaterThan(0);
      expect(receivers.every((receiver) => receiver === replacement)).toBe(
        true
      );
    } finally {
      tree.destroy();
    }
  });

  for (const key of [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'hasOwnProperty',
    'literal.dot',
  ]) {
    it(`preserves explicit own builtin values and re-addition at ${key}`, () => {
      const { tree, rows, field } = fixture(key);
      try {
        rows.replaceOne(1, { id: 1, [key]: Object.prototype.toString });
        expect(field()).toBe(Object.prototype.toString);
        field.update((current) => {
          expect(current).toBe(Object.prototype.toString);
          return false;
        });
        expect(field()).toBe(false);
        rows.replaceOne(1, { id: 1 });
        field.set(0);
        expect(field()).toBe(0);
        expect(
          Object.prototype.hasOwnProperty.call(rows.byId(1)?.(), key)
        ).toBe(true);
      } finally {
        tree.destroy();
      }
    });
  }
});

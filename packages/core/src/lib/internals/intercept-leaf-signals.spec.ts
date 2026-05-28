import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';

import { interceptLeafSignals } from './intercept-leaf-signals';
import { withWriteContext } from '../write-context';
import type { UpdateMetadata } from '../types';

interface Captured {
  path: string;
  next: unknown;
  prev: unknown;
  meta?: UpdateMetadata;
}

function captureWrites(): {
  list: Captured[];
  onWrite: (
    path: string,
    next: unknown,
    prev: unknown,
    meta?: UpdateMetadata
  ) => void;
} {
  const list: Captured[] = [];
  return {
    list,
    onWrite: (path, next, prev, meta) => {
      list.push({ path, next, prev, meta });
    },
  };
}

describe('interceptLeafSignals — UpdateMetadata passthrough (PR1)', () => {
  it('passes `meta` from withWriteContext to onWrite on .set()', () => {
    const tree = { count: signal(0) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'hydrate', source: 'serialization' }, () => {
      tree.count.set(1);
    });

    expect(list).toHaveLength(1);
    expect(list[0].path).toBe('count');
    expect(list[0].next).toBe(1);
    expect(list[0].prev).toBe(0);
    expect(list[0].meta).toEqual({
      intent: 'hydrate',
      source: 'serialization',
    });

    restore();
  });

  it('passes `meta` from withWriteContext to onWrite on .update()', () => {
    const tree = { count: signal(10) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'user' }, () => {
      tree.count.update((c) => c + 1);
    });

    expect(list).toHaveLength(1);
    expect(list[0].meta).toEqual({ intent: 'user' });
    expect(list[0].next).toBe(11);
    expect(list[0].prev).toBe(10);

    restore();
  });

  it('passes meta=undefined when no withWriteContext frame is active', () => {
    const tree = { count: signal(0) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    tree.count.set(5); // no context

    expect(list).toHaveLength(1);
    expect(list[0].meta).toBeUndefined();

    restore();
  });

  it('captures meta synchronously — context from outer frame is observed even through nested set calls', () => {
    const tree = { a: signal(0), b: signal(0) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'bulk' }, () => {
      tree.a.set(1);
      tree.b.set(2);
    });

    expect(list).toHaveLength(2);
    expect(list[0].meta).toEqual({ intent: 'bulk' });
    expect(list[1].meta).toEqual({ intent: 'bulk' });

    restore();
  });

  it('captures the innermost meta when withWriteContext frames nest', () => {
    const tree = { a: signal(0), b: signal(0) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'hydrate' }, () => {
      tree.a.set(1); // captures `hydrate`
      withWriteContext({ intent: 'user' }, () => {
        tree.b.set(2); // captures `user`
      });
    });

    expect(list).toHaveLength(2);
    expect(list[0].meta).toEqual({ intent: 'hydrate' });
    expect(list[1].meta).toEqual({ intent: 'user' });

    restore();
  });

  it('does not invoke onWrite when value is unchanged (referential equality)', () => {
    const tree = { count: signal(7) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'user' }, () => {
      tree.count.set(7); // no change
    });

    expect(list).toHaveLength(0);
    restore();
  });

  it('preserves backward compatibility for 3-arg onWrite callbacks (meta dropped silently)', () => {
    const tree = { count: signal(0) };
    const calls: Array<[string, unknown, unknown]> = [];
    // Intentionally only 3 args — TypeScript permits because meta is optional.
    const onWrite = (path: string, next: unknown, prev: unknown): void => {
      calls.push([path, next, prev]);
    };
    const restore = interceptLeafSignals(tree, onWrite);

    withWriteContext({ intent: 'user' }, () => {
      tree.count.set(1);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['count', 1, 0]);
    restore();
  });

  it('cleanup function restores original .set / .update behavior', () => {
    const tree = { count: signal(0) };
    const { list, onWrite } = captureWrites();
    const restore = interceptLeafSignals(tree, onWrite);

    tree.count.set(1);
    expect(list).toHaveLength(1);

    restore();

    // After restore, writes are no longer intercepted.
    tree.count.set(2);
    expect(list).toHaveLength(1);
    expect(tree.count()).toBe(2);
  });
});

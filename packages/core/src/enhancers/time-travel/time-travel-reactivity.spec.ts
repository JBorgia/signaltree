import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from '../../lib/signal-tree';
import { timeTravel } from './time-travel';

/**
 * `canUndo()`, `canRedo()` and `getHistory()` are REACTIVE.
 *
 * They read a plain number and a plain array before this. Called imperatively
 * they were always correct, which is why it survived — and a
 * `computed(() => tree.canUndo())` evaluated exactly once and cached the answer
 * forever, because it took a dependency on nothing at all.
 *
 * Zone-based change detection hid it: the template re-read the method on every
 * cycle, so the button looked right. Zoneless has nothing to trigger that
 * re-read, so an undo button in a zoneless app never enabled — in a library
 * whose entire premise is signals, for its flagship enhancer.
 *
 * Every test here wraps the call in a `computed`, because calling the method
 * directly cannot fail and is what let this ship. The recompute COUNTS are
 * asserted too: a `computed` that returns the right value while never
 * re-evaluating is the exact bug, and value assertions alone would pass against
 * it if the initial value happened to match.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('canUndo tracks the history position', () => {
  it('flips false → true when the first entry is recorded', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const canUndo = computed(() => tree.canUndo());
    expect(canUndo()).toBe(false);

    tree.$.n.set(1);
    await flush();

    expect(canUndo()).toBe(true);
  });

  it('flips back to false when undone to the start', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const canUndo = computed(() => tree.canUndo());
    tree.$.n.set(1);
    await flush();

    tree.undo();
    await flush();

    expect(canUndo()).toBe(false);
  });

  it('actually RE-EVALUATES — the assertion the value alone cannot make', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    let evaluations = 0;
    const canUndo = computed(() => {
      evaluations++;
      return tree.canUndo();
    });
    canUndo();
    const initial = evaluations;

    tree.$.n.set(1);
    await flush();
    canUndo();

    expect(evaluations).toBeGreaterThan(initial);
  });
});

describe('canRedo tracks BOTH the position and the history length', () => {
  it('is false at the end of history and true after an undo', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const canRedo = computed(() => tree.canRedo());
    tree.$.n.set(1);
    await flush();
    expect(canRedo()).toBe(false);

    tree.undo();
    await flush();

    expect(canRedo()).toBe(true);
  });

  it('goes back to false once redone to the end', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const canRedo = computed(() => tree.canRedo());
    tree.$.n.set(1);
    await flush();
    tree.undo();
    await flush();

    tree.redo();
    await flush();

    expect(canRedo()).toBe(false);
  });

  it('a NEW write after an undo discards the redo branch', async () => {
    // The index does not move here — a new entry replaces the future — so this
    // is the case that needs the history-length dependency, not the index one.
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const canRedo = computed(() => tree.canRedo());
    tree.$.n.set(1);
    await flush();
    tree.undo();
    await flush();
    expect(canRedo()).toBe(true);

    tree.$.n.set(99);
    await flush();

    expect(canRedo()).toBe(false);
  });
});

describe('getHistory is reactive', () => {
  it('a computed over its length sees entries appear', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const length = computed(() => tree.getHistory().length);
    const before = length();

    tree.$.n.set(1);
    await flush();

    expect(length()).toBe(before + 1);
  });

  it('resetHistory is observed', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    const length = computed(() => tree.getHistory().length);
    tree.$.n.set(1);
    await flush();
    tree.$.n.set(2);
    await flush();
    expect(length()).toBeGreaterThan(1);

    tree.resetHistory();
    await flush();

    expect(length()).toBe(1);
  });
});

describe('the imperative API is unchanged', () => {
  it('direct calls still return the same answers', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 10 }));
    expect(tree.canUndo()).toBe(false);

    tree.$.n.set(1);
    await flush();
    expect(tree.canUndo()).toBe(true);
    expect(tree.canRedo()).toBe(false);

    tree.undo();
    await flush();
    expect(tree.$.n()).toBe(0);
    expect(tree.canRedo()).toBe(true);
  });

  it('maxHistorySize still evicts, and the position follows', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 3 }));
    for (let i = 1; i <= 6; i++) {
      tree.$.n.set(i);
      await flush();
    }
    expect(tree.getHistory().length).toBeLessThanOrEqual(3);
    expect(tree.getCurrentIndex()).toBe(tree.getHistory().length - 1);
  });
});

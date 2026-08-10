import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from '../../lib/signal-tree';
import { timeTravel } from './time-travel';

/**
 * `pauseRecording` / `resumeRecording`, and the `shouldSkip` comparator.
 *
 * Both come from the capability audit: elf and Akita ship pause and a
 * comparator; we shipped neither. Without pause, a bulk import writes a hundred
 * entries and the user's next undo reverts one row of it — `maxHistorySize`
 * bounds the memory that costs but does nothing about whether undo means
 * anything to a person.
 *
 * The comparator is the wider version of the reference-dedup already in place.
 * Dedup collapses snapshots that are IDENTICAL; a comparator lets the app say a
 * transition is uninteresting — a cursor position, a hover flag — so undo lands
 * on steps a person recognises.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pause / resume', () => {
  it('records nothing while paused', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    tree.$.n.set(1);
    await flush();
    const before = tree.getHistory().length;

    tree.pauseRecording();
    for (let i = 0; i < 20; i++) {
      tree.$.n.set(100 + i);
      await flush();
    }

    expect(tree.getHistory().length).toBe(before);
  });

  it('the WRITES still apply — pausing is not disabling', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    tree.pauseRecording();

    tree.$.n.set(42);
    await flush();

    expect(tree.$.n()).toBe(42);
  });

  it('resuming records again, without backfilling what was missed', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    tree.$.n.set(1);
    await flush();
    const before = tree.getHistory().length;

    tree.pauseRecording();
    for (let i = 0; i < 5; i++) {
      tree.$.n.set(50 + i);
      await flush();
    }
    tree.resumeRecording();
    tree.$.n.set(999);
    await flush();

    expect(tree.getHistory().length).toBe(before + 1);
  });

  it('undo after a paused span goes to the last RECORDED state', async () => {
    // This is the point of the feature: the bulk span is one step, not twenty.
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    tree.$.n.set(1);
    await flush();

    tree.pauseRecording();
    for (let i = 0; i < 10; i++) {
      tree.$.n.set(100 + i);
      await flush();
    }
    tree.resumeRecording();

    tree.undo();
    await flush();

    expect(tree.$.n()).toBe(0);
  });

  it('isRecordingPaused is REACTIVE, so an indicator can bind to it', () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({}));
    let evaluations = 0;
    const paused = computed(() => {
      evaluations++;
      return tree.isRecordingPaused();
    });
    expect(paused()).toBe(false);
    const before = evaluations;

    tree.pauseRecording();

    expect(paused()).toBe(true);
    expect(evaluations).toBeGreaterThan(before);
  });

  it('pausing twice, and resuming twice, are both harmless', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    tree.pauseRecording();
    tree.pauseRecording();
    tree.resumeRecording();
    tree.resumeRecording();

    tree.$.n.set(5);
    await flush();

    expect(tree.isRecordingPaused()).toBe(false);
    expect(tree.$.n()).toBe(5);
  });
});

describe('shouldSkip comparator', () => {
  /**
   * These two specs used to assert the OPPOSITE: that a skipped transition was
   * never recorded (`getHistory().length` unchanged). That was the write-side
   * contract, and it was the wrong one — see `skipsBackward()` for the five
   * reasons. They now assert the read-side contract, and they assert the OUTCOME
   * a user sees rather than the mechanism, because the mechanism is what was
   * wrong before.
   */
  it('retains skipped transitions instead of discarding them', async () => {
    const tree = signalTree({ n: 0, cursor: 0 }).with(
      timeTravel({
        maxHistorySize: 50,
        shouldSkip: (prev, next) =>
          (prev as { n: number }).n === (next as { n: number }).n,
      })
    );
    const before = tree.getHistory().length;

    for (let i = 1; i <= 5; i++) {
      tree.$.cursor.set(i);
      await flush();
    }

    // Retained, not dropped: history is complete, filtering happens on read.
    expect(tree.getHistory().length).toBe(before + 5);
  });

  it('undo lands on the last state the user would recognise', async () => {
    const tree = signalTree({ n: 0, cursor: 0 }).with(
      timeTravel({
        maxHistorySize: 50,
        shouldSkip: (prev, next) =>
          (prev as { n: number }).n === (next as { n: number }).n,
      })
    );

    tree.$.n.set(1);
    await flush();
    for (let i = 1; i <= 5; i++) {
      tree.$.cursor.set(i);
      await flush();
    }
    tree.$.n.set(2);
    await flush();

    // One undo crosses all five cursor entries, because none of them is a state
    // the user distinguishes from its predecessor.
    // The tree-level undo()/redo() return void, so assert the state — which is
    // the outcome a user sees, and the only thing worth pinning.
    tree.undo();
    expect(tree.$.n()).toBe(1);

    tree.undo();
    expect(tree.$.n()).toBe(0);

    // ...and redo mirrors it.
    tree.redo();
    expect(tree.$.n()).toBe(1);
    tree.redo();
    expect(tree.$.n()).toBe(2);
  });

  it('records the transitions it does not skip', async () => {
    const tree = signalTree({ n: 0, cursor: 0 }).with(
      timeTravel({
        maxHistorySize: 50,
        shouldSkip: (prev, next) =>
          (prev as { n: number }).n === (next as { n: number }).n,
      })
    );
    const before = tree.getHistory().length;

    tree.$.cursor.set(9);
    await flush();
    tree.$.n.set(7);
    await flush();

    expect(tree.getHistory().length).toBe(before + 2);
  });

  it('never skips past index 0, so undo always moves', async () => {
    const tree = signalTree({ n: 0, cursor: 0 }).with(
      timeTravel({ maxHistorySize: 50, shouldSkip: () => true })
    );

    tree.$.cursor.set(1);
    await flush();
    tree.$.cursor.set(2);
    await flush();

    // Every transition is skippable, so without the index-0 floor undo would
    // have nowhere legal to land.
    tree.undo();
    expect(tree.getCurrentIndex()).toBe(0);
  });

  it('skipped writes still apply', async () => {
    const tree = signalTree({ n: 0, cursor: 0 }).with(
      timeTravel({ maxHistorySize: 50, shouldSkip: () => true })
    );

    tree.$.cursor.set(3);
    await flush();

    expect(tree.$.cursor()).toBe(3);
  });

  it('no comparator behaves exactly as before', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel({ maxHistorySize: 50 }));
    const before = tree.getHistory().length;

    tree.$.n.set(1);
    await flush();

    expect(tree.getHistory().length).toBe(before + 1);
  });
});

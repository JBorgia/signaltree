import { describe, expect, it, vi } from 'vitest';

import { createAuditTracker } from '../../lib/audit/audit';
import { history } from '../../lib/form-history/form-history';
import { form } from '../../lib/markers/form';
import { signalTree } from '../../lib/signal-tree';
import { serialization } from '../serialization/serialization';
import { timeTravel } from './time-travel';

/**
 * Characterization tests for the history defects documented as TODO 6a-6d.
 *
 * ## Why these exist
 *
 * These defects are DOCUMENTED on live surfaces but deliberately NOT fixed — 6a's
 * code fix is gated on the representation decision. Without tests, nothing catches a
 * silent change in behaviour, and the documentation quietly stops being true. That is
 * exactly how a defect report survived on four surfaces while being false: the claim
 * "collection mutations create no history entry" came from asserting a counter in the
 * same tick as a `queueMicrotask` flush, and `undo()` was never called once.
 *
 * ## How to read a failure
 *
 * A failure here does NOT necessarily mean a regression. It may mean someone FIXED
 * the defect — which is good news, and means the docs citing it are now wrong. Each
 * test names the surfaces to update.
 *
 * These are not the same thing as `tools/verify-history-defects.mjs`, which is a
 * provenance generator for published figures and has deliberately inverted exit
 * codes. These are ordinary tests: they assert the behaviour the docs describe.
 *
 * ## The rule every assertion here follows
 *
 * Call `undo()` and inspect the resulting state. Reading `getHistory().length` or
 * `canUndo()` without a following `undo()` is not evidence.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('6a — timeTravel() does not cover form() state', () => {
  // If this fails, the defect may be fixed. Update:
  //   docs/guides/time-travel-in-production.md §2b
  //   packages/core/README.md (the history() section warning)
  //   TODO.md 6a
  it('form writes produce NO history entries', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({ initial: { name: '' } }),
    }).with(timeTravel({}));
    await flush();
    const baseline = tree.getHistory().length;

    for (const v of ['a', 'ab', 'abc']) {
      tree.$.profile.$.name.set(v);
      await flush();
    }

    expect(tree.getHistory().length).toBe(baseline);
    expect(tree.canUndo()).toBe(false);
    // Outcome, not counter: the value is still what was typed.
    expect(tree.$.profile.$.name()).toBe('abc');
  });

  // The asymmetry is the actual defect: excluded from RECORDING, included in
  // RESTORATION. Incoherent under either semantic — either forms participate and
  // must record, or they do not and must be excluded from restore.
  it('...yet a neighbouring undo REWINDS the form (asymmetric participation)', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({ initial: { name: '' } }),
      counter: 0,
    }).with(timeTravel({}));
    await flush();

    tree.$.profile.$.name.set('typed');
    await flush();
    tree.$.counter.set(1); // the only write that records
    await flush();

    expect(tree.$.profile.$.name()).toBe('typed');

    tree.undo(); // aimed at `counter`

    expect(tree.$.counter()).toBe(0);
    // The form is rewound even though it never recorded a step.
    expect(tree.$.profile.$.name()).not.toBe('typed');
  });

  // The mechanism that DOES work, so the documented recommendation is verified
  // rather than asserted. This one is a plain regression test.
  it('form({ history: history() }) scoped undo works', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({
        initial: { name: '' },
        history: history(),
      }),
    });

    for (const v of ['a', 'ab', 'abc']) {
      tree.$.profile.$.name.set(v);
      await flush();
    }

    tree.$.profile.history?.undo();
    await flush();

    expect(tree.$.profile.$.name()).toBe('ab');
  });
});

describe('6b — createAuditTracker samples on a timer', () => {
  // The interval is the literal constant at lib/audit/audit.ts:156
  // (`setInterval(handleChange, 100)`) — cited rather than measured here.
  // If this fails, the tracker may have become event-driven. Update:
  //   docs/guides/time-travel-in-production.md (the composition table row)
  //   TODO.md 6b
  it('two writes inside one sampling window collapse to one entry', async () => {
    const tree = signalTree({ n: 0 });
    const log: unknown[] = [];
    const stop = createAuditTracker(tree, log as never);
    await new Promise((r) => setTimeout(r, 120));
    const base = log.length;

    tree.$.n.set(1);
    tree.$.n.set(2); // same window
    await new Promise((r) => setTimeout(r, 250));
    stop();

    expect(log.length - base).toBe(1);
    // Outcome: the intermediate state is unrecoverable from the trail.
    expect(tree.$.n()).toBe(2);
  });

  it('write-then-revert inside one window is INVISIBLE to the trail', async () => {
    const tree = signalTree({ name: 'a' });
    const log: unknown[] = [];
    const stop = createAuditTracker(tree, log as never);
    await new Promise((r) => setTimeout(r, 120));
    const base = log.length;

    tree.$.name.set('TEMP');
    tree.$.name.set('a'); // reverted in the same window
    await new Promise((r) => setTimeout(r, 250));
    stop();

    expect(log.length - base).toBe(0);
    expect(tree.$.name()).toBe('a');
  });
});

describe('6c — undo() after deserialize() reverts the restore', () => {
  // Recoverable via redo(), which is why this ranks below 6a. If it changes, update:
  //   docs/guides/time-travel-in-production.md
  //   TODO.md 6c
  it('the first undo discards the restored state, and redo brings it back', async () => {
    const make = () =>
      signalTree({ n: 0 }).with(serialization()).with(timeTravel({}));

    const source = make();
    source.$.n.set(7);
    await flush();
    const payload = source.serialize();

    const target = make();
    await flush();
    target.deserialize(payload);
    await flush();

    expect(target.$.n()).toBe(7);
    expect(target.canUndo()).toBe(true);

    target.undo();
    expect(target.$.n()).not.toBe(7); // the restore was discarded

    expect(target.canRedo()).toBe(true);
    target.redo();
    expect(target.$.n()).toBe(7); // ...but it is recoverable
  });
});

describe('6d — maxHistorySize validation (FIXED in 14.1.0)', () => {
  // Ordinary regression tests: this defect IS fixed.
  const usableSteps = async (cfg?: number) => {
    const tree = signalTree({ n: 0 }).with(
      timeTravel(cfg === undefined ? {} : { maxHistorySize: cfg })
    );
    await flush();
    for (let i = 1; i <= 10; i++) {
      tree.$.n.set(i);
      await flush();
    }
    let spent = 0;
    while (tree.canUndo() && spent < 40) {
      tree.undo();
      spent++;
    }
    return spent;
  };

  it('N entries yields N-1 undo steps', async () => {
    expect(await usableSteps(2)).toBe(1);
    expect(await usableSteps(5)).toBe(4);
  });

  it.each([0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'maxHistorySize %p no longer silently disables undo',
    async (bad) => {
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const steps = await usableSteps(bad as number);
      spy.mockRestore();

      // Falls back to the default of 50, so all 10 writes stay undoable.
      expect(steps).toBe(10);
    }
  );

  it('reports ST2032 rather than failing silently', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await usableSteps(1);
    const said = spy.mock.calls.flat().join(' ');
    spy.mockRestore();

    expect(said).toContain('ST2032');
  });
});

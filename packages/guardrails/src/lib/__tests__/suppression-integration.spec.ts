import { entityMap, signalTree } from '@signaltree/core';
import { withWriteContext } from '@signaltree/core/authoring';
import { describe, expect, it } from 'vitest';

import { guardrails } from '../guardrails';

/**
 * `suppression` through a real tree, not just the decision function.
 *
 * This is the test that proves the feature works, and writing it is what
 * exposed the reason the first implementation did NOT. Guardrails reads the
 * ambient write context inside its notifier callback, and batched
 * notifications flush on a microtask — so by the time the callback ran,
 * `withWriteContext` had already restored the previous value and every write
 * looked unannotated. The suppression config matched nothing, silently. Core's
 * PathNotifier now captures the metadata at `notify()` time and re-establishes
 * it around the flush (`write-context-across-batch.spec.ts` pins that half).
 *
 * Note the `await`: any assertion about notifier-driven behaviour must let the
 * microtask flush first. A synchronous assertion here passes for the wrong
 * reason — nothing has happened yet.
 */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

interface Row {
  id: string;
  v: number;
}

function harness(config: Record<string, unknown> = {}) {
  const tree = signalTree({
    rows: entityMap<Row, string>({ selectId: (r) => r.id }),
  });
  const enhanced = guardrails({ enabled: true, ...config })(
    tree as never
  ) as unknown as {
    __guardrails: { getReport(): { stats: { updateCount: number } } };
  };
  return {
    tree,
    updates: () => enhanced.__guardrails.getReport().stats.updateCount,
  };
}

describe('suppression, end to end', () => {
  it('analyses an ordinary write', async () => {
    const h = harness();
    h.tree.$.rows.addOne({ id: 'a', v: 1 });
    await tick();
    expect(h.updates()).toBeGreaterThan(0);
  });

  it('skips a write marked suppressGuardrails', async () => {
    const h = harness();
    withWriteContext({ suppressGuardrails: true }, () => {
      h.tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    expect(h.updates()).toBe(0);
  });

  it('respectMetadata: false reports on it anyway', async () => {
    const h = harness({ suppression: { respectMetadata: false } });
    withWriteContext({ suppressGuardrails: true }, () => {
      h.tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    expect(h.updates()).toBeGreaterThan(0);
  });

  it('autoSuppress silences a declared source — the undo case', async () => {
    const h = harness({ suppression: { autoSuppress: ['time-travel'] } });
    withWriteContext({ intent: 'system', source: 'time-travel' }, () => {
      h.tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    expect(h.updates()).toBe(0);
  });

  it('leaves an unlisted intent alone', async () => {
    const h = harness({ suppression: { autoSuppress: ['hydrate'] } });
    withWriteContext({ intent: 'user' }, () => {
      h.tree.$.rows.addOne({ id: 'a', v: 1 });
    });
    await tick();
    expect(h.updates()).toBeGreaterThan(0);
  });
});

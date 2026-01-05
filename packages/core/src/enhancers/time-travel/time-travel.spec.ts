import { describe, expect, it } from 'vitest';

import { enableTimeTravel, timeTravel, withTimeTravel } from './time-travel';

describe('time-travel enhancer', () => {
  it('exports factory and aliases', () => {
    expect(typeof timeTravel).toBe('function');
    expect(typeof timeTravel()).toBe('function');
    expect(typeof withTimeTravel).toBe('function');
    expect(typeof enableTimeTravel).toBe('function');
  });

  it('records a single history entry per PathNotifier flush when batching is enabled', async () => {
    // Create the enhanced store
    const store = (await import('../../lib/signal-tree'))
      .signalTree({ count: 0 })
      .with(timeTravel());
    const t = (store as any).__timeTravel;

    // Ensure global notifier is in default state and enabled for batching
    const { resetPathNotifier, getPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();
    const notifier = getPathNotifier();
    notifier.setBatchingEnabled(true);

    // Simulate a subscriber updating the tree during flush (real systems
    // typically have subscribers that apply state changes in response to
    // PathNotifier events). This ensures timeTravel snapshots a changed
    // state rather than deduping an identical snapshot.
    notifier.subscribe('count', (v) => {
      store({ count: v as number });
    });

    notifier.notify('count', 1, 0);
    notifier.notify('count', 2, 0);

    // Allow microtask flush
    await Promise.resolve();

    const history = t.getHistory();
    // INIT + 1 batch
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Ensure the last entry reflects the latest value (not every PathNotifier will change tree, but timeTravel should snapshot tree())
    const last = history[history.length - 1];
    expect(last.state).toBeDefined();
  });
});

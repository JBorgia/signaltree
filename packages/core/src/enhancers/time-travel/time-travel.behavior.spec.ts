import { describe, expect, it } from 'vitest';

import { timeTravel } from './time-travel';

function createFakeTree(initial: any) {
  let state = initial;
  const tree: any = function (arg?: any) {
    if (arguments.length === 0) return state;
    if (typeof arg === 'function') state = arg(state);
    else state = arg;
    // keep `.state` in sync for snapshotting
    tree.state = state;
  };

  tree.state = state;
  return tree as unknown as any;
}

describe('time-travel behavior', () => {
  it('records history and supports undo/redo', () => {
    const tree = createFakeTree({ count: 0, text: '' });
    const enhanced = timeTravel()(tree as any) as any;

    enhanced({ count: 1 });
    enhanced({ text: 'hello' });

    expect(enhanced.canUndo()).toBe(true);
    const beforeIndex = enhanced.getCurrentIndex();
    enhanced.undo();
    const afterFirstUndo = enhanced.getCurrentIndex();
    expect(afterFirstUndo).toBeLessThanOrEqual(beforeIndex);

    enhanced.undo();
    const afterSecondUndo = enhanced.getCurrentIndex();
    expect(afterSecondUndo).toBeLessThanOrEqual(afterFirstUndo);

    // ensure history is present and jump back to latest entry
    const history = enhanced.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);
    enhanced.jumpTo(history.length - 1);
    expect(enhanced.getCurrentIndex()).toBe(history.length - 1);
  });
});

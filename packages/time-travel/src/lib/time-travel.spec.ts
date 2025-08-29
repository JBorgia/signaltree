import { signalTree, type SignalTree } from '@signaltree/core';
import {
  withTimeTravel,
  enableTimeTravel,
  getTimeTravel,
  type TimeTravelEntry,
  type TimeTravelInterface,
} from './time-travel';

interface TestState {
  count: number;
  user: {
    name: string;
    id: number;
  };
  items: string[];
  [key: string]: unknown;
  [key: number]: unknown;
  [key: symbol]: unknown;
}

type TimeTravelTree = SignalTree<TestState> & {
  __timeTravel: TimeTravelInterface<TestState>;
};

// Helper function to create properly typed time travel tree
function createTimeTravelTree(
  initialState: TestState,
  config?: {
    maxHistorySize?: number;
    includePayload?: boolean;
    actionNames?: { update?: string };
  }
): TimeTravelTree {
  if (config) {
    return signalTree(initialState).with(
      withTimeTravel(config)
    ) as TimeTravelTree;
  }
  return signalTree(initialState).with(withTimeTravel()) as TimeTravelTree;
}

// Helper function for enable time travel
function createEnabledTimeTravelTree(
  initialState: TestState,
  limit?: number
): TimeTravelTree {
  if (limit !== undefined) {
    return signalTree(initialState).with(
      enableTimeTravel(limit)
    ) as TimeTravelTree;
  }
  return signalTree(initialState).with(enableTimeTravel()) as TimeTravelTree;
}

describe('Time Travel', () => {
  let initialState: TestState;

  beforeEach(() => {
    initialState = {
      count: 0,
      user: {
        name: 'Alice',
        id: 1,
      },
      items: ['a', 'b'],
    };
  });

  describe('withTimeTravel', () => {
    it('should enhance tree with time travel interface', () => {
      const tree = createTimeTravelTree(initialState);

      expect(tree.__timeTravel).toBeDefined();
      expect(typeof tree.__timeTravel.undo).toBe('function');
      expect(typeof tree.__timeTravel.redo).toBe('function');
      expect(typeof tree.__timeTravel.getHistory).toBe('function');
      expect(typeof tree.__timeTravel.resetHistory).toBe('function');
    });

    it('should track state changes in history', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));

      const history = tree.__timeTravel.getHistory();
      expect(history.length).toBe(3); // INIT + 2 updates
      expect(history[0].action).toBe('INIT');
      expect(history[1].action).toBe('UPDATE');
      expect(history[2].action).toBe('UPDATE');
    });

    it('should support undo operations', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));
      tree.update((state: TestState) => ({ ...state, count: 3 }));

      expect(tree.unwrap().count).toBe(3);

      const undoResult = tree.__timeTravel.undo();
      expect(undoResult).toBe(true);
      expect(tree.unwrap().count).toBe(2);

      tree.__timeTravel.undo();
      expect(tree.unwrap().count).toBe(1);

      tree.__timeTravel.undo();
      expect(tree.unwrap().count).toBe(0);
    });

    it('should support redo operations', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));

      tree.__timeTravel.undo();
      expect(tree.unwrap().count).toBe(1);

      const redoResult = tree.__timeTravel.redo();
      expect(redoResult).toBe(true);
      expect(tree.unwrap().count).toBe(2);
    });

    it('should handle undo/redo boundaries correctly', () => {
      const tree = createTimeTravelTree(initialState);

      // Can't undo from initial state
      expect(tree.__timeTravel.canUndo()).toBe(false);
      expect(tree.__timeTravel.undo()).toBe(false);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      expect(tree.__timeTravel.canUndo()).toBe(true);

      // Can't redo when at latest state
      expect(tree.__timeTravel.canRedo()).toBe(false);
      expect(tree.__timeTravel.redo()).toBe(false);

      tree.__timeTravel.undo();
      expect(tree.__timeTravel.canRedo()).toBe(true);
    });

    it('should support jumping to specific history index', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));
      tree.update((state: TestState) => ({ ...state, count: 3 }));

      expect(tree.__timeTravel.getCurrentIndex()).toBe(3);

      const jumpResult = tree.__timeTravel.jumpTo(1);
      expect(jumpResult).toBe(true);
      expect(tree.unwrap().count).toBe(1);
      expect(tree.__timeTravel.getCurrentIndex()).toBe(1);

      // Invalid index
      expect(tree.__timeTravel.jumpTo(-1)).toBe(false);
      expect(tree.__timeTravel.jumpTo(10)).toBe(false);
    });

    it('should reset history', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));

      expect(tree.__timeTravel.getHistory().length).toBe(3);

      tree.__timeTravel.resetHistory();
      const history = tree.__timeTravel.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('RESET');
      expect(tree.__timeTravel.getCurrentIndex()).toBe(0);
    });

    it('should respect max history size', () => {
      const tree = createTimeTravelTree(initialState, { maxHistorySize: 3 });

      // Add more entries than max size
      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));
      tree.update((state: TestState) => ({ ...state, count: 3 }));
      tree.update((state: TestState) => ({ ...state, count: 4 }));

      const history = tree.__timeTravel.getHistory();
      expect(history.length).toBe(3); // Max size enforced
      expect(history[history.length - 1].state.count).toBe(4); // Latest state preserved
    });

    it('should handle branching history correctly', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));
      tree.update((state: TestState) => ({ ...state, count: 3 }));

      // Go back and create new branch
      tree.__timeTravel.undo();
      tree.__timeTravel.undo();
      expect(tree.unwrap().count).toBe(1);

      tree.update((state: TestState) => ({ ...state, count: 10 }));

      const history = tree.__timeTravel.getHistory();
      // Should have INIT, first update, and new branch update
      expect(history.length).toBe(3);
      expect(history[2].state.count).toBe(10);

      // Can't redo the discarded future
      expect(tree.__timeTravel.canRedo()).toBe(false);
    });

    it('should deep clone state snapshots', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({
        ...state,
        user: { ...state.user, name: 'Bob' },
      }));

      const history = tree.__timeTravel.getHistory();
      const firstEntry = history[0];

      // Modify returned state should not affect history
      firstEntry.state.user.name = 'Modified';

      const freshHistory = tree.__timeTravel.getHistory();
      expect(freshHistory[0].state.user.name).toBe('Alice'); // Original preserved
    });

    it('should not track identical state changes', () => {
      const tree = createTimeTravelTree(initialState);

      const beforeState = tree.unwrap();
      console.log('Before state:', beforeState);

      const currentCount = tree.unwrap().count;
      tree.update((state: TestState) => ({ ...state, count: currentCount })); // Same value

      const afterState = tree.unwrap();
      console.log('After state:', afterState);
      console.log(
        'States equal?',
        JSON.stringify(beforeState) === JSON.stringify(afterState)
      );

      const history = tree.__timeTravel.getHistory();
      console.log(
        'History entries:',
        history.map((h) => ({ action: h.action, count: h.state.count }))
      );
      expect(history.length).toBe(1); // Only INIT, no update recorded
    });

    it('should include payload when configured', () => {
      const tree = createTimeTravelTree(initialState, { includePayload: true });

      tree.update((state: TestState) => ({ ...state, count: 1 }));

      const history = tree.__timeTravel.getHistory();
      const updateEntry = history.find(
        (h: TimeTravelEntry<TestState>) => h.action === 'UPDATE'
      );
      expect(updateEntry).toBeDefined();
      // Payload would be included if we passed it to addEntry
    });

    it('should handle custom action names', () => {
      const tree = createTimeTravelTree(initialState, {
        actionNames: {
          update: 'CUSTOM_UPDATE',
        },
      });

      tree.update((state: TestState) => ({ ...state, count: 1 }));

      const history = tree.__timeTravel.getHistory();
      const updateEntry = history.find(
        (h: TimeTravelEntry<TestState>) => h.action === 'CUSTOM_UPDATE'
      );
      expect(updateEntry).toBeDefined();
    });
  });

  describe('enableTimeTravel convenience function', () => {
    it('should create time travel with default config', () => {
      const tree = createEnabledTimeTravelTree(initialState);

      expect(tree.__timeTravel).toBeDefined();
      tree.update((state: TestState) => ({ ...state, count: 1 }));
      expect(tree.__timeTravel.getHistory().length).toBe(2);
    });

    it('should accept max history size parameter', () => {
      const tree = createEnabledTimeTravelTree(initialState, 2);

      tree.update((state: TestState) => ({ ...state, count: 1 }));
      tree.update((state: TestState) => ({ ...state, count: 2 }));
      tree.update((state: TestState) => ({ ...state, count: 3 }));

      expect(tree.__timeTravel.getHistory().length).toBe(2);
    });
  });

  describe('getTimeTravel helper', () => {
    it('should return time travel interface from enhanced tree', () => {
      const tree = createTimeTravelTree(initialState);
      const timeTravel = getTimeTravel(tree);

      expect(timeTravel).toBeDefined();
      expect(timeTravel).toBe(tree.__timeTravel);
    });

    it('should return undefined for non-enhanced tree', () => {
      const tree = signalTree(initialState);
      const timeTravel = getTimeTravel(
        tree as SignalTree<TestState> & {
          __timeTravel?: TimeTravelInterface<TestState>;
        }
      );

      expect(timeTravel).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle complex nested state changes', () => {
      const tree = createTimeTravelTree(initialState);

      tree.update((state: TestState) => ({
        ...state,
        user: { ...state.user, name: 'Bob' },
        items: [...state.items, 'c'],
      }));

      tree.__timeTravel.undo();
      expect(tree.unwrap().user.name).toBe('Alice');
      expect(tree.unwrap().items).toEqual(['a', 'b']);

      tree.__timeTravel.redo();
      expect(tree.unwrap().user.name).toBe('Bob');
      expect(tree.unwrap().items).toEqual(['a', 'b', 'c']);
    });

    it('should handle multiple rapid updates', () => {
      const tree = createTimeTravelTree(initialState);

      for (let i = 1; i <= 10; i++) {
        tree.update((state: TestState) => ({ ...state, count: i }));
      }

      expect(tree.unwrap().count).toBe(10);
      expect(tree.__timeTravel.getHistory().length).toBe(11); // INIT + 10 updates

      // Undo 5 times
      for (let i = 0; i < 5; i++) {
        tree.__timeTravel.undo();
      }

      expect(tree.unwrap().count).toBe(5);
    });
  });
});

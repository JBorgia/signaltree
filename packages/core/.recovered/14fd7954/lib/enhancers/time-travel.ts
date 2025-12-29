import { deepCloneJSON, snapshotState } from '../utils';

import type {
  SignalTreeBase as SignalTree,
  TimeTravelMethods,
  Enhancer,
  TimeTravelEntry,
} from '../types';
export interface TimeTravelConfig {
  maxHistory?: number;
  debounceMs?: number;
}

export function withTimeTravel(
  config: TimeTravelConfig = {}
): <S>(tree: SignalTree<S>) => SignalTree<S> & TimeTravelMethods {
  const { maxHistory = 50, debounceMs = 0 } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & TimeTravelMethods => {
    const history: TimeTravelEntry<S>[] = [];
    let currentIndex = -1;
    let isTraveling = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const capture = (): S =>
      deepCloneJSON(snapshotState((tree as any).state) as S);
    const applySnapshot = (snap: S) => {
      isTraveling = true;
      try {
        // Apply snapshot by invoking the tree as a setter
        (tree as any)(() => snap as any);
      } finally {
        setTimeout(() => (isTraveling = false), 0);
      }
    };

    const record = (action = '@@INIT') => {
      if (isTraveling) return;
      const doRecord = () => {
        if (currentIndex < history.length - 1) history.splice(currentIndex + 1);
        history.push({ action, timestamp: Date.now(), state: capture() });
        while (history.length > maxHistory) history.shift();
        currentIndex = history.length - 1;
      };
      if (debounceMs > 0) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doRecord, debounceMs);
      } else doRecord();
    };

    record();

    const methods: TimeTravelMethods = {
      undo() {
        if (currentIndex <= 0) return;
        if (currentIndex === history.length - 1) {
          history[currentIndex].state = capture();
        }
        currentIndex--;
        applySnapshot(history[currentIndex].state);
      },
      redo() {
        if (currentIndex >= history.length - 1) return;
        currentIndex++;
        applySnapshot(history[currentIndex].state);
      },
      canUndo() {
        return currentIndex > 0;
      },
      canRedo() {
        return currentIndex < history.length - 1;
      },
      getHistory() {
        return history.map((h) => ({
          ...h,
          state: deepCloneJSON(h.state),
        })) as unknown[];
      },
      resetHistory() {
        history.length = 0;
        currentIndex = -1;
        record('@@RESET');
      },
      jumpTo(index: number) {
        if (index < 0 || index >= history.length) return;
        currentIndex = index;
        applySnapshot(history[currentIndex].state);
      },
      getCurrentIndex() {
        return currentIndex;
      },
    };

    const originalDestroy = (tree as any).destroy?.bind(tree);
    (tree as any).destroy = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      history.length = 0;
      originalDestroy?.();
    };

    // TODO: wire into path-notifier to auto-record changes

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = {
    name: 'withTimeTravel',
    provides: [
      'undo',
      'redo',
      'canUndo',
      'canRedo',
      'getHistory',
      'resetHistory',
      'jumpTo',
      'getCurrentIndex',
    ],
  };
  return enhancer;
}

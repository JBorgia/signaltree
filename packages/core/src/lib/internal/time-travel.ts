// (No longer need fine-grained patch application utilities after snapshot approach)
import type {
  SignalTree,
  TimeTravelEntry,
  TreeConfig,
  DeepPartial,
} from '../types';

export interface TimeTravelFeature<T> {
  enable(tree: SignalTree<T>, config: TreeConfig): void;
}

export function createTimeTravelFeature<T>(): TimeTravelFeature<T> {
  return {
    enable(tree, config) {
      if (!config.enableTimeTravel) {
        tree.undo = () => {
          if (config.debugMode) {
            console.warn('⚠️ undo() called but time travel is not enabled.');
          }
        };
        tree.redo = () => {
          if (config.debugMode) {
            console.warn('⚠️ redo() called but time travel is not enabled.');
          }
        };
        tree.getHistory = (): TimeTravelEntry<T>[] => [];
        tree.resetHistory = () => {
          if (config.debugMode) {
            console.warn(
              '⚠️ resetHistory() called but time travel is not enabled.'
            );
          }
        };
        return;
      }

      const limit =
        config.historyLimit && config.historyLimit > 5
          ? config.historyLimit
          : config.historyLimit || 100;

      const deepClone = (s: T): T => {
        try {
          return typeof structuredClone === 'function'
            ? (structuredClone(s) as T)
            : (JSON.parse(JSON.stringify(s)) as T);
        } catch {
          return JSON.parse(JSON.stringify(s));
        }
      };

      type Patch = { path: string; oldValue: unknown; newValue: unknown };
      interface PatchEntry {
        patches: Patch[]; // retained for potential diff tooling / future compression
        timestamp: number;
        action: string;
        payload?: unknown;
        // We now always capture a full materialized snapshot at this point in history
        materialized: T;
      }

      // Base snapshot represents state at history index 0 ("init")
      let baseSnapshot: T = deepClone(tree.unwrap());
      const patchHistory: PatchEntry[] = [];
      let __historyIndex = 0;
      let __suppressRecord = false;

      const originalUpdate = tree.update;
      tree.update = (
        updater: (current: T) => T | DeepPartial<T>,
        options?: { label?: string; payload?: unknown }
      ) => {
        if (__suppressRecord) {
          // Bypass history capture when applying snapshots
          originalUpdate(updater, options as unknown as undefined);
          return;
        }
        const beforeIndex = __historyIndex;
        if (__historyIndex < patchHistory.length) {
          patchHistory.splice(__historyIndex);
        }
        originalUpdate(updater, options as unknown as undefined);
        const patches = (tree as unknown as { __lastPatches?: Patch[] })
          .__lastPatches;
        const snap = deepClone(tree.unwrap());
        if (patches && patches.length > 0) {
          patchHistory.push({
            patches: patches.map((p) => ({ ...p })),
            timestamp: Date.now(),
            action: options?.label || 'update',
            payload: options?.payload,
            materialized: snap,
          });
          __historyIndex = patchHistory.length;
          while (1 + patchHistory.length > limit) {
            const first = patchHistory.shift();
            if (first) {
              // When trimming, promote the removed entry's snapshot to new base
              baseSnapshot = deepClone(first.materialized);
            }
            __historyIndex = Math.max(0, __historyIndex - 1);
          }
        } else if (config.debugMode && beforeIndex !== __historyIndex) {
          console.warn('[SignalTree] update produced no patches');
        }
      };
      // Materialize now is O(1) – we store full snapshots per entry.
      function materialize(index: number): T {
        if (index === 0) return deepClone(baseSnapshot);
        const entry = patchHistory[index - 1];
        return deepClone(entry.materialized);
      }

      const applySnapshot = (targetIndex: number, label: string) => {
        const snap = materialize(targetIndex);
        __suppressRecord = true;
        try {
          originalUpdate(() => snap as unknown as T, {
            label: `__time_travel_${label}`,
          } as unknown as undefined);
        } finally {
          __suppressRecord = false;
        }
        if (config.debugMode) {
          console.log(`[SignalTree] Applied snapshot via ${label}`);
        }
      };

      tree.undo = () => {
        if (__historyIndex > 0) {
          __historyIndex -= 1;
          applySnapshot(__historyIndex, 'undo');
        }
      };
      tree.redo = () => {
        if (__historyIndex < patchHistory.length) {
          __historyIndex += 1;
          applySnapshot(__historyIndex, 'redo');
        }
      };
      tree.getHistory = (): TimeTravelEntry<T>[] => {
        const entries: TimeTravelEntry<T>[] = [];
        const total = 1 + patchHistory.length;
        for (let i = 0; i < total; i++) {
          const isCurrent = i === __historyIndex;
          const state = materialize(i);
          const meta =
            i === 0 ? { action: 'init', timestamp: 0 } : patchHistory[i - 1];
          entries.push({
            action: i === 0 ? 'init' : meta.action,
            timestamp: i === 0 ? meta.timestamp : meta.timestamp,
            state,
            payload: isCurrent ? 'current' : undefined,
          });
        }
        return entries;
      };
      tree.resetHistory = () => {
        baseSnapshot = deepClone(tree.unwrap());
        patchHistory.splice(0);
        __historyIndex = 0;
      };
    },
  };
}

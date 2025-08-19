import { isSignal, Signal, WritableSignal } from '../adapter';
import { equal } from '../utils';
import type { SignalTree, TimeTravelEntry, TreeConfig } from '../types';

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
        patches: Patch[];
        timestamp: number;
        action: string;
        payload?: unknown;
        materialized?: T;
      }

      let baseSnapshot: T = deepClone(tree.unwrap());
      const patchHistory: PatchEntry[] = [];
      let __historyIndex = 0;

      const originalUpdate = tree.update;
      tree.update = (
        updater: (current: T) => Partial<T>,
        options?: { label?: string; payload?: unknown }
      ) => {
        const beforeIndex = __historyIndex;
        if (__historyIndex < patchHistory.length) {
          patchHistory.splice(__historyIndex);
        }
        originalUpdate(updater, options as unknown as undefined);
        const patches = (tree as unknown as { __lastPatches?: Patch[] })
          .__lastPatches;
        if (patches && patches.length > 0) {
          patchHistory.push({
            patches: patches.map((p) => ({ ...p })),
            timestamp: Date.now(),
            action: options?.label || 'update',
            payload: options?.payload,
          });
          __historyIndex = patchHistory.length;
          while (1 + patchHistory.length > limit) {
            const first = patchHistory.shift();
            if (first) {
              baseSnapshot = applyPatchesClone(baseSnapshot, first.patches);
            }
            __historyIndex = Math.max(0, __historyIndex - 1);
          }
        } else if (config.debugMode && beforeIndex !== __historyIndex) {
          console.warn('[SignalTree] update produced no patches');
        }
      };

      function applyPatchesClone(state: T, patches: Patch[]): T {
        const root: unknown = Array.isArray(state)
          ? [...(state as unknown[])]
          : { ...(state as Record<string, unknown>) };
        for (const { path, newValue } of patches) {
          const parts = path.split('.');
          let cursor: Record<string, unknown> | unknown[] = root as
            | Record<string, unknown>
            | unknown[];
          for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const next = (cursor as any)[k];
            if (!next || typeof next !== 'object') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (cursor as any)[k] = {};
            } else if (Array.isArray(next)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (cursor as any)[k] = [...next];
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (cursor as any)[k] = { ...next };
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cursor = (cursor as any)[k];
          }
          const last = parts[parts.length - 1];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cursor as any)[last] = newValue;
        }
        return root as T;
      }

      function materialize(index: number): T {
        if (index === 0) return deepClone(baseSnapshot);
        const entry = patchHistory[index - 1];
        if (entry.materialized) return deepClone(entry.materialized);
        const prev = materialize(index - 1);
        const next = applyPatchesClone(prev, entry.patches);
        entry.materialized = next;
        return deepClone(next);
      }

      const applySnapshot = (targetIndex: number, label: string) => {
        const snap = materialize(targetIndex);
        const applyObject = (target: unknown, source: unknown) => {
          if (
            !target ||
            typeof target !== 'object' ||
            !source ||
            typeof source !== 'object'
          )
            return;
          for (const key of Object.keys(source as Record<string, unknown>)) {
            const tgtVal = (target as Record<string, unknown>)[key];
            const srcVal = (source as Record<string, unknown>)[key];
            if (isSignal(tgtVal)) {
              const currentVal = (tgtVal as Signal<unknown>)();
              if (!equal(currentVal, srcVal)) {
                (tgtVal as WritableSignal<unknown>).set(srcVal);
              }
            } else if (
              tgtVal &&
              typeof tgtVal === 'object' &&
              srcVal &&
              typeof srcVal === 'object' &&
              !Array.isArray(srcVal)
            ) {
              applyObject(tgtVal, srcVal);
            }
          }
        };
        applyObject(tree.state, snap);
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

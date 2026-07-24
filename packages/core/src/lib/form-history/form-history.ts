/**
 * `history()` — signal-native undo/redo for `form()` markers.
 *
 * The engine attaches to the form marker's values signal (the single source of
 * truth that `signalForm()` also uses as its Angular Signal Forms `FieldTree`
 * model). Undo/redo therefore drive the marker API AND any bound field tree
 * from one implementation — no RxJS, no `valueChanges`, no second substrate.
 *
 * Tree-shaking: this module is imported ONLY by the `history()` helper. The
 * `form()` marker imports the {@link HistoryFeature} *type* alone, so a bundle
 * that never calls `history()` drops the snapshot/undo machinery entirely
 * (the `security()`/`loader()` injected-feature precedent — RFC 0007).
 *
 * @packageDocumentation
 */

import { computed, signal } from '@angular/core';
import { deepClone, snapshotsEqual } from '@signaltree/shared';

import type {
  FormHistoryApi,
  FormHistoryOptions,
  FormHistorySnapshot,
  HistoryFeature,
} from '../types';

/**
 * Create an undo/redo feature for a `form()` marker.
 *
 * @example
 * ```ts
 * import { signalTree, form, history } from '@signaltree/core';
 *
 * const tree = signalTree({
 *   profile: form<{ name: string; password: string }>({
 *     initial: { name: '', password: '' },
 *     history: history({ capacity: 20, exclude: ['password'] }),
 *   }),
 * });
 *
 * tree.$.profile.patch({ name: 'Ada' });
 * tree.$.profile.history!.undo();          // name reverts; password untouched
 * tree.$.profile.history!.canRedo();       // true
 * ```
 *
 * @param options - {@link FormHistoryOptions} (capacity, excluded fields).
 * @public
 */
export function history<T extends Record<string, unknown>>(
  options: FormHistoryOptions<T> = {}
): HistoryFeature<T> {
  const capacity = Math.max(1, options.capacity ?? 10);
  const exclude = options.exclude ?? [];

  // Snapshot projection: deep-clone, then strip excluded fields so secrets
  // never enter the buffer. Comparison and storage both use the projection,
  // so an edit that only touches an excluded field records nothing.
  const project = (value: T): T => {
    const cloned = deepClone(value);
    for (const key of exclude) {
      delete (cloned as Record<keyof T, unknown>)[key];
    }
    return cloned;
  };

  return {
    __signalTreeFormHistory: true,
    attach(ctx) {
      const snap = signal<FormHistorySnapshot<T>>({
        past: [],
        present: project(ctx.read()),
        future: [],
      });

      const record = (): void => {
        const next = project(ctx.read());
        const current = snap();
        if (snapshotsEqual(current.present, next)) return;
        const past = [...current.past, current.present];
        if (past.length > capacity) past.shift();
        snap.set({ past, present: next, future: [] });
      };

      // Restore merges the projected snapshot over the live values so excluded
      // fields (absent from the snapshot) keep whatever they currently hold —
      // an undo never resurrects an old secret. `write` does NOT re-`record`.
      const restore = (target: T): void => {
        ctx.write(target as Partial<T>);
      };

      const api: FormHistoryApi<T> = {
        undo(): void {
          const s = snap();
          if (s.past.length === 0) return;
          const prev = s.past[s.past.length - 1];
          snap.set({
            past: s.past.slice(0, -1),
            present: prev,
            future: [s.present, ...s.future],
          });
          restore(prev);
        },
        redo(): void {
          const s = snap();
          if (s.future.length === 0) return;
          const next = s.future[0];
          snap.set({
            past: [...s.past, s.present],
            present: next,
            future: s.future.slice(1),
          });
          restore(next);
        },
        clearHistory(): void {
          const s = snap();
          snap.set({ past: [], present: s.present, future: [] });
        },
        canUndo: computed(() => snap().past.length > 0),
        canRedo: computed(() => snap().future.length > 0),
        history: snap.asReadonly(),
      };

      return { api, record };
    },
  };
}

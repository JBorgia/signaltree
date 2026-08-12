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

import {
  computed,
  effect,
  inject,
  Injector,
  signal,
  type WritableSignal,
} from '@angular/core';
import { deepClone, snapshotsEqual } from '@signaltree/shared';
import { createScopedHistoryAuthority } from '../../enhancers/time-travel/time-travel';

import type {
  FormHistoryApi,
  FormHistoryOptions,
  FormHistorySharedAuthority,
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
      let sharedAuthority: FormHistorySharedAuthority | undefined;
      const sharedMode = signal(false);
      const standaloneAuthority = createScopedHistoryAuthority<T>({
        read: () => project(ctx.read()),
        write: ctx.write,
        maxHistoryEntries: capacity + 1,
        ownerPath: '__formHistory',
      });

      const snap = signal<FormHistorySnapshot<T>>({
        past: [],
        present: project(ctx.read()),
        future: [],
      });

      const record = (): void => {
        const next = project(ctx.read());
        const current = snap();
        if (snapshotsEqual(current.present, next)) return;
        if (sharedMode()) {
          return;
        }
        standaloneAuthority.record(next);
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

      const historyView = computed<FormHistorySnapshot<T>>(() =>
        sharedMode()
          ? { past: [], present: project(ctx.read()), future: [] }
          : snap()
      );

      const api: FormHistoryApi<T> = {
        undo(): void {
          if (sharedAuthority) {
            if (!sharedAuthority.undo()) return;
            return;
          }
          if (!standaloneAuthority.undo()) {
            return;
          }
          const prev = project(ctx.read());
          const s = snap();
          snap.set({
            past: s.past.slice(0, -1),
            present: prev,
            future: [s.present, ...s.future],
          });
        },
        redo(): void {
          if (sharedAuthority) {
            if (!sharedAuthority.redo()) return;
            return;
          }
          const s = snap();
          if (!standaloneAuthority.redo() || s.future.length === 0) return;
          const next = project(ctx.read());
          snap.set({
            past: [...s.past, s.present],
            present: next,
            future: s.future.slice(1),
          });
        },
        clearHistory(): void {
          if (sharedMode()) {
            return;
          }
          const next = project(ctx.read());
          standaloneAuthority.reset(next);
          snap.set({ past: [], present: next, future: [] });
        },
        canUndo: computed(() =>
          sharedMode()
            ? sharedAuthority?.canUndo() === true
            : standaloneAuthority.canUndo()
        ),
        canRedo: computed(() =>
          sharedMode()
            ? sharedAuthority?.canRedo() === true
            : standaloneAuthority.canRedo()
        ),
        history: historyView,
      };

      Object.defineProperty(api, '__bindSharedAuthority', {
        value: (authority: FormHistorySharedAuthority) => {
          sharedAuthority = authority;
          sharedMode.set(true);
        },
        enumerable: false,
        configurable: true,
      });

      return { api, record };
    },
  };
}

/**
 * Attach undo/redo history to ANY `WritableSignal` model — no `form()` marker
 * required. This is the marker-free counterpart to `history()`: point it at the
 * model signal an Angular Signal Forms `form(model, schema)` was built over (or
 * any writable signal) and get `undo()`/`redo()`/`canUndo`/`canRedo`/`history`.
 *
 * It runs the same engine as `history()`, plus an `effect()` that observes the
 * model and records every change — from any source (Signal Forms `FieldTree`
 * edits, `model.set(...)`, etc.). Undo/redo write the model back; the engine's
 * snapshot-equality guard dedupes so those writes don't create phantom entries.
 *
 * Requires an injection context (for the `effect`) or an explicit `injector`.
 *
 * @example
 * ```ts
 * // Angular Signal Forms, no SignalTree marker:
 * const model = signal({ name: '', email: '' });
 * const f = form(model, mySchema);
 * const hist = trackHistory(model, { capacity: 50, exclude: ['password'] });
 * hist.undo();  // reverts the last edit; the FieldTree reflects it
 * ```
 *
 * @public
 */
export function trackHistory<T extends Record<string, unknown>>(
  model: WritableSignal<T>,
  options: FormHistoryOptions<T> & { injector?: Injector } = {}
): FormHistoryApi<T> {
  const injector = options.injector ?? inject(Injector);
  const binding = history<T>(options).attach({
    read: () => model(),
    write: (next) => model.update((m) => ({ ...m, ...next })),
  });
  effect(
    () => {
      model();
      binding.record();
    },
    { injector }
  );
  return binding.api;
}

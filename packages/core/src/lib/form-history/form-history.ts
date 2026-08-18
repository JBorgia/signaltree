/**
 * `history()` — signal-native undo/redo for `form()` markers.
 *
 * The engine attaches to the form marker's values signal (the single source of
 * truth that `signalForm()` also uses as its Angular Signal Forms `FieldTree`
 * model). Undo/redo therefore drive the marker API AND any bound field tree
 * from one implementation — no RxJS, no `valueChanges`, no second substrate.
 *
 * Tree-shaking: this module is imported ONLY by the `history()` helper. The
 * `trackHistory()` takes the model signal directly, so a bundle
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
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { deepClone, snapshotsEqual } from '@signaltree/shared';
import { createScopedHistoryAuthority } from '../../enhancers/time-travel/time-travel';

import type {
  FormHistoryApi,
  FormHistoryOptions,
  FormHistorySharedAuthority,
} from '../types';

interface TrackHistorySnapshot<T> {
  past: T[];
  present: T;
  future: T[];
}

interface TrackHistoryApi<T> extends FormHistoryApi<T> {
  clearHistory(): void;
  history: Signal<TrackHistorySnapshot<T>>;
}

function attachHistory<T extends Record<string, unknown>>(
  ctx: { read: () => T; write: (next: Partial<T>) => void },
  options: FormHistoryOptions<T>,
  exposeSnapshotHistory: boolean
): {
  api: FormHistoryApi<T> | TrackHistoryApi<T>;
  record: () => void;
} {
  const capacity = Math.max(1, options.capacity ?? 10);
  const exclude = options.exclude ?? [];

  const project = (value: T): T => {
    const cloned = deepClone(value);
    for (const key of exclude) {
      delete (cloned as Record<keyof T, unknown>)[key];
    }
    return cloned;
  };

  let sharedAuthority: FormHistorySharedAuthority | undefined;
  const sharedMode = signal(false);
  const standaloneAuthority = createScopedHistoryAuthority<T>({
    read: () => project(ctx.read()),
    write: ctx.write,
    maxHistoryEntries: capacity + 1,
    ownerPath: '__formHistory',
  });

  const snapshotHistory = exposeSnapshotHistory
    ? signal<TrackHistorySnapshot<T>>({
        past: [],
        present: project(ctx.read()),
        future: [],
      })
    : undefined;

  const record = (): void => {
    const next = project(ctx.read());
    const current = snapshotHistory?.();
    if (current && snapshotsEqual(current.present, next)) return;
    if (sharedMode()) {
      return;
    }
    standaloneAuthority.record(next);
    if (!snapshotHistory || !current) {
      return;
    }
    const past = [...current.past, current.present];
    if (past.length > capacity) past.shift();
    snapshotHistory.set({ past, present: next, future: [] });
  };

  const clearHistory = (): void => {
    if (sharedMode()) {
      return;
    }
    const next = project(ctx.read());
    standaloneAuthority.reset(next);
    snapshotHistory?.set({ past: [], present: next, future: [] });
  };

  const api: FormHistoryApi<T> = {
    undo(): void {
      if (sharedAuthority) {
        sharedAuthority.undo();
        return;
      }
      if (!standaloneAuthority.undo()) {
        return;
      }
      if (!snapshotHistory) {
        return;
      }
      const prev = project(ctx.read());
      const current = snapshotHistory();
      snapshotHistory.set({
        past: current.past.slice(0, -1),
        present: prev,
        future: [current.present, ...current.future],
      });
    },
    redo(): void {
      if (sharedAuthority) {
        sharedAuthority.redo();
        return;
      }
      const current = snapshotHistory?.();
      if (!standaloneAuthority.redo()) {
        return;
      }
      if (!snapshotHistory || !current || current.future.length === 0) {
        return;
      }
      const next = project(ctx.read());
      snapshotHistory.set({
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      });
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
  };

  Object.defineProperty(api, '__bindSharedAuthority', {
    value: (authority: FormHistorySharedAuthority) => {
      sharedAuthority = authority;
      sharedMode.set(true);
    },
    enumerable: false,
    configurable: true,
  });

  if (!snapshotHistory) {
    return { api, record };
  }

  return {
    api: {
      ...api,
      clearHistory,
      history: computed(() => snapshotHistory()),
    },
    record,
  };
}

/**
 * Attach undo/redo history to ANY `WritableSignal` model — no `form()` marker
 * required. This is the marker-free counterpart to `history()`: point it at the
 * model signal an Angular Signal Forms `form(model, schema)` was built over (or
 * any writable signal) and get `undo()`/`redo()`/`canUndo`/`canRedo` plus
 * local snapshot inspection/reset helpers.
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
) {
  const injector = options.injector ?? inject(Injector);
  const binding = attachHistory<T>(
    {
    read: () => model(),
    write: (next) => model.update((m) => ({ ...m, ...next })),
    },
    options,
    true
  ) as {
    api: TrackHistoryApi<T>;
    record: () => void;
  };
  effect(
    () => {
      model();
      binding.record();
    },
    { injector }
  );
  return binding.api;
}

/**
 * One place to observe every error the library catches.
 *
 * ## Why this exists
 *
 * A capability audit against NGXS found `NgxsUnhandledErrorHandler` and nothing
 * equivalent anywhere else, ours included. The gap is real and narrow: a
 * `stored()` write that fails, an `asyncSource` loader that rejects, an
 * `asyncQuery` that throws — each is caught at its own site and turned into
 * local error state, which is correct, and each is therefore invisible to
 * anything that wants to see ALL of them. Reporting to Sentry meant wiring a
 * per-marker `onError` at every call site and remembering to do it forever.
 *
 * This does NOT change how errors are handled. Every existing catch still runs,
 * still sets its local error state, still calls its own `onError`. This is an
 * additional observation point, and a listener that throws cannot break the
 * operation that reported to it.
 *
 * Deliberately NOT a handler: it cannot swallow, retry or transform. Making it
 * capable of that would mean every marker's error path depends on whatever a
 * listener decides, which is a much larger promise than "tell me when something
 * failed".
 */

/** Where the error came from. Closed union — adding a source is a core change. */
export type TreeErrorSource =
  | 'stored'
  | 'async-source'
  | 'async-query'
  | 'entity-loader'
  | 'persistence'
  | 'effect';

export interface TreeErrorEvent {
  /** The thrown value, unwrapped as far as it was thrown. */
  error: unknown;
  source: TreeErrorSource;
  /** What was being attempted, e.g. `read`, `write`, `load`, `flush`. */
  operation: string;
  /** Dotted state path when the reporting site knows it. */
  path?: string;
  /** Human prose. DEV ONLY — folds away under `ngDevMode: false`. */
  detail?: string;
}

const listeners = new Set<(event: TreeErrorEvent) => void>();

/**
 * Observe every error the library catches. Returns an unsubscribe function.
 *
 * ```ts
 * import { onTreeError } from '@signaltree/core/authoring';
 *
 * onTreeError((e) => Sentry.captureException(e.error, { extra: e }));
 * ```
 *
 * Fires for errors that were ALREADY handled locally — the marker has set its
 * error state and the app may show it. This is for reporting, not recovery.
 */
export function onTreeError(
  listener: (event: TreeErrorEvent) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Report a caught error. Never throws.
 *
 * A listener that throws must not take down the operation that reported to it —
 * that would make adding error REPORTING a source of errors, and the failure
 * would surface at whichever marker happened to report first, which is the
 * least debuggable outcome available.
 */
export function reportTreeError(event: TreeErrorEvent): void {
  if (listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.error(
          'SignalTree: an onTreeError listener threw. The original error was ' +
            'still handled normally; this is the listener failing. [ST2025]',
          err
        );
      }
    }
  }
}

/** Test seam — listeners are module-global, so a spec must be able to reset. */
export function clearTreeErrorListenersForTesting(): void {
  listeners.clear();
}

import { effect, Injector, runInInjectionContext, signal, Signal } from '@angular/core';

import type { EmissionEntry } from './example.types';

export interface TrackEmissionsOptions {
  /** Max rows kept in the log (newest first). Default 8. */
  max?: number;
  /**
   * Record each source's initial value on setup. Default `false` — the log
   * starts empty and fills only when a value actually changes.
   */
  includeInitial?: boolean;
  /** Custom injector when not called from an injection context. */
  injector?: Injector;
}

/** Compact, log-friendly rendering of an emitted value. */
function format(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? json.slice(0, 77) + '…' : json;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Watches a map of signal reads and records each emission into a log signal,
 * ready to bind to `<st-emission-log [entries]="log()">`. This is the
 * SignalTree-native "emissions" surface: state changes are the events.
 *
 * Call from an injection context (constructor / field initializer) or pass
 * `options.injector`.
 *
 * @example
 * readonly emissions = trackEmissions({
 *   count: () => this.store.$.count(),
 *   selected: () => this.store.$.users.selected()?.name,
 * });
 */
export function trackEmissions(
  sources: Record<string, () => unknown>,
  options: TrackEmissionsOptions = {}
): Signal<EmissionEntry[]> {
  const { max = 8, includeInitial = false, injector } = options;
  const log = signal<EmissionEntry[]>([]);
  let seq = 0;

  const register = () => {
    for (const [label, read] of Object.entries(sources)) {
      let first = true;
      effect(() => {
        const value = read(); // establishes the reactive dependency
        if (first) {
          first = false;
          if (!includeInitial) return;
        }
        const entry: EmissionEntry = { label, value: format(value), seq: seq++ };
        log.update((rows) => [entry, ...rows].slice(0, max));
      });
    }
  };

  if (injector) {
    runInInjectionContext(injector, register);
  } else {
    register();
  }

  return log;
}

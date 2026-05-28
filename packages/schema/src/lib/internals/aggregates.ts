import { computed, Signal } from '@angular/core';

import type { Registry } from './state';

/**
 * Build the tree-wide aggregate signals from the registry.
 *
 * `isValid` is O(1) per read — backed by the invalid-count counter maintained
 * inside `applyLeafVerdict`. `errors` and `errorList` are O(paths) but only
 * evaluate when read (Angular `computed` semantics).
 *
 * @internal
 */
export function createAggregates(registry: Registry): {
  errors: Signal<Readonly<Record<string, string | null>>>;
  errorList: Signal<readonly string[]>;
  isValid: Signal<boolean>;
  pending: Signal<boolean>;
} {
  const isValid = computed(() => registry.invalidCount() === 0);

  const errors = computed<Readonly<Record<string, string | null>>>(() => {
    const out: Record<string, string | null> = {};
    for (const [path, state] of registry.pathStates) {
      out[path] = state.errorSignal();
    }
    return out;
  });

  const errorList = computed<readonly string[]>(() => {
    const map = errors();
    const list: string[] = [];
    for (const v of Object.values(map)) {
      if (v !== null) list.push(v);
    }
    return list;
  });

  const pending = computed(() => registry.pendingPathsSignal().length > 0);

  return { errors, errorList, isValid, pending };
}

import { computed, Signal } from '@angular/core';

import type { Registry } from './state';
import { ensurePathState } from './state';

/**
 * Return the memoized error `Signal` for a leaf path. Same instance is
 * returned across calls for the same path. The computed reads through
 * `ensurePathState`, so an evict-then-reuse cycle picks up the fresh
 * `PathState` automatically.
 *
 * @internal
 */
export function errorsAt(
  registry: Registry,
  path: string
): Signal<string | null> {
  const cached = registry.errorsAtCache.get(path);
  if (cached) return cached;
  const sig = computed(() => ensurePathState(registry, path).errorSignal());
  registry.errorsAtCache.set(path, sig);
  return sig;
}

/**
 * Return the memoized `isValidAt` signal for a leaf path. Reads the path's
 * error signal and returns `true` when it's `null`.
 *
 * @internal
 */
export function isValidAt(
  registry: Registry,
  path: string
): Signal<boolean> {
  const cached = registry.isValidAtCache.get(path);
  if (cached) return cached;
  const sig = computed(() => ensurePathState(registry, path).errorSignal() === null);
  registry.isValidAtCache.set(path, sig);
  return sig;
}

/**
 * Return the memoized `isPendingAt` signal for a leaf path.
 *
 * @internal
 */
export function isPendingAt(
  registry: Registry,
  path: string
): Signal<boolean> {
  const cached = registry.isPendingAtCache.get(path);
  if (cached) return cached;
  const sig = computed(() => ensurePathState(registry, path).pendingSignal());
  registry.isPendingAtCache.set(path, sig);
  return sig;
}

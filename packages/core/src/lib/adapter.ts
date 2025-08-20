/**
 * SignalTree Adapter Layer (Phase 1)
 *
 * Provides a minimal indirection over the underlying reactive implementation
 * (currently Angular Signals). This enables future extraction of the core to
 * a framework-agnostic package by swapping this module's implementation.
 *
 * Design Goals (Phase 1):
 *  - Zero public API changes
 *  - Near-zero performance & size impact (<2% gzip target)
 *  - Centralize all direct '@angular/core' signal imports
 *  - Keep naming identical (signal, computed, effect, isSignal, inject, DestroyRef)
 *  - Provide a single place to introduce alternative engines (TC39, custom, etc.)
 */
import {
  signal as ngSignal,
  computed as ngComputed,
  effect as ngEffect,
  isSignal as ngIsSignal,
  inject as ngInject,
  DestroyRef as NgDestroyRef,
  WritableSignal as NgWritableSignal,
  Signal as NgSignal,
} from '@angular/core';
// Neutral structural signal interfaces (engine-agnostic)
export { BaseSignalReadable, BaseSignalWritable } from './neutral-signals';

/** Adapter interface enabling pluggable reactive engines */
export interface SignalEngine {
  signal: typeof ngSignal;
  computed: typeof ngComputed;
  effect: typeof ngEffect;
  isSignal: typeof ngIsSignal;
  inject: typeof ngInject;
  /** Optional capability flags so features can branch without runtime checks */
  capabilities?: {
    di?: boolean; // dependency injection available
    cleanup?: boolean; // effect cleanup semantics
    batching?: boolean; // supports batch(fn)
  };
  /** Optional batch implementation (no-op if absent) */
  batch?<T>(fn: () => T): T;
}

// Active engine (mutable via configureSignalEngine)
export const defaultEngine: SignalEngine = {
  signal: ngSignal,
  computed: ngComputed,
  effect: ngEffect,
  isSignal: ngIsSignal,
  inject: ngInject,
};
// Mutable active engine
let activeEngine: SignalEngine = defaultEngine;

// Re-export types so existing imports switched to './adapter' remain type-compatible
export type WritableSignal<T> = NgWritableSignal<T>;
export type Signal<T> = NgSignal<T>;
export type DestroyRef = NgDestroyRef;
// Also re-export the runtime token for injection use
export { NgDestroyRef as DestroyRefToken };

// Runtime functions (thin wrappers for potential future instrumentation)
// Use generics to maintain strong typing without resorting to 'any'
export const signal: typeof ngSignal = (value, options) =>
  activeEngine.signal(value, options as never);
export const computed: typeof ngComputed = (fn, options) =>
  activeEngine.computed(fn as never, options as never);
export const effect: typeof ngEffect = (fn, options) =>
  activeEngine.effect(fn as never, options as never);
export const isSignal: typeof ngIsSignal = (
  value: unknown
): value is NgSignal<unknown> =>
  activeEngine.isSignal(value as unknown) as boolean;

// Forward all overloads of Angular's inject. Use a variadic wrapper then cast.
export const inject: typeof ngInject = ((...args: unknown[]) =>
  // Cast through unknown to retain overloads without 'any'
  (activeEngine.inject as unknown as (...a: unknown[]) => unknown)(
    ...args
  )) as typeof ngInject;

// Hook for future engine swap (placeholder)
export function configureSignalEngine(engine: Partial<SignalEngine>): void {
  activeEngine = { ...activeEngine, ...engine };
}

// Reset back to the original Angular engine (useful for tests)
export function resetSignalEngine(): void {
  activeEngine = defaultEngine;
}

// Lightweight diagnostic (tree-shaken out in prod if not referenced)
export const __ADAPTER_META__ = () => ({
  engine: 'angular-signals',
  phase: 1,
  overridden: activeEngine.signal !== ngSignal,
  capabilities: activeEngine.capabilities || {
    di: true,
    cleanup: true,
    batching: true,
  },
});

// Re-export experimental vanilla engine factory for opt-in usage
export { vanillaEngine } from './vanilla-engine';

// Auto-configure vanilla engine when explicitly requested via env var before user code runs.
// This is safe for Node / test contexts; browsers can tree-shake unused branch.
declare const process: { env?: Record<string, string | undefined> } | undefined;
try {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env['SIGNALTREE_ENGINE'] === 'vanilla'
  ) {
    // Dynamically import to avoid pulling code unless needed.
    // Use dynamic import to avoid Node-specific 'require' and keep ESM friendly
    import('./vanilla-engine')
      .then((m) => {
        configureSignalEngine({ ...m.vanillaEngine });
      })
      .catch(() => {
        /* ignore */
      });
  }
} catch {
  /* ignore env auto-config failures */
}

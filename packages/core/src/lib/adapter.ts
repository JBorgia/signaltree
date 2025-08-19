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

// Re-export types so existing imports switched to './adapter' remain type-compatible
export type WritableSignal<T> = NgWritableSignal<T>;
export type Signal<T> = NgSignal<T>;
export type DestroyRef = NgDestroyRef;
// Also re-export the runtime token for injection use
export { NgDestroyRef as DestroyRefToken };

// Runtime functions (thin wrappers for potential future instrumentation)
// Use generics to maintain strong typing without resorting to 'any'
export const signal: typeof ngSignal = (value, options) =>
  ngSignal(value, options as never);
export const computed: typeof ngComputed = (fn, options) =>
  ngComputed(fn as never, options as never);
export const effect: typeof ngEffect = (fn, options) =>
  ngEffect(fn as never, options as never);
export const isSignal: typeof ngIsSignal = ngIsSignal;
export const inject: typeof ngInject = ngInject;

// Hook for future engine swap (placeholder)
export function configureSignalEngine(): void {
  // Intentionally empty for Phase 1. Future: accept adapter object.
}

// Lightweight diagnostic (tree-shaken out in prod if not referenced)
export const __ADAPTER_META__ = {
  engine: 'angular-signals',
  phase: 1,
};

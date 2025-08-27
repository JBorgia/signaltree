/**
 * Experimental Vanilla Signal Engine (minimal polyfill)
 *
 * Goal: Provide a framework-agnostic implementation satisfying the SignalEngine
 * interface used by the adapter layer, enabling builds without depending on
 * '@angular/core'. Designed for micro size & adequate semantics for core usage.
 *
 * This is NOT a full Angular-compatible signal system. It implements just the
 * primitives we consume: signal (writable), computed (memoized derivation with
 * dependency tracking), effect (autorun), isSignal predicate, and inject (stub).
 *
 * Tradeoffs: simplified change propagation (synchronous depth-first), minimal
 * optimization. Good enough for non-Angular environments & size-focused builds.
 */
import type { SignalEngine } from './adapter';
// Type-only imports from Angular for signature compatibility (erased at build time)
// No runtime '@angular/core' import to keep this engine framework-neutral.
// No runtime or type imports from '@angular/core' allowed in core; the
// vanilla engine implements the minimal SignalEngine interface from './adapter'.

interface BaseSignal<T> {
  (): T;
  subscribers: Set<() => void>;
}

interface Writable<T> extends BaseSignal<T> {
  set(value: T): void;
  update(fn: (v: T) => T): void;
}

function createSignal<T>(initial: T): Writable<T> {
  let value = initial;
  const subs = new Set<() => void>();
  const fn = function current(): T {
    trackDependency(fn as unknown as BaseSignal<T>);
    return value;
  } as Writable<T>;
  fn.subscribers = subs;
  fn.set = (v) => {
    if (v !== value) {
      value = v;
      for (const s of Array.from(subs)) s();
    }
  };
  fn.update = (u) => fn.set(u(value));
  return fn;
}

let activeComputation: (() => void) | null = null;

function trackDependency(sig: BaseSignal<unknown>) {
  if (activeComputation) sig.subscribers.add(activeComputation);
}

function createComputed<T>(calc: () => T) {
  let cached: T;
  let dirty = true;
  const recompute = () => {
    dirty = true;
    for (const s of Array.from(compSubs)) s();
  };
  const compSubs = new Set<() => void>();
  const effectRunner = () => {
    // Re-evaluate and notify dependents
    const prev = activeComputation;
    activeComputation = recompute;
    try {
      calc();
    } finally {
      activeComputation = prev;
    }
  };
  const read = function (): T {
    if (dirty) {
      const prev = activeComputation;
      activeComputation = recompute;
      try {
        cached = calc();
        dirty = false;
      } finally {
        activeComputation = prev;
      }
    }
    trackDependency(read as unknown as BaseSignal<T>);
    return cached as T;
  } as BaseSignal<T> & (() => T);
  read.subscribers = compSubs;
  // Seed dependencies once
  effectRunner();
  return read;
}

function createEffect(run: () => void) {
  const runner = () => {
    const prev = activeComputation;
    activeComputation = runner;
    try {
      run();
    } finally {
      activeComputation = prev;
    }
  };
  runner();
  return {
    destroy() {
      /* noop for vanilla */
    },
  } as { destroy(): void };
}

function isSignalFn(v: unknown): v is BaseSignal<unknown> {
  return typeof v === 'function' && !!(v as BaseSignal<unknown>).subscribers;
}

function injectStub(): never {
  throw new Error('inject() not available in vanilla engine');
}

// Use casting to align with Angular's typings while providing vanilla behavior
export const vanillaEngine = {
  signal: (value: unknown) => createSignal(value),
  computed: (fn: () => unknown) => createComputed(fn),
  effect: (fn: () => void) => createEffect(fn),
  isSignal: (value: unknown): value is unknown => isSignalFn(value),
  inject: (...args: unknown[]) => {
    void args; // ensure consistent signature; vanilla cannot inject
    return injectStub();
  },
  capabilities: {
    di: false,
    cleanup: false,
    batching: false,
  },
  batch: <T>(fn: () => T): T => fn(),
} as unknown as SignalEngine;

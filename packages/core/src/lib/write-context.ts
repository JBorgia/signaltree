import type { UpdateMetadata } from './types';

/**
 * Ambient write-context channel for tagging tree writes with `UpdateMetadata`.
 *
 * Enhancers (guardrails, validation, devtools) observe writes via leaf
 * interceptors but Angular's `WritableSignal.set(value)` signature cannot be
 * widened to carry metadata. This module provides a synchronous ambient
 * channel that the leaf-interceptor captures at write time.
 *
 * ## Usage
 *
 * Tag a batch of writes with intent:
 *
 * ```ts
 * import { withWriteContext } from '@signaltree/core';
 *
 * withWriteContext({ intent: 'hydrate', source: 'serialization' }, () => {
 *   tree.$.user.set(serverPayload.user);
 *   tree.$.session.set(serverPayload.session);
 * });
 * ```
 *
 * Read the active context from inside an enhancer (e.g., a leaf interceptor
 * callback or guardrails-style payload handler):
 *
 * ```ts
 * import { getActiveWriteContext } from '@signaltree/core';
 *
 * const meta = getActiveWriteContext();
 * if (meta?.intent === 'hydrate') {
 *   // skip validation for hydration replays
 * }
 * ```
 *
 * ## Synchronous capture only
 *
 * The context is restored before `fn` returns and **does not survive `await`
 * boundaries**. This is correct:
 *
 * ```ts
 * withWriteContext({ intent: 'hydrate' }, () => tree.$.x.set(value));
 * ```
 *
 * This is wrong — the `await` yields control, and the context is restored
 * before the second `set` runs:
 *
 * ```ts
 * withWriteContext({ intent: 'hydrate' }, async () => {
 *   await fetch('/api/state');     // context restored to previous frame here
 *   tree.$.x.set(value);           // runs with NO context
 * });
 * ```
 *
 * Restructure so the writes happen synchronously after the await:
 *
 * ```ts
 * const data = await fetch('/api/state');
 * withWriteContext({ intent: 'hydrate' }, () => tree.$.x.set(data));
 * ```
 *
 * ## Multi-tree / SSR
 *
 * `activeContext` is a module-level singleton. In a single-threaded JavaScript
 * runtime (browser, single Node worker) this is safe for the synchronous
 * capture pattern. SSR with concurrent requests sharing a tree across requests
 * is an antipattern; use per-request trees.
 */

let activeContext: UpdateMetadata | undefined;

/**
 * Run `fn` with `meta` set as the active write context. The previous context
 * (if any) is restored when `fn` returns or throws.
 *
 * Synchronous capture only — see module JSDoc for the `await` boundary trap.
 *
 * @returns The value returned by `fn`.
 */
export function withWriteContext<R>(
  meta: UpdateMetadata,
  fn: () => R
): R {
  const previous = activeContext;
  activeContext = meta;
  try {
    return fn();
  } finally {
    activeContext = previous;
  }
}

/**
 * Read the active write context, if any.
 *
 * Returns `undefined` outside a `withWriteContext` frame.
 *
 * @public — Enhancer-author API. Read inside an `onWrite` callback from
 *   `interceptLeafSignals` (or anywhere the enhancer observes writes) to
 *   capture the ambient `UpdateMetadata`. Application code should not use
 *   this directly.
 */
export function getActiveWriteContext(): UpdateMetadata | undefined {
  return activeContext;
}

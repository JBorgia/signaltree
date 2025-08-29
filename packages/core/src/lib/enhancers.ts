/**
 * SignalTree Enhancer System
 * Handles enhancer composition and dependency resolution
 */
import { SIGNAL_TREE_MESSAGES } from './constants';
import { ENHANCER_META } from './types';

import type { EnhancerMeta, EnhancerWithMeta } from './types';
/**
 * Helper to create an enhancer with metadata attached
 *
 * @param meta - Metadata describing the enhancer
 * @param enhancerFn - The enhancer function
 * @returns Enhancer function with metadata attached
 *
 * @example
 * ```typescript
 * const myEnhancer = createEnhancer(
 *   {
 *     name: 'myEnhancer',
 *     provides: ['feature1'],
 *     requires: ['feature2']
 *   },
 *   (tree) => {
 *     // Enhance the tree
 *     return { ...tree, feature1: true };
 *   }
 * );
 * ```
 */
export function createEnhancer<I = unknown, O = unknown>(
  meta: EnhancerMeta,
  enhancerFn: (input: I) => O
): EnhancerWithMeta<I, O> {
  const fn = enhancerFn as EnhancerWithMeta<I, O>;
  try {
    fn.metadata = meta;
    // Also attach under symbol for third-party compatibility
    try {
      (fn as unknown as Record<symbol, unknown>)[ENHANCER_META] = meta;
    } catch {
      // Ignore if property can't be set
    }
  } catch {
    // Ignore errors
  }
  return fn;
}

/**
 * Resolve enhancer order using topological sort based on dependencies
 *
 * @param enhancers - Array of enhancers to order
 * @param availableCapabilities - Set of already available capabilities
 * @param debugMode - Whether to log debug information
 * @returns Ordered array of enhancers
 */
export function resolveEnhancerOrder(
  enhancers: EnhancerWithMeta<unknown, unknown>[],
  availableCapabilities: Set<string> = new Set<string>(),
  debugMode = false
): EnhancerWithMeta<unknown, unknown>[] {
  // Build nodes with metadata
  const nodes = enhancers.map((e, idx) => ({
    fn: e,
    name:
      e.metadata && e.metadata.name
        ? String(e.metadata.name)
        : `enhancer#${idx}`,
    requires: new Set<string>(e.metadata?.requires ?? []),
    provides: new Set<string>(e.metadata?.provides ?? []),
  }));

  // Build dependency graph
  const adj = new Map<string, Set<string>>();
  const nameToNode = new Map<string, (typeof nodes)[0]>();

  for (const n of nodes) {
    nameToNode.set(n.name, n);
    adj.set(n.name, new Set<string>());
  }

  // Create edges based on requirements
  for (const a of nodes) {
    for (const b of nodes) {
      if (a === b) continue;
      for (const req of b.requires) {
        // Skip if requirement is already satisfied
        if (availableCapabilities.has(req)) continue;

        if (a.provides.has(req)) {
          // a must come before b
          const set = adj.get(a.name);
          if (set) set.add(b.name);
        }
      }
    }
  }

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  for (const entry of adj.keys()) inDegree.set(entry, 0);
  for (const [, outs] of adj) {
    for (const to of outs) inDegree.set(to, (inDegree.get(to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(name);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift() as string;
    if (!n) break;
    ordered.push(n);
    const outs = adj.get(n);
    if (!outs) continue;
    for (const m of outs) {
      inDegree.set(m, (inDegree.get(m) || 0) - 1);
      if (inDegree.get(m) === 0) queue.push(m);
    }
  }

  // Check for cycles
  if (ordered.length !== nodes.length) {
    if (debugMode) {
      console.warn(SIGNAL_TREE_MESSAGES.ENHANCER_CYCLE_DETECTED);
    }
    return enhancers;
  }

  // Map ordered names back to enhancer functions
  return ordered.map((name) => {
    const n = nameToNode.get(name);
    return (n ? n.fn : enhancers[0]) as EnhancerWithMeta<unknown, unknown>;
  });
}

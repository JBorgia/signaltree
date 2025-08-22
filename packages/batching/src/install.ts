import type { SignalTree } from '@signaltree/core';

const BATCHING_FLAG = Symbol.for('@signaltree/batching:installed');

/**
 * Dynamically installs the batching enhancer onto an existing tree.
 * Idempotent: multiple calls are safe.
 */
export async function installBatching<T>(tree: SignalTree<T>): Promise<void> {
  try {
    // fast-path: already installed
    const markerHost = tree as unknown as Record<symbol, unknown>;
    if (markerHost[BATCHING_FLAG]) return;

    // Dynamic import the batching package and apply the enhancer
    const mod = await import('./lib/batching');

    if (typeof mod.withBatching !== 'function') {
      throw new Error('withBatching() not found in batching module');
    }

    // Apply enhancer (use default options)
    const enhancer = mod.withBatching();
    enhancer(tree);

    // mark installed
    markerHost[BATCHING_FLAG] = true;
  } catch (err) {
    throw new Error(
      `Failed to install batching enhancer: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export default installBatching;

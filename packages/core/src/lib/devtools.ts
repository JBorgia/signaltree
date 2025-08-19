import { isSignal } from './adapter';
import type { SignalTree, PerformanceMetrics } from './types';

// Global registry symbol (shared across bundles if Symbol.for)
const REGISTRY_KEY = Symbol.for('__SIGNALTREE_REGISTRY__');

interface RegistryEntry {
  name: string;
  tree: SignalTree<unknown>; // intentionally widened for heterogeneous storage
  created: number;
  version: () => number;
  getMetrics: () => PerformanceMetrics;
}

type RegistryMap = Map<string, RegistryEntry> & { _counter?: number };

function getGlobalRegistry(): RegistryMap {
  const g = globalThis as unknown as Record<string | symbol, unknown>;
  let reg = g[REGISTRY_KEY] as RegistryMap | undefined;
  if (!reg) {
    reg = new Map() as RegistryMap;
    reg._counter = 0;
    g[REGISTRY_KEY] = reg;
  }
  return reg;
}

function shouldRegister(): boolean {
  const g: unknown = globalThis;
  const env =
    typeof g === 'object' && g && 'process' in g
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((g as any).process?.env?.NODE_ENV as string | undefined)
      : undefined;
  return env !== 'production';
}

export function registerTree<T>(
  tree: SignalTree<T>,
  explicitName?: string
): string | null {
  if (!shouldRegister()) return null;
  const registry = getGlobalRegistry();
  registry._counter = (registry._counter ?? 0) + 1;
  const name = explicitName || `tree#${registry._counter}`;
  registry.set(name, {
    name,
    tree: tree as unknown as SignalTree<unknown>,
    created: Date.now(),
    version: tree.getVersion,
    getMetrics: () => {
      try {
        return typeof tree.getMetrics === 'function'
          ? tree.getMetrics()
          : {
              updates: 0,
              computations: 0,
              cacheHits: 0,
              cacheMisses: 0,
              averageUpdateTime: 0,
            };
      } catch {
        return {
          updates: 0,
          computations: 0,
          cacheHits: 0,
          cacheMisses: 0,
          averageUpdateTime: 0,
        };
      }
    },
  });
  (tree as unknown as { __devtoolsId?: string }).__devtoolsId = name;
  return name;
}

export function unregisterTree(name: string): void {
  if (!shouldRegister()) return;
  getGlobalRegistry().delete(name);
}

export function listTrees(): string[] {
  if (!shouldRegister()) return [];
  return Array.from(getGlobalRegistry().keys());
}

export function getTree(name: string): SignalTree<unknown> | undefined {
  if (!shouldRegister()) return undefined;
  const entry = getGlobalRegistry().get(name);
  return entry?.tree;
}

function unwrapAny(value: unknown): unknown {
  if (isSignal(value)) {
    try {
      return (value as () => unknown)();
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    return value.map(unwrapAny);
  }
  if (value && typeof value === 'object') {
    const out: Record<string | symbol, unknown> = {};
    for (const k of Reflect.ownKeys(value)) {
      const key = k as string | symbol;
      out[key] = unwrapAny((value as Record<string | symbol, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export interface SnapshotOptions {
  includeMetrics?: boolean;
}

export function snapshotTree(name: string, opts: SnapshotOptions = {}) {
  if (!shouldRegister()) return null;
  const entry = getGlobalRegistry().get(name);
  if (!entry) return null;
  return {
    name: entry.name,
    version: entry.version(),
    state: unwrapAny(entry.tree.state),
    metrics: opts.includeMetrics ? entry.getMetrics() : undefined,
    created: entry.created,
  };
}

export function snapshot(value: unknown): unknown {
  return unwrapAny(value);
}

export const __DEVTOOLS_META__ = {
  key: String(REGISTRY_KEY),
};

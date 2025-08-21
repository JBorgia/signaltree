// Minimal in-core devtools registry and snapshot helpers.
// Purpose: provide the small runtime API core expects (register/list/snapshot)
// without pulling in the full @signaltree/devtools package and without
// creating a project dependency cycle in the build graph.

const REGISTRY_KEY = Symbol.for('__SIGNALTREE_REGISTRY__');

interface RegistryEntry {
  name: string;
  tree: unknown;
  created: number;
  version?: () => number;
  getMetrics?: () => unknown;
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
  // Prefer a build-time define so bundlers can DCE this module in production.
  // If __DEV__ is defined by the build tool it takes precedence. Otherwise
  // fall back to runtime env detection for environments that don't define it.
  // Prefer a build-time define if available on globalThis (avoid redeclaring __DEV__ here)
  const globalDev = (globalThis as any).__DEV__;
  if (typeof globalDev !== 'undefined') return Boolean(globalDev);
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
    import?: { meta?: { env?: { MODE?: string } } };
  };
  const envNode = g.process?.env?.['NODE_ENV'];
  const envVite = (g.import as any)?.meta?.env?.MODE;
  const mode = envNode || envVite;
  return mode !== 'production';
}

export function registerTree<T>(tree: T, explicitName?: string): string | null {
  if (!shouldRegister()) return null;
  const registry = getGlobalRegistry();
  registry._counter = (registry._counter ?? 0) + 1;
  const name = explicitName || `tree#${registry._counter}`;
  // Avoid accidental duplicate entries for the same name
  if (registry.has(name)) registry.delete(name);
  registry.set(name, {
    name,
    tree,
    created: Date.now(),
    version: (tree as any).getVersion?.bind(tree),
    getMetrics: (tree as any).getMetrics?.bind(tree),
  });
  try {
    (tree as any).__devtoolsId = name;
  } catch {
    // ignore
  }
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

export function getTree(name: string): unknown | undefined {
  if (!shouldRegister()) return undefined;
  const entry = getGlobalRegistry().get(name);
  return entry?.tree;
}

// Prefer the tree's own `unwrap()` when available. This avoids coupling to
// the host adapter and is faster than walking signals manually.
function unwrapTreeLike(value: unknown): unknown {
  const maybe = value as { unwrap?: () => unknown; state?: unknown };
  if (typeof maybe?.unwrap === 'function') {
    try {
      return maybe.unwrap();
    } catch {
      // ignore
    }
  }
  // Fallback: shallowly follow `.state` if present (covers registered objects)
  if (maybe && 'state' in maybe) return unwrapTreeLike((maybe as any).state);
  return value;
}

export function snapshotTree(
  name: string,
  opts: { includeMetrics?: boolean } = { includeMetrics: false }
) {
  if (!shouldRegister()) return null;
  const entry = getGlobalRegistry().get(name);
  if (!entry) return null;
  const t = entry.tree as any;
  return {
    name: entry.name,
    version: entry.version ? entry.version() : undefined,
    state:
      typeof t?.unwrap === 'function' ? t.unwrap() : unwrapTreeLike(t?.state),
    metrics:
      opts.includeMetrics && entry.getMetrics ? entry.getMetrics() : undefined,
    created: entry.created,
  };
}

export function snapshot(value: unknown): unknown {
  const maybe = value as any;
  return typeof maybe?.unwrap === 'function' ? maybe.unwrap() : value;
}

export const __DEVTOOLS_META__ = { key: String(REGISTRY_KEY) } as const;
export const __DEVTOOLS_ENABLED__ = shouldRegister();

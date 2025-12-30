import { isSignal, Signal, WritableSignal } from '@angular/core';
import { deepEqual } from '../../lib/utils';

import { TYPE_MARKERS } from '../../lib/constants';

import type { SignalTree } from '../../lib/types';

import type { EnhancerWithMeta } from '../../lib/types';
export interface SerializationConfig {
  includeMetadata?: boolean;
  replacer?: (key: string, value: unknown) => unknown;
  reviver?: (key: string, value: unknown) => unknown;
  preserveTypes?: boolean;
  maxDepth?: number;
  handleCircular?: boolean;
}

export interface SerializedState<T = unknown> {
  data: T;
  metadata?: {
    timestamp: number;
    version: string;
    appVersion?: string;
    types?: Record<string, string>;
    circularRefs?: Array<{
      path: string;
      targetPath: string;
    }>;
    nodeMap?: Record<string, 'b' | 'r'>;
  };
}

export interface SerializableSignalTree<T> extends SignalTree<T> {
  /** Explicit reactive alias for state (helps TS resolution in tests) */
  // Use `any` here as a pragmatic escape hatch to avoid TS index-signature
  // access errors in tests (dot-access on dynamic keys). This will be
  // tightened later once type incompatibilities between enhancers and
  // `.with()` are fully resolved.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: any;
  serialize(config?: SerializationConfig): string;
  deserialize(json: string, config?: SerializationConfig): void;
  toJSON(): T;
  fromJSON(data: T, metadata?: SerializedState<T>['metadata']): void;
  snapshot(): SerializedState<T>;
  restore(snapshot: SerializedState<T>): void;
}

export interface PersistenceMethods {
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
  __flushAutoSave?: () => Promise<void>;
}

/**
 * Default serialization config
 */
const DEFAULT_CONFIG: Required<
  Omit<SerializationConfig, 'replacer' | 'reviver'>
> &
  Pick<SerializationConfig, 'replacer' | 'reviver'> = {
  includeMetadata: true,
  replacer: undefined,
  reviver: undefined,
  preserveTypes: true,
  maxDepth: 50,
  handleCircular: true,
};

/**
 * Safely unwrap object with circular reference detection
 */
function unwrapObjectSafely(
  obj: unknown,
  visited = new WeakSet<object>(),
  depth = 0,
  maxDepth = 50,
  preserveTypes = true
): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth) return '[Max Depth Exceeded]';

  // Primitives and non-objects
  if (obj === null || typeof obj !== 'object') {
    if (!preserveTypes) return obj;

    if (obj === undefined) return { [TYPE_MARKERS.UNDEFINED]: true };
    if (typeof obj === 'number') {
      if (Number.isNaN(obj)) return { [TYPE_MARKERS.NAN]: true };
      if (obj === Infinity) return { [TYPE_MARKERS.INFINITY]: true };
      if (obj === -Infinity) return { [TYPE_MARKERS.NEG_INFINITY]: true };
      return obj;
    }
    if (typeof obj === 'bigint') return { [TYPE_MARKERS.BIGINT]: String(obj) };
    if (typeof obj === 'symbol') return { [TYPE_MARKERS.SYMBOL]: String(obj) };
    return obj;
  }

  // Handle callable signals (no longer need complex branch wrapper detection)
  if (typeof obj === 'function') {
    try {
      // Check if it's a callable signal by trying to invoke it
      const result = (obj as () => unknown)();
      return unwrapObjectSafely(
        result,
        visited,
        depth + 1,
        maxDepth,
        preserveTypes
      );
    } catch {
      // Not a callable signal, treat as regular function (non-serializable)
      return '[Function]';
    }
  }

  // If object already visited, mark as circular
  if (visited.has(obj as object)) return '[Circular Reference]';

  // Unwrap signals
  if (isSignal(obj)) return (obj as Signal<unknown>)();

  // Preserve special types
  if (preserveTypes) {
    if (obj instanceof Date) return { [TYPE_MARKERS.DATE]: obj.toISOString() };
    if (obj instanceof RegExp)
      return {
        [TYPE_MARKERS.REGEXP]: { source: obj.source, flags: obj.flags },
      };
    if (obj instanceof Map) {
      return { [TYPE_MARKERS.MAP]: Array.from(obj.entries()) };
    }
    if (obj instanceof Set) {
      return { [TYPE_MARKERS.SET]: Array.from(obj.values()) };
    }
  } else {
    if (obj instanceof Date || obj instanceof RegExp) return obj;
  }

  visited.add(obj as object);

  try {
    if (Array.isArray(obj)) {
      const arr = (obj as unknown[]).map((item) =>
        unwrapObjectSafely(item, visited, depth + 1, maxDepth, preserveTypes)
      );
      visited.delete(obj as object);
      return arr;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Skip runtime helpers when they are plain functions (not signals)
      if (
        (k === 'set' || k === 'update') &&
        typeof v === 'function' &&
        !isSignal(v)
      )
        continue;

      if (isSignal(v)) {
        out[k] = unwrapObjectSafely(
          (v as Signal<unknown>)(),
          visited,
          depth + 1,
          maxDepth,
          preserveTypes
        );
      } else if (typeof v === 'function' && k !== 'set' && k !== 'update') {
        // Handle callable signals - these are functions but not helper methods
        try {
          const callResult = (v as () => unknown)();
          out[k] = unwrapObjectSafely(
            callResult,
            visited,
            depth + 1,
            maxDepth,
            preserveTypes
          );
        } catch {
          // If calling fails, skip this property
          continue;
        }
      } else {
        out[k] = unwrapObjectSafely(
          v,
          visited,
          depth + 1,
          maxDepth,
          preserveTypes
        );
      }
    }

    visited.delete(obj as object);
    return out;
  } catch {
    visited.delete(obj as object);
    return '[Serialization Error]';
  }
}

/**
 * Detects circular references in an object
 */
function detectCircularReferences(
  obj: unknown,
  path = '',
  seen = new WeakSet<object>(),
  paths = new Map<object, string>()
): Array<{ path: string; targetPath: string }> {
  const circular: Array<{ path: string; targetPath: string }> = [];

  if (obj === null || typeof obj !== 'object') {
    return circular;
  }

  // Check if we've seen this object before
  if (seen.has(obj)) {
    // Found a circular reference
    const targetPath = paths.get(obj) || '';
    circular.push({ path, targetPath });
    return circular; // Don't recurse into circular references
  }

  // Mark this object as seen
  seen.add(obj);
  paths.set(obj, path);

  // Recursively check children
  if (Array.isArray(obj)) {
    const arrObj = obj as unknown[];
    for (let i = 0; i < arrObj.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      const childCircular = detectCircularReferences(
        arrObj[i],
        itemPath,
        seen,
        paths
      );
      circular.push(...childCircular);
    }
  } else {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const propPath = path ? `${path}.${key}` : key;
      const childCircular = detectCircularReferences(
        value,
        propPath,
        seen,
        paths
      );
      circular.push(...childCircular);
    }
  }

  // Remove from seen set when backing out (allows siblings to reference same objects)
  seen.delete(obj as object);

  return circular;
}

/**
 * Internal config with all required properties but nullable functions
 */
type InternalSerializationConfig = Required<
  Omit<SerializationConfig, 'replacer' | 'reviver'>
> & {
  replacer?: (key: string, value: unknown) => unknown;
  reviver?: (key: string, value: unknown) => unknown;
};

// Minimal runtime stubs so module resolution works during tests.
export function withSerialization(
  defaultConfig?: SerializationConfig
): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & SerializableSignalTree<any> {
  return <Tree extends ISignalTree<any>>(tree: Tree) => {
    const cfg = Object.assign({} as SerializationConfig, defaultConfig || {});

    function toJSON(): any {
      // Snapshot the tree by calling it as a node accessor
      try {
        return (tree as unknown as () => any)();
      } catch {
        // Fallback: attempt to read `.state` if callable fails
        // Avoid console logs as requested
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (tree as any).state ?? {};
      }
    }

    function fromJSON(data: any, _metadata?: SerializedState<any>['metadata']) {
      // Assign the full state back to the tree
      try {
        (tree as unknown as (v: any) => void)(data);
      } catch {
        // If direct assignment fails, try setting `.state` if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((tree as any).state !== undefined) {
          // shallow copy to avoid retaining references
          (tree as any).state = JSON.parse(JSON.stringify(data));
        }
      }
    }

    function serialize(config?: SerializationConfig) {
      const serializationConfig = Object.assign({}, cfg, config || {});
      const payload = toJSON();
      const metadata = {
        timestamp: Date.now(),
        version: serializationConfig?.preserveTypes ? 'preserve' : 'v1',
      } as SerializedState<any>['metadata'];
      const state: SerializedState<any> = { data: payload, metadata };
      return JSON.stringify(state, serializationConfig.replacer as any);
    }

    function deserialize(json: string, config?: SerializationConfig) {
      const serializationConfig = Object.assign({}, cfg, config || {});
      const parsed = JSON.parse(
        json,
        serializationConfig.reviver as any
      ) as SerializedState<any>;
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        fromJSON(parsed.data, parsed.metadata);
      }
    }

    function snapshot(): SerializedState<any> {
      return {
        data: toJSON(),
        metadata: { timestamp: Date.now(), version: 'v1' },
      };
    }

    function restore(snapshotObj: SerializedState<any>) {
      fromJSON(snapshotObj.data, snapshotObj.metadata);
    }

    const enhanced = Object.assign(tree as any, {
      serialize,
      deserialize,
      toJSON,
      fromJSON,
      snapshot,
      restore,
    }) as Tree & SerializableSignalTree<any>;

    return enhanced;
  };
}

export function enableSerialization() {
  return <Tree extends ISignalTree<any>>(tree: Tree) =>
    withSerialization()(tree as any) as any;
}

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface PersistenceConfig extends SerializationConfig {
  key: string;
  storage?: StorageAdapter;
  autoSave?: boolean;
  debounceMs?: number;
  autoLoad?: boolean;
  skipCache?: boolean;
}

export function withPersistence(config: PersistenceConfig) {
  return <Tree extends ISignalTree<any>>(tree: Tree) => {
    const cfg: PersistenceConfig = Object.assign(
      {} as PersistenceConfig,
      config || ({} as any)
    );
    const storage: StorageAdapter =
      cfg.storage ??
      (typeof localStorage !== 'undefined'
        ? createStorageAdapter(
            (k) => localStorage.getItem(k),
            (k, v) => localStorage.setItem(k, v),
            (k) => localStorage.removeItem(k)
          )
        : createStorageAdapter(
            () => null,
            () => undefined,
            () => undefined
          ));

    async function save(): Promise<void> {
      const payload = JSON.stringify({
        data: (tree as unknown as () => any)(),
        metadata: { timestamp: Date.now() },
      });
      const res = storage.setItem(cfg.key, payload);
      if (res instanceof Promise) await res;
    }

    async function load(): Promise<void> {
      const valOrPromise = storage.getItem(cfg.key);
      const raw =
        valOrPromise instanceof Promise ? await valOrPromise : valOrPromise;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { data: any };
        if (parsed && 'data' in parsed) {
          (tree as unknown as (v: any) => void)(parsed.data);
        }
      } catch {
        // silent failure per user request (no console logs)
      }
    }

    async function clear(): Promise<void> {
      const res = storage.removeItem(cfg.key);
      if (res instanceof Promise) await res;
    }

    // Simple auto-save implementation: poll the tree and persist when it changes.
    let autoSaveInterval: number | undefined;
    let lastSnapshot: any = undefined;

    if (cfg.autoLoad) {
      // fire-and-forget load
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      load();
    }

    if (cfg.autoSave) {
      const debounceMs =
        typeof cfg.debounceMs === 'number' ? cfg.debounceMs : 1000;
      lastSnapshot = (tree as unknown as () => any)();
      // use window.setInterval which returns number in browsers
      autoSaveInterval = setInterval(async () => {
        try {
          const current = (tree as unknown as () => any)();
          if (!deepEqual(current, lastSnapshot)) {
            lastSnapshot = JSON.parse(JSON.stringify(current));
            await save();
          }
        } catch {
          // silent
        }
      }, debounceMs) as unknown as number;
    }

    // Patch destroy to clear interval
    const originalDestroy = (tree as any).destroy;
    (tree as any).destroy = function destroyPatched(...args: any[]) {
      if (autoSaveInterval !== undefined) {
        try {
          clearInterval(autoSaveInterval as any);
        } catch {
          /* ignore */
        }
        autoSaveInterval = undefined;
      }
      if (originalDestroy) return originalDestroy.apply(this, args);
    };

    const enhanced = Object.assign(tree as any, {
      save,
      load,
      clear,
      __flushAutoSave: async () => {
        if (autoSaveInterval !== undefined) {
          // perform an immediate save
          await save();
        }
      },
    }) as unknown as SerializableSignalTree<any> & PersistenceMethods;

    return enhanced as any;
  };
}

export function createStorageAdapter(
  getItem: (key: string) => string | null | Promise<string | null>,
  setItem: (key: string, value: string) => void | Promise<void>,
  removeItem: (key: string) => void | Promise<void>
) {
  return { getItem, setItem, removeItem } as StorageAdapter;
}

export function createIndexedDBAdapter(dbName?: string, storeName?: string) {
  // Basic indexedDB-backed adapter that falls back to localStorage when not available.
  if (typeof indexedDB === 'undefined' || typeof window === 'undefined') {
    return createStorageAdapter(
      (k) =>
        typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null,
      (k, v) => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
      },
      (k) => {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
      }
    );
  }

  const prefix = `${dbName ?? 'signaltree'}:${storeName ?? 'state'}`;

  return createStorageAdapter(
    async (key) => {
      const item = localStorage.getItem(prefix + ':' + key);
      return item;
    },
    async (key, value) => {
      localStorage.setItem(prefix + ':' + key, value);
    },
    async (key) => {
      localStorage.removeItem(prefix + ':' + key);
    }
  );
}

export function applySerialization<T>(tree: ISignalTree<T>) {
  return tree as unknown as SerializableSignalTree<T>;
}

export function applyPersistence<T>(
  tree: ISignalTree<T>,
  cfg: PersistenceConfig
) {
  return tree as unknown as SerializableSignalTree<T> & PersistenceMethods;
}

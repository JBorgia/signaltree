import { isSignal, Signal, WritableSignal } from '@angular/core';
import { SignalTree } from '@signaltree/core';

import { TYPE_MARKERS } from '../constants';

import type { EnhancerWithMeta } from '@signaltree/core';

/**
 * SignalTree Serialization Module
 *
 * Provides serialization and deserialization capabilities for SignalTree,
 * enabling state persistence, SSR, and state transfer between contexts.
 */
/**
 * Interface for SignalTree with debug configuration
 */
interface SignalTreeWithConfig<T = unknown> extends SignalTree<T> {
  __config?: {
    debugMode?: boolean;
  };
}

/**
 * Interface for enhanced SignalTree with auto-save functionality
 */
interface EnhancedSignalTree<T = unknown> extends SerializableSignalTree<T> {
  __flushAutoSave?: () => Promise<void>;
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Serialization configuration options
 */
export interface SerializationConfig {
  /**
   * Whether to include metadata (timestamps, version, etc.)
   * @default true
   */
  includeMetadata?: boolean;

  /**
   * Custom replacer function for JSON.stringify
   */
  replacer?: (key: string, value: unknown) => unknown;

  /**
   * Custom reviver function for JSON.parse
   */
  reviver?: (key: string, value: unknown) => unknown;

  /**
   * Whether to preserve special types (Date, RegExp, etc.)
   * @default true
   */
  preserveTypes?: boolean;

  /**
   * Maximum depth to serialize (prevents infinite recursion)
   * @default 50
   */
  maxDepth?: number;

  /**
   * Whether to handle circular references
   * @default true
   */
  handleCircular?: boolean;
}

/**
 * Serialized state wrapper with metadata
 */
export interface SerializedState<T = unknown> {
  /**
   * The actual serialized state data
   */
  data: T;

  /**
   * Metadata about the serialization
   */
  metadata?: {
    /**
     * Timestamp when serialized
     */
    timestamp: number;

    /**
     * Version of the serialization format
     */
    version: string;

    /**
     * Custom application version
     */
    appVersion?: string;

    /**
     * Type information for special objects
     */
    types?: Record<string, string>;

    /**
     * Circular reference paths
     */
    circularRefs?: Array<{ path: string; targetPath: string }>;
    /**
     * Optional map of paths that indicate where the target tree contains
     * branch nodes (objects with set/update) or root-as-signal markers.
     * Keys are paths (dot/array notation), values: 'b' = branch, 'r' = root
     */
    nodeMap?: Record<string, 'b' | 'r'>;
  };
}

/**
 * Enhanced SignalTree interface with serialization capabilities
 */
export interface SerializableSignalTree<T> extends SignalTree<T> {
  /** Explicit reactive alias for state (helps TS resolution in tests) */
  // Use `any` here as a pragmatic escape hatch to avoid TS index-signature
  // access errors in tests (dot-access on dynamic keys). This will be
  // tightened later once type incompatibilities between enhancers and
  // `.with()` are fully resolved.
  $: any;
  /**
   * Serialize the current state to a JSON string
   */
  serialize(config?: SerializationConfig): string;

  /**
   * Deserialize and apply state from a JSON string
   */
  deserialize(json: string, config?: SerializationConfig): void;

  /**
   * Get a plain object representation of the current state
   */
  toJSON(): T;

  /**
   * Restore state from a plain object
   */
  fromJSON(data: T, metadata?: SerializedState<T>['metadata']): void;

  /**
   * Create a snapshot of the current state
   */
  snapshot(): SerializedState<T>;

  /**
   * Restore state from a snapshot
   */
  restore(snapshot: SerializedState<T>): void;
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

  // Handle callable wrappers produced by SignalTree (callable branches).
  // These are functions with own properties like 'set'/'update'. Detect
  // them and invoke to get the underlying plain branch for serialization.
  if (typeof obj === 'function') {
    try {
      const maybe = obj as unknown as Record<string, unknown>;
      if (
        Object.prototype.hasOwnProperty.call(maybe, 'set') ||
        Object.prototype.hasOwnProperty.call(maybe, 'update')
      ) {
        const inner = (obj as unknown as () => unknown)();
        return unwrapObjectSafely(
          inner,
          visited,
          depth + 1,
          maxDepth,
          preserveTypes
        );
      }
    } catch {
      // Fall through to treat function as non-serializable value
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
      try {
        console.debug('[serialization-debug] unwrap detected Map instance');
      } catch {
        // ignore
      }
      return { [TYPE_MARKERS.MAP]: Array.from(obj.entries()) };
    }
    if (obj instanceof Set) {
      try {
        console.debug('[serialization-debug] unwrap detected Set instance');
      } catch {
        // ignore
      }
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
      if (k === 'set') {
        try {
          console.debug(
            '[serialization-debug] iterating key=set, typeof v=',
            typeof v,
            'isSet?',
            v instanceof Set
          );
        } catch {
          // ignore
        }
      }

      // Skip runtime helpers, but only when they are plain functions (not signals)
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
    for (let i = 0; i < (obj as any).length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      const childCircular = detectCircularReferences(
        (obj as any)[i],
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

/**
 * Methods added by the persistence enhancer
 */
export interface PersistenceMethods {
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
  __flushAutoSave?: () => Promise<void>;
}

/**
 * Custom replacer that handles circular references only
 */
function createReplacer(config: InternalSerializationConfig) {
  const seen = new WeakSet<object>();
  const circularPaths = new Map<object, string>();

  return function replacer(
    this: Record<string, unknown>,
    key: string,
    value: unknown
  ): unknown {
    // Apply custom replacer first if provided
    if (config.replacer) {
      value = config.replacer.call(this, key, value);
    }

    // Skip signals - we already unwrapped them
    if (isSignal(value)) {
      return (value as Signal<unknown>)();
    }

    // Handle circular references
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        if (config.handleCircular) {
          const targetPath = circularPaths.get(value) || '';
          return { [TYPE_MARKERS.CIRCULAR]: targetPath };
        }
        return undefined;
      }
      seen.add(value);
      const currentPath = key || '';
      circularPaths.set(value, currentPath);
    }

    // All special type handling is now done in unwrapObjectSafely
    return value;
  };
}

/**
 * Resolves circular references after parsing
 */
function resolveCircularReferences(
  obj: Record<string, unknown>,
  circularPaths: Array<{ path: string; targetPath: string }>
): void {
  for (const { path, targetPath } of circularPaths) {
    const pathParts = path.split(/\.|\[|\]/).filter(Boolean);
    const targetParts = targetPath.split(/\.|\[|\]/).filter(Boolean);

    // Navigate to the circular reference location
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]] as Record<string, unknown>;
      if (!current) break;
    }

    // Navigate to the target
    let target: Record<string, unknown> = obj;
    for (const part of targetParts) {
      target = target[part] as Record<string, unknown>;
      if (!target) break;
    }

    // Set the circular reference
    if (current && target) {
      current[pathParts[pathParts.length - 1]] = target;
    }
  }
}

/**
 * Enhances a SignalTree with serialization capabilities
 */
export function withSerialization<T extends Record<string, unknown> = any>(
  defaultConfig: SerializationConfig = {}
): EnhancerWithMeta<SignalTree<T>, SerializableSignalTree<T>> {
  const enhancer = (tree: SignalTree<T>): SerializableSignalTree<T> => {
    const enhanced = tree as SerializableSignalTree<T>;
    /**
     * Get plain object representation
     */
    enhanced.toJSON = (): T => {
      // Delegate to the tree's public unwrap() which already strips helper
      // methods like `set`/`update`. Keep unwrapObjectSafely for
      // serialize() where we need type-preserving markers.
      return tree.unwrap();
    };

    /**
     * Restore from plain object
     */
    enhanced.fromJSON = (
      data: T,
      metadata?: SerializedState<T>['metadata']
    ): void => {
      // Convert special type markers back to their actual types
      const restoreSpecialTypes = (value: unknown): unknown => {
        if (!value || typeof value !== 'object') {
          return value;
        }

        // Check for type markers
        if (TYPE_MARKERS.UNDEFINED in value) {
          return undefined;
        }
        if (TYPE_MARKERS.NAN in value) {
          return NaN;
        }
        if (TYPE_MARKERS.INFINITY in value) {
          return Infinity;
        }
        if (TYPE_MARKERS.NEG_INFINITY in value) {
          return -Infinity;
        }
        if (TYPE_MARKERS.BIGINT in value) {
          return BigInt(value[TYPE_MARKERS.BIGINT] as string);
        }
        if (TYPE_MARKERS.SYMBOL in value) {
          return Symbol.for(value[TYPE_MARKERS.SYMBOL] as string);
        }
        if (TYPE_MARKERS.DATE in value) {
          return new Date(value[TYPE_MARKERS.DATE] as string);
        }
        if (TYPE_MARKERS.REGEXP in value) {
          const regexpData = value[TYPE_MARKERS.REGEXP] as {
            source: string;
            flags: string;
          };
          return new RegExp(regexpData.source, regexpData.flags);
        }
        if (TYPE_MARKERS.MAP in value) {
          return new Map(value[TYPE_MARKERS.MAP] as Array<[unknown, unknown]>);
        }
        if (TYPE_MARKERS.SET in value) {
          return new Set(value[TYPE_MARKERS.SET] as Array<unknown>);
        }

        // Handle arrays
        if (Array.isArray(value)) {
          return value.map(restoreSpecialTypes);
        }

        // Handle objects
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = restoreSpecialTypes(v);
        }
        return result;
      };

      // Restore special types in the data
      const restoredData = restoreSpecialTypes(data);
      // DEBUG: trace restoredData for special types diagnostics
      try {
        // eslint-disable-next-line no-console
        console.debug('[serialization-debug] restoredData preview:', {
          keys: Object.keys(restoredData as Record<string, unknown>),
          sample: (restoredData as any)?.date,
        });
      } catch {
        /* ignore */
      }

      // If the serialized data contains a compact nodeMap, use it to apply
      // updates deterministically: 'r' => root set, 'b' => set on branch
      const nodeMap = (metadata as any)?.nodeMap as
        | Record<string, 'b' | 'r'>
        | undefined;

      if (nodeMap && Object.keys(nodeMap).length > 0) {
        // Root marker
        if (nodeMap[''] === 'r') {
          const rootAlias = (tree as any).$;
          if (rootAlias && typeof rootAlias.set === 'function') {
            (rootAlias as WritableSignal<unknown>).set(restoredData);
            return;
          }
        }

        // For branch entries, apply child signal .set directly when possible
        for (const [path, kind] of Object.entries(nodeMap)) {
          if (path === '') continue; // root handled
          if (kind !== 'b') continue;

          // Navigate to path and set the node if a WritableSignal is found
          const parts = path.split(/\.|\[|\]/).filter(Boolean);
          let node: any = (tree as any).$;
          for (const p of parts) {
            if (!node) break;
            node = node[p];
          }

          if (node && isSignal(node)) {
            // Extract the corresponding value from restoredData
            let current: any = restoredData as any;
            for (const p of parts) {
              if (current == null) {
                current = undefined;
                break;
              }
              current = current[p];
            }
            try {
              try {
                // eslint-disable-next-line no-console
                console.debug('[serialization-debug] nodeMap apply', {
                  path,
                  currentType: current === null ? 'null' : typeof current,
                  isSet: current instanceof Set,
                  setSize:
                    current instanceof Set
                      ? (current as Set<unknown>).size
                      : undefined,
                  isMap: current instanceof Map,
                  mapSize:
                    current instanceof Map
                      ? (current as Map<unknown, unknown>).size
                      : undefined,
                });
              } catch {
                console.debug('[serialization-debug] nodeMap apply error');
              }

              (node as WritableSignal<unknown>).set(current);
            } catch {
              /* ignore per-path failures */
            }
          }
        }

        // After applying nodeMap-targeted sets, perform a best-effort deep update for remaining keys
        updateSignals(
          tree.state as Record<string, unknown>,
          restoredData as Record<string, unknown>
        );
        return;
      }

      // Deep update the tree with new data. Resolve deep signals from the
      // root alias (`tree.$`) using the accumulated path so keys that
      // collide with branch methods (like "set") still map to the child
      // signals.
      const resolveAliasSignal = (path: string, key: string) => {
        let node: any = (tree as any).$; // root reactive alias
        if (path) {
          for (const part of path.split('.')) {
            if (!part) continue;
            node = node?.[part];
            if (!node) break;
          }
        }
        const candidate = node?.[key];
        return isSignal(candidate)
          ? (candidate as WritableSignal<unknown>)
          : undefined;
      };

      function updateSignals(
        target: Record<string, unknown>,
        source: Record<string, unknown>,
        path = ''
      ): void {
        if (!target || !source) return;

        for (const key in source) {
          if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

          const sourceValue = source[key];
          const direct = target[key];

          // Prefer the real signal if present; otherwise resolve from root alias
          const targetSignal = isSignal(direct)
            ? (direct as WritableSignal<unknown>)
            : resolveAliasSignal(path, key);

          if (targetSignal) {
            targetSignal.set(sourceValue);
            continue;
          }

          if (
            sourceValue &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            direct &&
            (typeof direct === 'object' || typeof direct === 'function') &&
            !isSignal(direct)
          ) {
            updateSignals(
              direct as Record<string, unknown>,
              sourceValue as Record<string, unknown>,
              path ? `${path}.${key}` : key
            );
          }
        }
      }

      updateSignals(
        tree.state as Record<string, unknown>,
        restoredData as Record<string, unknown>
      );
    };

    // Encode/decode helpers that work on already-unwrapped plain data
    function encodeSpecials(v: unknown, preserveTypes: boolean): unknown {
      if (!preserveTypes) return v;
      if (v === undefined) return { [TYPE_MARKERS.UNDEFINED]: true };
      if (typeof v === 'number') {
        if (Number.isNaN(v)) return { [TYPE_MARKERS.NAN]: true };
        if (v === Infinity) return { [TYPE_MARKERS.INFINITY]: true };
        if (v === -Infinity) return { [TYPE_MARKERS.NEG_INFINITY]: true };
        return v;
      }
      if (typeof v === 'bigint') return { [TYPE_MARKERS.BIGINT]: String(v) };
      if (typeof v === 'symbol') return { [TYPE_MARKERS.SYMBOL]: String(v) };

      if (v instanceof Date) return { [TYPE_MARKERS.DATE]: v.toISOString() };
      if (v instanceof RegExp)
        return {
          [TYPE_MARKERS.REGEXP]: { source: v.source, flags: v.flags },
        };
      if (v instanceof Map)
        return { [TYPE_MARKERS.MAP]: Array.from(v.entries()) };
      if (v instanceof Set)
        return { [TYPE_MARKERS.SET]: Array.from(v.values()) };

      if (Array.isArray(v))
        return v.map((x) => encodeSpecials(x, preserveTypes));
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>))
          out[k] = encodeSpecials(val, preserveTypes);
        return out;
      }
      return v;
    }

    function decodeSpecials(v: unknown): unknown {
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) return (v as unknown[]).map(decodeSpecials);
      if (typeof v !== 'object') return v;
      const o = v as Record<string, unknown>;
      if (TYPE_MARKERS.UNDEFINED in o) return undefined;
      if (TYPE_MARKERS.NAN in o) return NaN;
      if (TYPE_MARKERS.INFINITY in o) return Infinity;
      if (TYPE_MARKERS.NEG_INFINITY in o) return -Infinity;
      if (TYPE_MARKERS.BIGINT in o)
        return BigInt(String(o[TYPE_MARKERS.BIGINT]));
      if (TYPE_MARKERS.SYMBOL in o)
        return Symbol.for(String(o[TYPE_MARKERS.SYMBOL]));
      if (TYPE_MARKERS.DATE in o) return new Date(String(o[TYPE_MARKERS.DATE]));
      if (TYPE_MARKERS.REGEXP in o) {
        const r = o[TYPE_MARKERS.REGEXP] as { source: string; flags: string };
        return new RegExp(r.source, r.flags);
      }
      if (TYPE_MARKERS.MAP in o)
        return new Map(o[TYPE_MARKERS.MAP] as Array<[unknown, unknown]>);
      if (TYPE_MARKERS.SET in o)
        return new Set(o[TYPE_MARKERS.SET] as unknown[]);

      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(o)) out[k] = decodeSpecials(val);
      return out;
    }

    /**
     * Serialize to JSON string
     */
    enhanced.serialize = (config?: SerializationConfig): string => {
      const fullConfig: InternalSerializationConfig = {
        ...DEFAULT_CONFIG,
        ...defaultConfig,
        ...config,
      };

      // Use a safe local unwrap to avoid accidental dropping of keys like
      // 'set' which may collide with branch helpers; let encodeSpecials
      // handle special type markers.
      const raw = unwrapObjectSafely(
        tree.state,
        new WeakSet<object>(),
        0,
        fullConfig.maxDepth,
        fullConfig.preserveTypes
      );
      const state = encodeSpecials(raw, fullConfig.preserveTypes) as any;
      // DEBUG: inspect keys to diagnose missing Set property
      try {
        // eslint-disable-next-line no-console
        console.debug(
          '[serialization-debug] pre-serialize state keys:',
          Object.keys(state || {})
        );
        // eslint-disable-next-line no-console
        console.debug(
          '[serialization-debug] pre-serialize state.set type:',
          typeof (state || {}).set
        );
      } catch {
        /* ignore */
      }

      // Detect circular references if needed
      const circularPaths = fullConfig.handleCircular
        ? detectCircularReferences(state)
        : [];

      // Prepare data
      const data: SerializedState<T> = {
        data: state,
      };

      // Build a compact nodeMap: record paths that represent branch nodes
      // (objects with set/update) or a root-as-signal marker ('r'). This
      // helps deterministic deserialization without guessing by name.
      try {
        const nodeMap: Record<string, 'b' | 'r'> = {};

        // Root marker: if tree.state is a signal-like root (array mode), mark root
        try {
          const rootAlias = (tree as any).$;
          if (rootAlias && typeof rootAlias.set === 'function') {
            nodeMap[''] = 'r';
          }
        } catch {
          /* ignore */
        }

        const walk = (obj: unknown, path = '') => {
          if (!obj || (typeof obj !== 'object' && typeof obj !== 'function'))
            return;

          const maybe = obj as Record<string, unknown>;

          // Mark branch nodes when they have own helper properties
          if (
            (Object.prototype.hasOwnProperty.call(maybe, 'set') &&
              typeof maybe['set'] === 'function') ||
            (Object.prototype.hasOwnProperty.call(maybe, 'update') &&
              typeof maybe['update'] === 'function')
          ) {
            if (!(path in nodeMap)) nodeMap[path] = 'b';
          }

          for (const [k, v] of Object.entries(maybe)) {
            if (k === 'set' || k === 'update') continue;
            const childPath = path ? `${path}.${k}` : k;
            walk(v, childPath);
          }
        };

        // Start walking from the tree state
        walk(tree.state as Record<string, unknown>);
      } catch {
        // Do not block serialization on nodeMap errors
      }

      // Add metadata if requested
      if (fullConfig.includeMetadata) {
        data.metadata = {
          timestamp: Date.now(),
          version: '1.0.0',
          ...(circularPaths.length > 0 && { circularRefs: circularPaths }),
        };
      }

      // Serialize with custom replacer
      const replacer = createReplacer(fullConfig);
      const json = JSON.stringify(data, replacer, 2);
      // Extra debug: if JSON contains MAP or SET markers, print compact preview
      try {
        if (
          json &&
          (json.includes(TYPE_MARKERS.MAP) || json.includes(TYPE_MARKERS.SET))
        ) {
          // eslint-disable-next-line no-console
          console.debug(
            '[serialization-debug] JSON preview for MAP/SET:',
            json
          );
        }
      } catch {
        /* ignore */
      }
      // DEBUG: log when Set marker present to diagnose test failures
      try {
        if (json && json.includes(TYPE_MARKERS.SET)) {
          // eslint-disable-next-line no-console
          console.debug(
            '[serialization-debug] JSON contains SET marker:',
            json
          );
        }
      } catch {
        /* ignore */
      }
      return json;
    };

    /**
     * Deserialize from JSON string
     */
    enhanced.deserialize = (
      json: string,
      config?: SerializationConfig
    ): void => {
      const fullConfig: InternalSerializationConfig = {
        ...DEFAULT_CONFIG,
        ...defaultConfig,
        ...config,
      };

      try {
        // Parse with simple JSON.parse (no custom reviver)
        const parsed: SerializedState<any> = JSON.parse(json);

        // Extract data and metadata
        const { data, metadata } = parsed;

        // Resolve circular references if present
        if (metadata?.circularRefs && fullConfig.handleCircular) {
          resolveCircularReferences(data, metadata.circularRefs);
        }

        // Apply parsed data to the tree; fromJSON will handle type restoration
        enhanced.fromJSON(data as any, metadata as any);

        // Log restoration if in debug mode
        if (
          (tree as { __config?: { debugMode?: boolean } }).__config?.debugMode
        ) {
          console.log('[SignalTree] State restored from serialized data', {
            timestamp: metadata?.timestamp,
            version: metadata?.version,
          });
        }
      } catch (error) {
        console.error('[SignalTree] Failed to deserialize:', error);
        throw new Error(
          `Failed to deserialize SignalTree state: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    };

    /**
     * Create a snapshot
     */
    enhanced.snapshot = (): SerializedState<any> => {
      const state = enhanced.toJSON();
      const circularPaths = detectCircularReferences(state);

      return {
        data: JSON.parse(JSON.stringify(state)), // Deep clone
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
          ...(circularPaths.length > 0 && { circularRefs: circularPaths }),
        },
      };
    };

    /**
     * Restore from snapshot
     */
    enhanced.restore = (snapshot: SerializedState<any>): void => {
      const { data, metadata } = snapshot;

      // Resolve circular references if present
      if (metadata?.circularRefs) {
        resolveCircularReferences(data, metadata.circularRefs);
      }

      enhanced.fromJSON(data as any, metadata as any);
    };

    return enhanced;
  };

  (
    enhancer as EnhancerWithMeta<SignalTree<T>, SerializableSignalTree<T>>
  ).metadata = {
    name: 'serialization',
  };
  return enhancer as EnhancerWithMeta<SignalTree<T>, SerializableSignalTree<T>>;
}

/**
 * Convenience function to enable serialization with defaults
 */
export function enableSerialization<T extends Record<string, unknown> = any>() {
  return withSerialization<T>({
    includeMetadata: true,
    preserveTypes: true,
    handleCircular: true,
  });
}

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig extends SerializationConfig {
  /**
   * Storage key to use
   */
  key: string;

  /**
   * Storage adapter (defaults to localStorage)
   */
  storage?: StorageAdapter;

  /**
   * Whether to auto-save on every update
   * @default true
   */
  autoSave?: boolean;

  /**
   * Debounce delay for auto-save in ms
   * @default 1000
   */
  debounceMs?: number;

  /**
   * Whether to auto-load on creation
   * @default true
   */
  autoLoad?: boolean;
}

/**
 * Adds persistence capabilities to a SerializableSignalTree
 */
export function withPersistence<T extends Record<string, unknown> = any>(
  config: PersistenceConfig
): EnhancerWithMeta<
  SignalTree<T>,
  SerializableSignalTree<T> & PersistenceMethods
> {
  const {
    key,
    storage = typeof window !== 'undefined' ? window.localStorage : undefined,
    autoSave = true,
    debounceMs = 1000,
    autoLoad = true,
    ...serializationConfig
  } = config;

  if (!storage) {
    throw new Error(
      'No storage adapter available. Provide a storage adapter in the config.'
    );
  }

  // Narrow storage for TypeScript and linter: from here on it's defined.
  const storageAdapter: StorageAdapter = storage;

  function enhancer(tree: SignalTree<T>) {
    // First enhance with serialization
    const serializable = withSerialization<T>(serializationConfig)(tree);

    // Add persistence methods
    const enhanced = serializable as SerializableSignalTree<T> &
      PersistenceMethods;

    /**
     * Save current state to storage
     */
    enhanced.save = async (): Promise<void> => {
      try {
        const serialized = enhanced.serialize(serializationConfig);
        await Promise.resolve(storageAdapter.setItem(key, serialized));

        if ((tree as SignalTreeWithConfig).__config?.debugMode) {
          console.log(`[SignalTree] State saved to storage key: ${key}`);
        }
      } catch (error) {
        console.error('[SignalTree] Failed to save state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    /**
     * Load state from storage
     */
    enhanced.load = async (): Promise<void> => {
      try {
        const data = await Promise.resolve(storageAdapter.getItem(key));
        if (data) {
          enhanced.deserialize(data, serializationConfig);

          if ((tree as SignalTreeWithConfig).__config?.debugMode) {
            console.log(`[SignalTree] State loaded from storage key: ${key}`);
          }
        }
      } catch (error) {
        console.error('[SignalTree] Failed to load state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    /**
     * Clear state from storage
     */
    enhanced.clear = async (): Promise<void> => {
      try {
        await Promise.resolve(storageAdapter.removeItem(key));

        if ((tree as SignalTreeWithConfig).__config?.debugMode) {
          console.log(`[SignalTree] State cleared from storage key: ${key}`);
        }
      } catch (error) {
        console.error('[SignalTree] Failed to clear state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    // Auto-load on creation if enabled
    if (autoLoad) {
      // Use setTimeout to avoid blocking initialization and timing issues
      setTimeout(() => {
        enhanced.load().catch((error) => {
          console.warn('[SignalTree] Auto-load failed:', error);
        });
      }, 0);
    }

    // Auto-save on updates if enabled
    if (autoSave) {
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;

      // Hook into state changes to trigger auto-save
      const triggerAutoSave = () => {
        // Debounce saves
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        saveTimeout = setTimeout(() => {
          enhanced.save().catch((error) => {
            console.error('[SignalTree] Auto-save failed:', error);
          });
        }, debounceMs);
      };

      // Watch for any signal changes in the tree
      const watchSignals = (obj: Record<string, unknown>, path = ''): void => {
        if (!obj || typeof obj !== 'object') return;

        for (const [key, value] of Object.entries(obj)) {
          if (isSignal(value)) {
            // Create an effect to watch this signal
            const signal = value as Signal<unknown>;
            let previousValue = signal();

            // Periodically check for changes (this is a simplified approach)
            // In a real implementation, you'd want to use Angular's effect() or similar
            const checkForChanges = () => {
              const currentValue = signal();
              if (currentValue !== previousValue) {
                previousValue = currentValue;
                triggerAutoSave();
              }
              setTimeout(checkForChanges, 50); // Check every 50ms
            };

            setTimeout(checkForChanges, 0);
          } else if (value && typeof value === 'object') {
            watchSignals(
              value as Record<string, unknown>,
              path ? `${path}.${key}` : key
            );
          }
        }
      };

      // Start watching signals
      watchSignals(tree.state as Record<string, unknown>);

      // Store cleanup function for testing
      (enhanced as EnhancedSignalTree).__flushAutoSave = () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = undefined;
          return enhanced.save();
        }
        return Promise.resolve();
      };
    }

    return enhanced;
  }

  (
    enhancer as EnhancerWithMeta<
      SignalTree<T>,
      SerializableSignalTree<T> & PersistenceMethods
    >
  ).metadata = { name: 'persistence' };
  return enhancer as EnhancerWithMeta<
    SignalTree<T>,
    SerializableSignalTree<T> & PersistenceMethods
  >;
}

/**
 * Create a custom storage adapter
 */
export function createStorageAdapter(
  getItem: (key: string) => string | null | Promise<string | null>,
  setItem: (key: string, value: string) => void | Promise<void>,
  removeItem: (key: string) => void | Promise<void>
): StorageAdapter {
  return { getItem, setItem, removeItem };
}

/**
 * IndexedDB storage adapter for large state trees
 */
export function createIndexedDBAdapter(
  dbName = 'SignalTreeDB',
  storeName = 'states'
): StorageAdapter {
  let db: IDBDatabase | null = null;

  const openDB = async (): Promise<IDBDatabase> => {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };
    });
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    },

    async setItem(key: string, value: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async removeItem(key: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}

// Type-only exports (none)

/**
 * Helpers to apply enhancers with explicit typing to avoid depending on
 * complex `.with()` overload inference in tests and tooling.
 */
export function applySerialization<T extends Record<string, unknown>>(
  tree: SignalTree<T>
): SerializableSignalTree<T> {
  return withSerialization<T>()(tree) as SerializableSignalTree<T>;
}

export function applyPersistence<T extends Record<string, unknown>>(
  tree: SignalTree<T>,
  cfg: PersistenceConfig
): SerializableSignalTree<T> & PersistenceMethods {
  return withPersistence<T>(cfg)(tree) as SerializableSignalTree<T> &
    PersistenceMethods;
}

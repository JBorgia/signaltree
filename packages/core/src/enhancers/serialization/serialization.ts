import type { ISignalTree as ISignalTree } from '../../lib/types';
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

export interface SerializableSignalTree<T> extends ISignalTree<T> {
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

// Minimal runtime stubs so module resolution works during tests.
export function withSerialization(
  defaultConfig?: SerializationConfig
): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & SerializableSignalTree<any> {
  return (tree: any) => tree as any;
}

export function enableSerialization() {
  return <Tree extends ISignalTree<any>>(tree: Tree) => tree as any;
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
  return <Tree extends ISignalTree<any>>(tree: Tree) => tree as any;
}

export function createStorageAdapter(
  getItem: (key: string) => string | null | Promise<string | null>,
  setItem: (key: string, value: string) => void | Promise<void>,
  removeItem: (key: string) => void | Promise<void>
) {
  return { getItem, setItem, removeItem } as StorageAdapter;
}

export function createIndexedDBAdapter(dbName?: string, storeName?: string) {
  return createStorageAdapter(
    () => null,
    () => undefined,
    () => undefined
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

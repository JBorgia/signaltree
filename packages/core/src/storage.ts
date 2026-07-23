/**
 * @signaltree/core/storage
 *
 * Custom storage adapters for the serialization and persistence enhancers.
 * Import from '@signaltree/core/storage' to avoid bloating the main bundle.
 */
export {
  createStorageAdapter,
  createIndexedDBAdapter,
} from './enhancers/serialization/storage-adapters';

export type { StorageAdapter } from './enhancers/serialization/storage-adapters';

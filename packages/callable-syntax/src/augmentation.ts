/**
 * TypeScript module augmentation for callable syntax support
 * Since NodeAccessor already has callable signatures, we just need to ensure
 * the types are properly imported and available.
 */
import type {} from '@signaltree/core';

// The existing NodeAccessor<T> interface in @signaltree/core already supports:
// - (): T                           // getter
// - (value: T): void                // set
// - (updater: (current: T) => T): void  // update

// This file ensures the types are available when imported
// The build-time transformer will handle the actual transformation

export {};

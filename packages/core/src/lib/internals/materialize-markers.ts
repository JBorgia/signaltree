import { isSignal } from '@angular/core';

import { getPathNotifier, PathNotifier } from '../path-notifier';
import { isNodeAccessor } from '../utils';

/**
 * Unified Marker Processing
 *
 * Processes all markers in a signal tree during finalization.
 * Markers are processed in a single pass, converting placeholder objects
 * into their materialized signal forms.
 *
 * Processing order (in finalize()):
 * 1. materializeMarkers() - entityMap, status, stored markers → signals
 * 2. applyDerivedFactories() - derived factories → computed signals
 *
 * TREE-SHAKING: This module has NO side effects at import time.
 * Built-in markers (entityMap, status, stored) self-register when
 * their factory functions are first called. If you never use a marker,
 * its code is completely tree-shaken from your bundle.
 *
 * @internal
 */

// =============================================================================
// MARKER PROCESSOR REGISTRY
// =============================================================================

interface MarkerProcessor {
  check: (value: unknown) => boolean;
  create: (marker: unknown, notifier: PathNotifier, path: string) => unknown;
}

/**
 * Registry of marker processors.
 * Order matters: first match wins.
 */
const MARKER_PROCESSORS: MarkerProcessor[] = [];

/**
 * Check if a value matches any registered marker processor.
 * Used by createSignalStore to preserve markers for later materialization.
 *
 * This enables user-defined markers registered via registerMarkerProcessor()
 * to be preserved during tree creation and materialized later.
 *
 * @param value - The value to check
 * @returns true if the value is a registered marker
 */
export function isRegisteredMarker(value: unknown): boolean {
  // Early exit for non-objects
  if (value === null || typeof value !== 'object') {
    return false;
  }

  // Fast path: most objects don't have Symbol keys
  // Custom markers typically use Symbols for identification
  if (Object.getOwnPropertySymbols(value).length === 0) {
    return false;
  }

  for (const processor of MARKER_PROCESSORS) {
    if (processor.check(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a value has Symbol keys but isn't a registered marker.
 * Used for dev-mode warnings about potential registration timing issues.
 *
 * @param value - The value to check
 * @returns true if value has Symbols but no matching processor
 * @internal
 */
export function hasUnregisteredSymbolKeys(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length === 0) {
    return false;
  }
  // Has Symbols but no registered processor matched
  return !isRegisteredMarker(value);
}

/**
 * Register a marker processor.
 *
 * Built-in markers call this automatically when their factory is first used.
 * Custom markers should call this at app startup, BEFORE creating trees.
 *
 * @param check - Type guard function to identify the marker
 * @param create - Factory function to create the materialized signal
 *
 * @example
 * ```typescript
 * // Custom marker registration (call before creating trees)
 * registerMarkerProcessor(isCounterMarker, createCounterSignal);
 * ```
 */
export function registerMarkerProcessor<T, R>(
  check: (value: unknown) => value is T,
  create: (marker: T, notifier: PathNotifier, path: string) => R
): void {
  // Prevent duplicate registration (same check function)
  const alreadyRegistered = MARKER_PROCESSORS.some((p) => p.check === check);
  if (alreadyRegistered) {
    return;
  }

  MARKER_PROCESSORS.push({
    check,
    create: create as (
      marker: unknown,
      notifier: PathNotifier,
      path: string
    ) => unknown,
  });
}

// =============================================================================
// MATERIALIZATION
// =============================================================================

/**
 * Process all markers in a tree node.
 * Walks recursively, replacing markers with materialized signals.
 *
 * @param node - The tree node to process (usually tree.$ or tree.state)
 * @param notifier - PathNotifier for entity signals
 * @param path - Current path for nested processing
 */
export function materializeMarkers(
  node: unknown,
  notifier?: PathNotifier,
  path: string[] = []
): void {
  if (node == null) return;
  if (typeof node !== 'object' && typeof node !== 'function') return;
  if (isSignal(node)) return;

  // Handle NodeAccessors (functions with properties)
  const isAccessor = typeof node === 'function' && isNodeAccessor(node);
  if (typeof node === 'function' && !isAccessor) return;

  // Lazy-init notifier only if needed
  const getNotifier = (): PathNotifier => {
    if (!notifier) {
      notifier = getPathNotifier();
    }
    return notifier;
  };

  const keys = Object.keys(node);

  for (const key of keys) {
    const value = (node as Record<string, unknown>)[key];
    const currentPath = [...path, key];
    const pathString = currentPath.join('.');

    // Check each registered marker processor
    let processed = false;
    for (const processor of MARKER_PROCESSORS) {
      if (processor.check(value)) {
        try {
          const materialized = processor.create(
            value,
            getNotifier(),
            pathString
          );
          (node as Record<string, unknown>)[key] = materialized;
          processed = true;
        } catch (err) {
          if (typeof ngDevMode === 'undefined' || ngDevMode) {
            console.error(
              `SignalTree: Failed to materialize marker at "${pathString}"`,
              err
            );
          }
        }
        break;
      }
    }

    // Recurse into unprocessed objects/accessors
    if (!processed && value != null) {
      if (isNodeAccessor(value)) {
        // NodeAccessor - recurse to find nested markers
        materializeMarkers(value, notifier, currentPath);
      } else if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isSignal(value)
      ) {
        // Plain object - recurse
        materializeMarkers(value, notifier, currentPath);
      }
    }
  }
}

/**
 * Check if a tree has any markers that need processing.
 * Used for optimization - skip materialization if no markers present.
 */
export function hasMarkers(
  node: unknown,
  visited = new WeakSet<object>()
): boolean {
  if (node == null) return false;
  if (typeof node !== 'object' && typeof node !== 'function') return false;
  if (isSignal(node)) return false;

  // Prevent infinite loops
  if (typeof node === 'object' && visited.has(node)) return false;
  if (typeof node === 'object') visited.add(node);

  const keys = Object.keys(node);

  for (const key of keys) {
    const value = (node as Record<string, unknown>)[key];

    // Check all registered processors
    for (const processor of MARKER_PROCESSORS) {
      if (processor.check(value)) {
        return true;
      }
    }

    // Recurse into nested objects/accessors
    if (
      value != null &&
      (typeof value === 'object' || typeof value === 'function')
    ) {
      if (hasMarkers(value, visited)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Exposed for testing tree-shaking behavior.
 * DO NOT USE IN PRODUCTION CODE.
 *
 * @internal
 */
export const MARKER_PROCESSORS_FOR_TESTING = MARKER_PROCESSORS;

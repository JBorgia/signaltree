import { isSignal } from '@angular/core';

import { createEntitySignal } from '../entity-signal';
import { createStatusSignal, isStatusMarker, StatusMarker } from '../markers/status';
import { createStoredSignal, isStoredMarker, StoredMarker } from '../markers/stored';
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
 * This ensures entity methods, status signals, and stored signals are
 * available when derived factories execute.
 *
 * @internal
 */

import type { EntityConfig, EntityMapMarker } from '../types';

// =============================================================================
// ENTITY MAP MARKER (inline - matches existing implementation)
// =============================================================================

type Marker = EntityMapMarker<Record<string, unknown>, string | number> & {
  __entityMapConfig?: EntityConfig<Record<string, unknown>, string | number>;
};

function isEntityMapMarker(value: unknown): value is Marker {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['__isEntityMap'] === true
  );
}

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
 * Register a custom marker processor.
 * For advanced use cases and extensions.
 *
 * @param check - Type guard function to identify the marker
 * @param create - Factory function to create the materialized signal
 */
export function registerMarkerProcessor<T, R>(
  check: (value: unknown) => value is T,
  create: (marker: T, notifier: PathNotifier, path: string) => R
): void {
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
// CORE MARKER PROCESSORS (built-in)
// =============================================================================

// EntityMap processor
registerMarkerProcessor<Marker, unknown>(
  isEntityMapMarker,
  (marker, notifier, path) => {
    const cfg = marker.__entityMapConfig ?? {};
    return createEntitySignal(
      cfg as EntityConfig<Record<string, unknown>, string | number>,
      notifier,
      path
    );
  }
);

// Status processor
registerMarkerProcessor<StatusMarker, unknown>(isStatusMarker, (marker) =>
  createStatusSignal(marker)
);

// Stored processor
registerMarkerProcessor<StoredMarker<unknown>, unknown>(
  isStoredMarker,
  (marker) => createStoredSignal(marker)
);

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

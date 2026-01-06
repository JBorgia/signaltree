/**
 * Merge Derived State into SignalTree
 *
 * Handles the merging of derived state definitions (containing `derived()` markers)
 * into the processed source state tree.
 */
// =============================================================================
// TYPES
// =============================================================================

/** Record with string keys and unknown values */
type AnyRecord = Record<string, unknown>;

// =============================================================================
import { computed, isSignal, Signal } from '@angular/core';

import { isDerivedMarker } from '../markers/derived';

// TYPE GUARDS
// =============================================================================

/**
 * Checks if a value is an Angular signal.
 * Uses the official isSignal utility from @angular/core.
 */
function isSignalLike(value: unknown): value is Signal<unknown> {
  return isSignal(value);
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Ensures a path exists in the tree and returns the target object.
 * Creates empty objects along the path if they don't exist.
 */
function ensurePathAndGetTarget($: AnyRecord, path: string): AnyRecord {
  if (!path) return $;

  const parts = path.split('.');
  let current: AnyRecord = $;

  for (const part of parts) {
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as AnyRecord;
  }

  return current;
}

// =============================================================================
// MAIN MERGE FUNCTION
// =============================================================================

/**
 * Merges derived state definitions into the processed source state.
 *
 * Processing rules:
 * - DerivedMarker → computed signal (lazy - factory runs on first read)
 * - Nested objects → recursive merge into existing structure
 * - Collisions → derived signals overwrite source signals with warning
 *
 * @param $ - The processed source state tree
 * @param derivedDef - The derived state definition object
 * @param path - Current path for error messages (internal use)
 *
 * @example
 * ```typescript
 * const $ = processSourceState({ count: 0, selected: { id: null } });
 *
 * mergeDerivedState($, {
 *   doubled: derived(() => $.count() * 2),
 *   selected: {
 *     isValid: derived(() => $.selected.id() !== null)
 *   }
 * });
 *
 * // Result: $ now has $.doubled (computed) and $.selected.isValid (computed)
 * ```
 */
export function mergeDerivedState(
  $: AnyRecord,
  derivedDef: unknown,
  path = ''
): void {
  if (!derivedDef || typeof derivedDef !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(derivedDef as AnyRecord)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (isDerivedMarker(value)) {
      // Convert derived marker to computed signal
      const target = ensurePathAndGetTarget($, path);

      // Check for collision with existing signal
      if (key in target && isSignalLike(target[key])) {
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
          console.warn(
            `SignalTree: Derived "${currentPath}" overwrites source signal. ` +
              `Consider using a different key to avoid confusion.`
          );
        }
      }

      // Create computed signal - factory is lazy (won't execute until read)
      target[key] = computed(value.factory);
    } else if (isSignalLike(value)) {
      // Already a signal (computed, signal, etc.) - add directly
      const target = ensurePathAndGetTarget($, path);

      // Check for collision with existing signal
      if (key in target && isSignalLike(target[key])) {
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
          console.warn(
            `SignalTree: Derived signal "${currentPath}" overwrites source signal. ` +
              `Consider using a different key to avoid confusion.`
          );
        }
      }

      target[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Nested derived object - merge recursively
      const target = ensurePathAndGetTarget($, path);

      // Ensure nested object exists in target
      if (!(key in target)) {
        target[key] = {};
      } else if (isSignalLike(target[key])) {
        // Target is a signal - can't merge object into it
        throw new Error(
          `SignalTree: Cannot merge derived object into "${currentPath}" ` +
            `because source is a signal. Either make source an object or use a different key.`
        );
      }

      // Recurse into nested object
      mergeDerivedState($, value, currentPath);
    }
    // Ignore other values (shouldn't happen with valid derived definitions)
  }
}

/**
 * Applies multiple derived factories in sequence.
 * Each factory receives the $ with all previous derived merged in.
 *
 * @param $ - The processed source state tree
 * @param factories - Array of derived factory functions
 */
export function applyDerivedFactories(
  $: AnyRecord,
  factories: Array<($: AnyRecord) => object>
): void {
  for (const factory of factories) {
    const derivedDef = factory($);
    mergeDerivedState($, derivedDef);
  }
}

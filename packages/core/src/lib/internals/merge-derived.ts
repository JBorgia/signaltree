import { computed, isSignal, Signal } from '@angular/core';

import { isDerivedMarker } from '../markers/derived';

/**
 * Merge Derived State into SignalTree
 *
 * This module implements the **deep merge** semantics for derived state definitions.
 * When derived state is added to a SignalTree, it is merged INTO the existing tree
 * structure rather than replacing it. This preserves source properties while adding
 * new derived computed signals.
 *
 * ## Deep Merge Behavior
 *
 * When you define a derived namespace at the same path as a source namespace:
 * - All source properties are **preserved** (signals, entityMaps, nested objects)
 * - Derived markers become computed signals at the target path
 * - Only conflicting keys trigger overwrites (with dev warning)
 *
 * ## Example
 *
 * ```typescript
 * const tree = signalTree({
 *   tickets: {
 *     entities: entityMap<Ticket, number>(),
 *     activeId: null,
 *   }
 * }).derived(($) => ({
 *   tickets: {
 *     // This EXTENDS tickets, doesn't replace it
 *     active: derived(() => $.tickets.entities.byId($.tickets.activeId())?.())
 *   }
 * }));
 *
 * // After merge, $.tickets contains:
 * // - entities (preserved from source)
 * // - activeId (preserved from source)
 * // - active (added from derived)
 * ```
 *
 * This enables patterns like adding computed selectors to namespaces that contain
 * entityMaps without losing access to entity methods like `upsertOne()`, `all()`, etc.
 */
// =============================================================================
// TYPES
// =============================================================================

/** Record with string keys and unknown values */
type AnyRecord = Record<string, unknown>;

// =============================================================================
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
 *
 * **Important for deep merge:** This function navigates to existing objects
 * rather than replacing them. If `$.tickets` already exists with properties,
 * calling `ensurePathAndGetTarget($, 'tickets')` returns that existing object,
 * allowing new properties to be added alongside existing ones.
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
 * ## Processing Rules
 *
 * - **DerivedMarker** → computed signal (lazy - factory runs on first read)
 * - **Nested objects** → recursive merge into existing structure (DEEP MERGE)
 * - **Collisions** → derived signals overwrite source signals with warning
 *
 * ## Deep Merge Semantics
 *
 * When a derived definition contains a nested object at a path that already
 * exists in the source tree, this function **recursively merges** into the
 * existing structure rather than replacing it. This is the key to preserving
 * source properties (like entityMap methods) when adding derived state.
 *
 * The merge happens because:
 * 1. `ensurePathAndGetTarget()` returns the EXISTING object at that path
 * 2. New derived properties are added to that existing object
 * 3. Source properties remain untouched unless explicitly overwritten
 *
 * @param $ - The processed source state tree
 * @param derivedDef - The derived state definition object
 * @param path - Current path for error messages (internal use)
 *
 * @example
 * ```typescript
 * // Source tree has: $.tickets.entities (EntitySignal), $.tickets.activeId (signal)
 * const $ = processSourceState({
 *   tickets: {
 *     entities: entityMap<Ticket>(),
 *     activeId: null
 *   }
 * });
 *
 * // Merge adds $.tickets.active while preserving $.tickets.entities
 * mergeDerivedState($, {
 *   tickets: {
 *     active: derived(() => $.tickets.entities.byId($.tickets.activeId())?.())
 *   }
 * });
 *
 * // Result: $.tickets now has entities, activeId, AND active
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
      // =========================================================================
      // DEEP MERGE: Nested derived object - merge into existing structure
      // =========================================================================
      // This is where the magic happens. Instead of replacing the existing
      // namespace, we navigate to it and recursively add derived properties.
      //
      // Example: If source has $.tickets.entities and derived defines
      // { tickets: { active: derived(...) } }, we DON'T replace $.tickets.
      // Instead, we get the existing $.tickets object and add 'active' to it.
      // =========================================================================
      const target = ensurePathAndGetTarget($, path);

      // Ensure nested object exists in target (create if new path)
      if (!(key in target)) {
        target[key] = {};
      } else if (isSignalLike(target[key])) {
        // Target is a signal - can't merge object into it
        throw new Error(
          `SignalTree: Cannot merge derived object into "${currentPath}" ` +
            `because source is a signal. Either make source an object or use a different key.`
        );
      }
      // NOTE: If target[key] is an existing object (NodeAccessor, plain object),
      // we keep it and recursively merge INTO it - this preserves all source properties!

      // Recurse into nested object - this preserves existing properties
      // while adding new derived signals. The key insight is that target[key]
      // still references the ORIGINAL object from the source tree.
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

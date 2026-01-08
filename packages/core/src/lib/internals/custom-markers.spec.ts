import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import {
  hasUnregisteredSymbolKeys,
  isRegisteredMarker,
  materializeMarkers,
  registerMarkerProcessor,
} from './materialize-markers';

/**
 * Custom Marker Registration Tests
 *
 * Tests for registerMarkerProcessor() and custom marker handling in SignalTree.
 * This validates that user-defined markers work correctly alongside built-in markers.
 */

// =============================================================================
// TEST FIXTURES: Custom Counter Marker
// =============================================================================

const COUNTER_MARKER = Symbol('COUNTER_MARKER');

interface CounterMarker {
  [COUNTER_MARKER]: true;
  initial: number;
  step: number;
}

interface CounterSignal {
  (): number;
  increment(): void;
  decrement(): void;
  reset(): void;
  set(value: number): void;
}

function counter(initial = 0, step = 1): CounterMarker {
  return {
    [COUNTER_MARKER]: true,
    initial,
    step,
  };
}

function isCounterMarker(value: unknown): value is CounterMarker {
  return Boolean(
    value &&
      typeof value === 'object' &&
      COUNTER_MARKER in value &&
      (value as Record<symbol, unknown>)[COUNTER_MARKER] === true
  );
}

function createCounterSignal(marker: CounterMarker): CounterSignal {
  const valueSignal = signal(marker.initial);

  const counterSignal = (() => valueSignal()) as CounterSignal;
  counterSignal.increment = () => valueSignal.update((v) => v + marker.step);
  counterSignal.decrement = () => valueSignal.update((v) => v - marker.step);
  counterSignal.reset = () => valueSignal.set(marker.initial);
  counterSignal.set = (value: number) => valueSignal.set(value);

  return counterSignal;
}

// =============================================================================
// TEST FIXTURES: Custom Selection Marker
// =============================================================================

const SELECTION_MARKER = Symbol('SELECTION_MARKER');

interface SelectionMarker<T> {
  [SELECTION_MARKER]: true;
  _phantom?: T;
}

interface SelectionSignal<T> {
  (): Set<T>;
  count: () => number;
  hasSelection: () => boolean;
  toggle(item: T): void;
  clear(): void;
}

function selection<T>(): SelectionMarker<T> {
  return { [SELECTION_MARKER]: true };
}

function isSelectionMarker(value: unknown): value is SelectionMarker<unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      SELECTION_MARKER in value &&
      (value as Record<symbol, unknown>)[SELECTION_MARKER] === true
  );
}

function createSelectionSignal<T>(): SelectionSignal<T> {
  const selectedSignal = signal<Set<T>>(new Set());

  const selectionSignal = (() => selectedSignal()) as SelectionSignal<T>;

  selectionSignal.count = () => selectedSignal().size;
  selectionSignal.hasSelection = () => selectedSignal().size > 0;

  selectionSignal.toggle = (item: T) => {
    selectedSignal.update((set) => {
      const next = new Set(set);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  selectionSignal.clear = () => selectedSignal.set(new Set());

  return selectionSignal;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Custom Marker Registration', () => {
  // Track console.warn calls
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* empty */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('registerMarkerProcessor()', () => {
    it('should register a custom marker processor', () => {
      // Register before checking
      registerMarkerProcessor(isCounterMarker, createCounterSignal);

      // Now isRegisteredMarker should recognize it
      expect(isRegisteredMarker(counter())).toBe(true);
      expect(isRegisteredMarker(counter(10, 5))).toBe(true);
    });

    it('should allow multiple marker processors', () => {
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
      registerMarkerProcessor(isSelectionMarker, createSelectionSignal);

      expect(isRegisteredMarker(counter())).toBe(true);
      expect(isRegisteredMarker(selection())).toBe(true);
    });
  });

  describe('isRegisteredMarker()', () => {
    beforeEach(() => {
      // Ensure processors are registered
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
      registerMarkerProcessor(isSelectionMarker, createSelectionSignal);
    });

    it('should return true for registered markers', () => {
      expect(isRegisteredMarker(counter())).toBe(true);
      expect(isRegisteredMarker(selection())).toBe(true);
    });

    it('should return false for primitives', () => {
      expect(isRegisteredMarker(null)).toBe(false);
      expect(isRegisteredMarker(undefined)).toBe(false);
      expect(isRegisteredMarker(42)).toBe(false);
      expect(isRegisteredMarker('string')).toBe(false);
      expect(isRegisteredMarker(true)).toBe(false);
    });

    it('should return false for plain objects without Symbols', () => {
      expect(isRegisteredMarker({})).toBe(false);
      expect(isRegisteredMarker({ foo: 'bar' })).toBe(false);
      expect(isRegisteredMarker({ count: 0 })).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isRegisteredMarker([])).toBe(false);
      expect(isRegisteredMarker([1, 2, 3])).toBe(false);
    });

    it('should return false for Date, Map, Set', () => {
      expect(isRegisteredMarker(new Date())).toBe(false);
      expect(isRegisteredMarker(new Map())).toBe(false);
      expect(isRegisteredMarker(new Set())).toBe(false);
    });
  });

  describe('hasUnregisteredSymbolKeys()', () => {
    beforeEach(() => {
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
    });

    it('should return false for registered markers', () => {
      expect(hasUnregisteredSymbolKeys(counter())).toBe(false);
    });

    it('should return true for objects with unregistered Symbols', () => {
      const UNKNOWN_SYMBOL = Symbol('UNKNOWN');
      const unknownMarker = { [UNKNOWN_SYMBOL]: true };
      expect(hasUnregisteredSymbolKeys(unknownMarker)).toBe(true);
    });

    it('should return false for objects without Symbols', () => {
      expect(hasUnregisteredSymbolKeys({})).toBe(false);
      expect(hasUnregisteredSymbolKeys({ foo: 'bar' })).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(hasUnregisteredSymbolKeys(null)).toBe(false);
      expect(hasUnregisteredSymbolKeys(undefined)).toBe(false);
      expect(hasUnregisteredSymbolKeys(42)).toBe(false);
    });
  });

  describe('materializeMarkers()', () => {
    beforeEach(() => {
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
      registerMarkerProcessor(isSelectionMarker, createSelectionSignal);
    });

    it('should materialize custom markers in a store', () => {
      // Create a mock store structure with markers
      const store = {
        clicks: counter(0, 1),
        quantity: counter(10, 5),
      };

      // Materialize
      materializeMarkers(
        store as unknown as Record<string, unknown>,
        undefined,
        []
      );

      // Check that markers were replaced with signals
      const clicks = store.clicks as unknown as CounterSignal;
      expect(typeof clicks).toBe('function');
      expect(clicks()).toBe(0);
      clicks.increment();
      expect(clicks()).toBe(1);

      const quantity = store.quantity as unknown as CounterSignal;
      expect(quantity()).toBe(10);
      quantity.increment();
      expect(quantity()).toBe(15);
    });

    it('should materialize nested markers', () => {
      const store = {
        ui: {
          counter: counter(5),
        },
      };

      materializeMarkers(
        store as unknown as Record<string, unknown>,
        undefined,
        []
      );

      const nestedCounter = (store.ui as unknown as { counter: CounterSignal })
        .counter;
      expect(nestedCounter()).toBe(5);
      nestedCounter.increment();
      expect(nestedCounter()).toBe(6);
    });

    it('should materialize selection markers', () => {
      const store = {
        selectedIds: selection<number>(),
      };

      materializeMarkers(
        store as unknown as Record<string, unknown>,
        undefined,
        []
      );

      const sel = store.selectedIds as unknown as SelectionSignal<number>;
      expect(sel()).toEqual(new Set());
      expect(sel.hasSelection()).toBe(false);

      sel.toggle(1);
      expect(sel()).toEqual(new Set([1]));
      expect(sel.count()).toBe(1);
      expect(sel.hasSelection()).toBe(true);

      sel.toggle(2);
      expect(sel()).toEqual(new Set([1, 2]));
      expect(sel.count()).toBe(2);

      sel.toggle(1);
      expect(sel()).toEqual(new Set([2]));
    });
  });

  describe('Integration with signalTree()', () => {
    beforeEach(() => {
      // Register custom markers
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
      registerMarkerProcessor(isSelectionMarker, createSelectionSignal);
    });

    it('should preserve custom markers and materialize them', () => {
      const tree = signalTree({
        clicks: counter(0),
        tasks: ['task1', 'task2'],
      });

      // The counter should be materialized
      const clicks = tree.$.clicks as unknown as CounterSignal;
      expect(typeof clicks).toBe('function');
      expect(clicks()).toBe(0);

      clicks.increment();
      expect(clicks()).toBe(1);

      clicks.increment();
      expect(clicks()).toBe(2);

      clicks.reset();
      expect(clicks()).toBe(0);
    });

    it('should work with selection markers in tree', () => {
      const tree = signalTree({
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
        selectedIds: selection<number>(),
      });

      const sel = tree.$.selectedIds as unknown as SelectionSignal<number>;
      expect(sel.hasSelection()).toBe(false);

      sel.toggle(1);
      expect(sel.count()).toBe(1);

      sel.toggle(2);
      expect(sel()).toEqual(new Set([1, 2]));
    });

    it('should work alongside regular state', () => {
      const tree = signalTree({
        counter: counter(100, 10),
        regularValue: 'hello',
        nested: {
          innerCounter: counter(0),
          innerValue: 42,
        },
      });

      // Regular state works
      expect(tree.$.regularValue()).toBe('hello');
      tree.$.regularValue.set('world');
      expect(tree.$.regularValue()).toBe('world');

      // Top-level counter works
      const topCounter = tree.$.counter as unknown as CounterSignal;
      expect(topCounter()).toBe(100);
      topCounter.increment();
      expect(topCounter()).toBe(110);

      // Nested counter works
      const innerCounter = (
        tree.$.nested as unknown as { innerCounter: CounterSignal }
      ).innerCounter;
      expect(innerCounter()).toBe(0);
      innerCounter.increment();
      expect(innerCounter()).toBe(1);

      // Nested regular value works
      expect((tree.$.nested as { innerValue: () => number }).innerValue()).toBe(
        42
      );
    });
  });

  describe('Registration Timing Edge Cases', () => {
    it('should emit dev-mode warning for unregistered Symbol objects', () => {
      const UNKNOWN_MARKER = Symbol('UNKNOWN');

      // Create tree with unregistered marker-like object
      signalTree({
        unknown: { [UNKNOWN_MARKER]: true, value: 'test' },
      });

      // Should have warned about unregistered Symbol
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'SignalTree: Object at "unknown" has Symbol keys'
        )
      );
    });

    it('should not warn for registered markers', () => {
      registerMarkerProcessor(isCounterMarker, createCounterSignal);

      signalTree({
        clicks: counter(0),
      });

      // Should not have warned
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should not warn for plain objects without Symbols', () => {
      signalTree({
        config: { theme: 'dark', fontSize: 14 },
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Symbol Key Optimization', () => {
    beforeEach(() => {
      registerMarkerProcessor(isCounterMarker, createCounterSignal);
    });

    it('should use fast path for objects without Symbol keys', () => {
      // These should all exit early without checking processors
      expect(isRegisteredMarker({})).toBe(false);
      expect(isRegisteredMarker({ a: 1, b: 2 })).toBe(false);
      expect(isRegisteredMarker({ nested: { deep: 'value' } })).toBe(false);
    });

    it('should check processors only for objects with Symbol keys', () => {
      // Only objects with Symbols should reach the processor check
      expect(isRegisteredMarker(counter())).toBe(true);

      const MY_SYMBOL = Symbol('test');
      expect(isRegisteredMarker({ [MY_SYMBOL]: true })).toBe(false); // Has Symbol but not registered
    });
  });
});

describe('Standalone Signal Factories (Alternative Pattern)', () => {
  // This tests the standalone factory pattern that doesn't require registration

  it('should work without registration', () => {
    // Standalone factories don't need registerMarkerProcessor
    const clicks = createCounterSignal({
      [COUNTER_MARKER]: true,
      initial: 0,
      step: 1,
    });

    expect(clicks()).toBe(0);
    clicks.increment();
    expect(clicks()).toBe(1);
  });

  it('should be usable alongside SignalTree', () => {
    // Standalone signals + SignalTree for regular state
    const counter = createCounterSignal({
      [COUNTER_MARKER]: true,
      initial: 0,
      step: 1,
    });
    const selection = createSelectionSignal<number>();

    const tree = signalTree({
      tasks: [
        { id: 1, name: 'Task A' },
        { id: 2, name: 'Task B' },
      ],
      userName: 'Guest',
    });

    // Use standalone signals
    counter.increment();
    counter.increment();
    expect(counter()).toBe(2);

    selection.toggle(1);
    selection.toggle(2);
    expect(selection()).toEqual(new Set([1, 2]));

    // Use tree state
    tree.$.userName.set('Alice');
    expect(tree.$.userName()).toBe('Alice');

    // Combine: filter tasks by selection
    const selectedTasks = tree.$.tasks().filter((t) => selection().has(t.id));
    expect(selectedTasks).toHaveLength(2);
  });

  it('should support computed values combining both patterns', () => {
    const selection = createSelectionSignal<number>();
    const tree = signalTree({
      items: [
        { id: 1, value: 10 },
        { id: 2, value: 20 },
        { id: 3, value: 30 },
      ],
    });

    // Computed combining standalone signal + tree state
    const selectedSum = computed(() => {
      const ids = selection();
      return tree.$.items()
        .filter((item) => ids.has(item.id))
        .reduce((sum, item) => sum + item.value, 0);
    });

    expect(selectedSum()).toBe(0);

    selection.toggle(1);
    expect(selectedSum()).toBe(10);

    selection.toggle(3);
    expect(selectedSum()).toBe(40);

    selection.toggle(1);
    expect(selectedSum()).toBe(30);
  });
});

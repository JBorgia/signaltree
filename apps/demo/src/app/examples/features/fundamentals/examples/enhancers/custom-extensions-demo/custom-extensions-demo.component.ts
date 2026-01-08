import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, Signal, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ISignalTree, registerMarkerProcessor, signalTree } from '@signaltree/core';

// =============================================================================
// TWO PATTERNS FOR CUSTOM SIGNALS
// =============================================================================
//
// SignalTree supports TWO patterns for custom signal types:
//
// 1. STANDALONE FACTORIES (simpler, recommended for most cases)
//    - Create factory functions that return rich signals
//    - Use alongside SignalTree for component-local state
//    - No registration required
//
// 2. MARKERS IN TREE STATE (for shared/persistent state)
//    - Register marker processors to embed custom signals in tree
//    - State lives in SignalTree (persists with tree)
//    - DevTools integration, undo/redo support
//
// This demo shows BOTH patterns!
// =============================================================================

// =============================================================================
// PATTERN 1: STANDALONE SIGNAL FACTORIES
// =============================================================================
// These work WITHOUT registration - just create and use!

interface CounterSignal {
  (): number;
  increment(): void;
  decrement(): void;
  reset(): void;
  set(value: number): void;
}

function createCounter(initial = 0, step = 1): CounterSignal {
  const valueSignal = signal<number>(initial);

  const counterSignal = (() => valueSignal()) as CounterSignal;

  counterSignal.increment = () => valueSignal.update((v) => v + step);
  counterSignal.decrement = () => valueSignal.update((v) => v - step);
  counterSignal.reset = () => valueSignal.set(initial);
  counterSignal.set = (value: number) => valueSignal.set(value);

  return counterSignal;
}

interface SelectionSignal<T> {
  (): Set<T>;
  count: Signal<number>;
  hasSelection: Signal<boolean>;
  isSelected(item: T): boolean;
  toggle(item: T): void;
  select(...items: T[]): void;
  deselect(...items: T[]): void;
  clear(): void;
  selectAll(items: T[]): void;
}

function createSelection<T>(): SelectionSignal<T> {
  const selectedSignal = signal<Set<T>>(new Set());

  const selectionSignal = (() => selectedSignal()) as SelectionSignal<T>;

  selectionSignal.count = computed(() => selectedSignal().size);
  selectionSignal.hasSelection = computed(() => selectedSignal().size > 0);

  selectionSignal.isSelected = (item: T) => selectedSignal().has(item);

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

  selectionSignal.select = (...items: T[]) => {
    selectedSignal.update((set) => {
      const next = new Set(set);
      items.forEach((item) => next.add(item));
      return next;
    });
  };

  selectionSignal.deselect = (...items: T[]) => {
    selectedSignal.update((set) => {
      const next = new Set(set);
      items.forEach((item) => next.delete(item));
      return next;
    });
  };

  selectionSignal.clear = () => selectedSignal.set(new Set());

  selectionSignal.selectAll = (items: T[]) => {
    selectedSignal.set(new Set(items));
  };

  return selectionSignal;
}

// =============================================================================
// PATTERN 2: MARKERS IN TREE STATE
// =============================================================================
// Register marker processors to embed custom signals directly in SignalTree.
// ⚠️ CRITICAL: Register BEFORE any signalTree() call that uses these markers!

// --- Counter Marker ---
const COUNTER_MARKER = Symbol('COUNTER_MARKER');

interface CounterMarker {
  [COUNTER_MARKER]: true;
  initial: number;
  step: number;
}

function counter(initial = 0, step = 1): CounterMarker {
  return { [COUNTER_MARKER]: true, initial, step };
}

function isCounterMarker(value: unknown): value is CounterMarker {
  return Boolean(
    value &&
      typeof value === 'object' &&
      COUNTER_MARKER in value &&
      (value as Record<symbol, unknown>)[COUNTER_MARKER] === true
  );
}

function createCounterSignalFromMarker(marker: CounterMarker): CounterSignal {
  return createCounter(marker.initial, marker.step);
}

// --- Selection Marker ---
const SELECTION_MARKER = Symbol('SELECTION_MARKER');

interface SelectionMarker<T> {
  [SELECTION_MARKER]: true;
  _phantom?: T;
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

// ⚠️ REGISTRATION - Must happen before signalTree() calls below!
registerMarkerProcessor(isCounterMarker, createCounterSignalFromMarker);
registerMarkerProcessor(isSelectionMarker, <T>() => createSelection<T>());

// =============================================================================
// ENHANCERS - Work with any SignalTree
// =============================================================================

interface WithUndo {
  undo(): void;
  redo(): void;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
  checkpoint(): void;
  historyLength: Signal<number>;
}

function withUndo<T>(config?: { maxHistory?: number }) {
  const maxHistory = config?.maxHistory ?? 50;

  return (tree: ISignalTree<T>): ISignalTree<T> & WithUndo => {
    const history = signal<Record<string, unknown>[]>([]);
    const future = signal<Record<string, unknown>[]>([]);

    const canUndo = computed(() => history().length > 0);
    const canRedo = computed(() => future().length > 0);
    const historyLength = computed(() => history().length);

    // Snapshot readable values from tree.$
    const takeSnapshot = (): Record<string, unknown> => {
      const state = tree.$;
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(state as object)) {
        const value = (state as Record<string, unknown>)[key];
        if (typeof value === 'function') {
          try {
            snapshot[key] = (value as () => unknown)();
          } catch {
            // Skip if reading fails
          }
        }
      }
      return snapshot;
    };

    // Restore values that have a .set() method
    const restoreSnapshot = (snapshot: Record<string, unknown>) => {
      const state = tree.$;
      for (const key of Object.keys(snapshot)) {
        const node = (state as Record<string, { set?: (v: unknown) => void }>)[
          key
        ];
        if (node && typeof node.set === 'function') {
          try {
            node.set(snapshot[key]);
          } catch {
            // Skip if setting fails
          }
        }
      }
    };

    const checkpoint = () => {
      const snapshot = takeSnapshot();
      history.update((h) => {
        const next = [...h, snapshot];
        return next.length > maxHistory ? next.slice(-maxHistory) : next;
      });
      future.set([]);
    };

    const undo = () => {
      const h = history();
      if (h.length === 0) return;

      const current = takeSnapshot();
      future.update((f) => [...f, current]);

      const prev = h[h.length - 1];
      history.update((h) => h.slice(0, -1));
      restoreSnapshot(prev);
    };

    const redo = () => {
      const f = future();
      if (f.length === 0) return;

      const current = takeSnapshot();
      history.update((h) => [...h, current]);

      const next = f[f.length - 1];
      future.update((f) => f.slice(0, -1));
      restoreSnapshot(next);
    };

    return Object.assign(tree, {
      undo,
      redo,
      canUndo,
      canRedo,
      checkpoint,
      historyLength,
    } as WithUndo);
  };
}

// =============================================================================
// ENHANCER: withFreeze() - Prevents mutations when frozen
// =============================================================================

interface WithFreeze {
  freeze(): void;
  unfreeze(): void;
  isFrozen: Signal<boolean>;
}

function withFreeze<T>() {
  return (tree: ISignalTree<T>): ISignalTree<T> & WithFreeze => {
    const frozenSignal = signal(false);

    return Object.assign(tree, {
      freeze: () => frozenSignal.set(true),
      unfreeze: () => frozenSignal.set(false),
      isFrozen: frozenSignal.asReadonly(),
    } as WithFreeze);
  };
}

// =============================================================================
// DEMO COMPONENT
// =============================================================================

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-custom-extensions-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-extensions-demo.component.html',
  styleUrls: ['./custom-extensions-demo.component.scss'],
})
export class CustomExtensionsDemoComponent implements AfterViewInit {
  // ViewChild references for code blocks
  @ViewChild('counterCode') counterCodeEl!: ElementRef<HTMLPreElement>;
  @ViewChild('selectionCode') selectionCodeEl!: ElementRef<HTMLPreElement>;
  @ViewChild('undoCode') undoCodeEl!: ElementRef<HTMLPreElement>;
  @ViewChild('freezeCode') freezeCodeEl!: ElementRef<HTMLPreElement>;
  @ViewChild('usageCode') usageCodeEl!: ElementRef<HTMLPreElement>;

  // =============================================================================
  // PATTERN 1: STANDALONE FACTORIES (no registration needed)
  // =============================================================================
  // These are standalone signals used alongside SignalTree
  readonly likes = createCounter(0, 1);
  readonly quantity = createCounter(1, 5);
  readonly selectedTaskIds = createSelection<number>();

  // =============================================================================
  // PATTERN 2: MARKERS IN TREE STATE (registered above)
  // =============================================================================
  // The counter() and selection() markers are embedded directly in tree state
  readonly treeWithMarkers = signalTree({
    // Custom markers - materialize into rich signals!
    pageViews: counter(0, 1),
    productQty: counter(1, 5),
    favoriteIds: selection<number>(),

    // Regular state alongside markers
    products: [
      { id: 1, name: 'Widget A', price: 10 },
      { id: 2, name: 'Widget B', price: 20 },
      { id: 3, name: 'Widget C', price: 30 },
    ],
  });

  // Store for demo with enhancers (uses standalone signals for selection)
  store = signalTree({
    tasks: [
      { id: 1, title: 'Learn SignalTree markers', completed: false },
      { id: 2, title: 'Build custom enhancers', completed: false },
      { id: 3, title: 'Deploy to production', completed: false },
    ] as Task[],
    userName: 'Guest',
  })
    .with(withUndo({ maxHistory: 20 }))
    .with(withFreeze());

  // Accessors for marker-in-tree pattern demo
  get pageViews(): CounterSignal {
    return this.treeWithMarkers.$.pageViews as unknown as CounterSignal;
  }

  get productQty(): CounterSignal {
    return this.treeWithMarkers.$.productQty as unknown as CounterSignal;
  }

  get favoriteIds(): SelectionSignal<number> {
    return this.treeWithMarkers.$
      .favoriteIds as unknown as SelectionSignal<number>;
  }

  // Enhancer method accessors
  get canUndo(): Signal<boolean> {
    return (this.store as unknown as WithUndo).canUndo;
  }

  get canRedo(): Signal<boolean> {
    return (this.store as unknown as WithUndo).canRedo;
  }

  get historyLength(): Signal<number> {
    return (this.store as unknown as WithUndo).historyLength;
  }

  get isFrozen(): Signal<boolean> {
    return (this.store as unknown as WithFreeze).isFrozen;
  }

  checkpoint() {
    (this.store as unknown as WithUndo).checkpoint();
  }

  undo() {
    (this.store as unknown as WithUndo).undo();
  }

  redo() {
    (this.store as unknown as WithUndo).redo();
  }

  freeze() {
    (this.store as unknown as WithFreeze).freeze();
  }

  unfreeze() {
    (this.store as unknown as WithFreeze).unfreeze();
  }

  // Computed
  selectedTasks = computed(() => {
    const tasks = this.store.$.tasks();
    const selectedIds = this.selectedTaskIds();
    return tasks.filter((t) => selectedIds.has(t.id));
  });

  // Actions
  toggleTask(taskId: number) {
    this.checkpoint();
    this.selectedTaskIds.toggle(taskId);
  }

  selectAllTasks() {
    this.checkpoint();
    const allIds = this.store.$.tasks().map((t) => t.id);
    this.selectedTaskIds.selectAll(allIds);
  }

  clearSelection() {
    this.checkpoint();
    this.selectedTaskIds.clear();
  }

  completeSelected() {
    this.checkpoint();
    const selectedIds = this.selectedTaskIds();
    this.store.$.tasks.update((tasks) =>
      tasks.map((t) => (selectedIds.has(t.id) ? { ...t, completed: true } : t))
    );
    this.selectedTaskIds.clear();
  }

  updateUserName(event: Event) {
    this.checkpoint();
    const value = (event.target as HTMLInputElement).value;
    this.store.$.userName.set(value);
  }

  ngAfterViewInit(): void {
    // Set code block content after view init
    setTimeout(() => {
      if (this.counterCodeEl?.nativeElement) {
        this.counterCodeEl.nativeElement.textContent = this.counterMarkerCode;
      }
      if (this.selectionCodeEl?.nativeElement) {
        this.selectionCodeEl.nativeElement.textContent =
          this.selectionMarkerCode;
      }
      if (this.undoCodeEl?.nativeElement) {
        this.undoCodeEl.nativeElement.textContent = this.undoEnhancerCode;
      }
      if (this.freezeCodeEl?.nativeElement) {
        this.freezeCodeEl.nativeElement.textContent = this.freezeEnhancerCode;
      }
      if (this.usageCodeEl?.nativeElement) {
        this.usageCodeEl.nativeElement.textContent = this.usageCode;
      }
    }, 0);
  }

  // Code examples for display
  readonly counterMarkerCode = `// PATTERN 1: Standalone Factory (no registration)
function createCounter(initial = 0, step = 1): CounterSignal {
  const value = signal(initial);
  
  const counter = (() => value()) as CounterSignal;
  counter.increment = () => value.update(v => v + step);
  counter.decrement = () => value.update(v => v - step);
  counter.reset = () => value.set(initial);
  
  return counter;
}

// Usage - just create and use!
const likes = createCounter(0);
likes.increment();  // 1
likes.increment();  // 2
console.log(likes()); // 2

// PATTERN 2: Marker in Tree State (requires registration)
const COUNTER_MARKER = Symbol('COUNTER_MARKER');

function counter(initial = 0, step = 1): CounterMarker {
  return { [COUNTER_MARKER]: true, initial, step };
}

// ⚠️ Register BEFORE signalTree()!
registerMarkerProcessor(isCounterMarker, createCounterFromMarker);

// Now use in tree state
const tree = signalTree({
  pageViews: counter(0),      // ← Materializes to CounterSignal
  quantity: counter(1, 5),
});

tree.$.pageViews.increment();
tree.$.quantity.decrement();`;

  readonly selectionMarkerCode = `// SelectionSignal - Multi-select state management
interface SelectionSignal<T> {
  (): Set<T>;                    // Current selection
  count: Signal<number>;         // Computed count
  hasSelection: Signal<boolean>; // Any selected?
  isSelected(item: T): boolean;
  toggle(item: T): void;
  clear(): void;
}

// PATTERN 1: Standalone factory
const selectedIds = createSelection<number>();
selectedIds.toggle(1);
selectedIds.toggle(2);
console.log(selectedIds.count()); // 2

// PATTERN 2: Marker in tree
const tree = signalTree({
  items: [...],
  selectedIds: selection<number>(), // ← Materializes!
});

// Access from tree state
tree.$.selectedIds.toggle(1);
tree.$.selectedIds.count(); // Reactive signal!

// Combine with tree state
const selectedItems = computed(() => {
  const ids = tree.$.selectedIds();
  return tree.$.items().filter(item => ids.has(item.id));
});`;

  readonly undoEnhancerCode = `// withUndo() - Add undo/redo to any SignalTree
interface WithUndo {
  undo(): void;
  redo(): void;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
  checkpoint(): void;
  historyLength: Signal<number>;
}

function withUndo<T>(config?: { maxHistory?: number }) {
  return (tree: ISignalTree<T>): ISignalTree<T> & WithUndo => {
    const history = signal<Snapshot[]>([]);
    const future = signal<Snapshot[]>([]);
    
    const checkpoint = () => {
      const snapshot = takeSnapshot(tree.$);
      history.update(h => [...h, snapshot]);
      future.set([]);
    };
    
    const undo = () => {
      if (history().length === 0) return;
      future.update(f => [...f, takeSnapshot(tree.$)]);
      const prev = history().at(-1);
      history.update(h => h.slice(0, -1));
      restoreSnapshot(tree.$, prev);
    };
    
    return Object.assign(tree, {
      undo, redo, checkpoint,
      canUndo: computed(() => history().length > 0),
      canRedo: computed(() => future().length > 0),
      historyLength: computed(() => history().length),
    });
  };
}`;

  readonly freezeEnhancerCode = `// withFreeze() - Block mutations during operations
interface WithFreeze {
  freeze(): void;
  unfreeze(): void;
  isFrozen: Signal<boolean>;
}

function withFreeze<T>() {
  return (tree: ISignalTree<T>): ISignalTree<T> & WithFreeze => {
    const frozen = signal(false);
    
    return Object.assign(tree, {
      freeze: () => frozen.set(true),
      unfreeze: () => frozen.set(false),
      isFrozen: frozen.asReadonly(),
    });
  };
}

// Usage:
const store = signalTree({ ... }).with(withFreeze());

// Before async operation:
store.freeze();
await saveToServer();
store.unfreeze();`;

  readonly usageCode = `// TWO PATTERNS - Choose based on your needs!

// ═══════════════════════════════════════════════════════════
// PATTERN 1: Standalone Factories (simpler, no registration)
// ═══════════════════════════════════════════════════════════
// Best for: component-local state, UI counters, selections

const likes = createCounter(0);
const selectedIds = createSelection<number>();

// Use alongside a SignalTree
const store = signalTree({
  tasks: [...],
  userName: 'Guest',
})
  .with(withUndo())
  .with(withFreeze());

// Combine them
const selectedTasks = computed(() =>
  store.$.tasks().filter(t => selectedIds().has(t.id))
);

// ═══════════════════════════════════════════════════════════
// PATTERN 2: Markers in Tree (for shared/persistent state)
// ═══════════════════════════════════════════════════════════
// Best for: state in DevTools, undo/redo, serialization

// ⚠️ Register BEFORE any signalTree() call!
registerMarkerProcessor(isCounterMarker, createCounter);
registerMarkerProcessor(isSelectionMarker, createSelection);

const tree = signalTree({
  pageViews: counter(0),
  favoriteIds: selection<number>(),
  products: [...],
})
  .with(devTools())   // Markers visible in DevTools!
  .with(timeTravel()); // Undo/redo includes marker state!

tree.$.pageViews.increment();
tree.$.favoriteIds.toggle(1);`;
}

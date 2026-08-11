import { signal } from '@angular/core';

import {
  HISTORY_EXCLUDED,
  prunedEqual,
  pruneHistoryExcluded,
  snapshotState,
} from '../../lib/utils';
import { copyTreeProperties } from '../utils/copy-tree-properties';
import { interceptLeafSignals } from '../../lib/internals/intercept-leaf-signals';
import { getPathNotifier } from '../../lib/path-notifier';
import { withWriteContext } from '../../lib/write-context';

import type {
  ISignalTree,
  TimeTravelMethods,
  TimeTravelConfig,
  TimeTravelEntry,
  TreeNode,
  EnhancerMeta,
} from '../../lib/types';

import { ENHANCER_META } from '../../lib/types';

// Re-export for convenience (do not redefine locally)
export type { TimeTravelConfig, TimeTravelEntry };

// (TimeTravelConfig is imported from canonical types)

/**
 * Internal time travel state management
 */

/**
 * @internal Validate `maxHistorySize`, because two plausible values silently
 * disabled undo entirely.
 *
 * `maxHistorySize` is a BUFFER LENGTH, not a step count: N retained entries yield
 * N-1 undo steps, because the oldest retained entry is the state you land ON rather
 * than a step you spend. MEASURED after 10 writes — omitted: 10 steps, 5: 4, 2: 1,
 * **1: 0, 0: 0**.
 *
 * So `0` (which reads as "no limit") and `1` (which reads as "one step") both leave
 * `canUndo()` permanently false. `-1` additionally drives `getCurrentIndex()` to -1,
 * since the trim runs `currentIndex--` against an already-empty buffer. And `NaN` was
 * silently UNBOUNDED, because `length > NaN` is never true.
 *
 * A silently dead undo button is the same failure class as the phantom-step defect:
 * the API reports that undo is available and it does nothing. Fail loud instead.
 *
 * The `??` is deliberately preserved — it correctly distinguishes "not supplied"
 * from "supplied as 0", and the fix belongs in validation rather than in coalescing.
 */
function normaliseMaxHistorySize(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isFinite(value) || value < 2) {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      console.error(
        `SignalTree: timeTravel({ maxHistorySize: ${String(value)} }) cannot ` +
          `support undo. maxHistorySize is a buffer LENGTH, so N entries give ` +
          `N-1 undo steps — any value below 2 gives none, and a non-finite value ` +
          `is silently unbounded. Falling back to the default of 50. Pass 2 or ` +
          `more, or omit it. [ST2032]`
      );
    }
    return 50;
  }
  return Math.floor(value);
}
class TimeTravelManager<T> {
  private history: TimeTravelEntry<T>[] = [];

  /**
   * The undo/redo position is a SIGNAL, because `canUndo()` bound in a template
   * has to update when it changes.
   *
   * It was a plain number, and `canUndo()`/`canRedo()` read it directly. Called
   * imperatively they were always correct, so this survived; but a
   * `computed(() => tree.canUndo())` evaluated once and cached `false` forever,
   * because it took no dependency on anything. Under zone-based change
   * detection the template re-read the method on every cycle and papered over
   * it. Zoneless — which is what this library targets and what Angular 22
   * defaults toward — has nothing to trigger that re-read, so the undo and redo
   * buttons of a zoneless app never enabled.
   *
   * `historyVersion` covers the other half: `canRedo()` and `getHistory()`
   * depend on the LENGTH of the history array, not just the position, and the
   * array is mutated in place (push/shift/slice-assign). Every mutation bumps
   * it, so a consumer reading history reactively sees entries appear.
   *
   * Found by comparing against elf, which exposes `hasPast$`/`hasFuture$` as
   * observables for exactly this reason.
   */
  private readonly indexSignal = signal(-1);
  private readonly historyVersion = signal(0);

  private get currentIndex(): number {
    return this.indexSignal();
  }
  private set currentIndex(value: number) {
    this.indexSignal.set(value);
  }
  /** Call after any structural change to `this.history`. */
  private bumpHistory(): void {
    this.historyVersion.update((v) => v + 1);
  }

  private maxHistorySize: number;
  private includePayload: boolean;
  private actionNames: Record<string, string>;

  constructor(
    private tree: ISignalTree<T>,
    private config: TimeTravelConfig = {},
    private restoreStateFn?: (state: T) => void
  ) {
    this.maxHistorySize = normaliseMaxHistorySize(config.maxHistorySize);
    this.includePayload = config.includePayload ?? true;
    this.actionNames = {
      update: 'UPDATE',
      set: 'SET',
      batch: 'BATCH',
      ...config.actionNames,
    };

    // Add initial state to history
    this.addEntry('INIT');
  }

  /**
   * Add a new entry to the history.
   */
  // NOTE: there is deliberately NO `state` parameter.
  //
  // There used to be one, and it was a lie: every caller computed a snapshot to
  // pass in — `this.tree()`, `originalTreeCall()` — and this method ignored it
  // and called `snapshotState()` itself. Harmless in cost (both hit the same
  // memo) and NOT harmless in contract: the signature promised "record this
  // state" while the body recorded "whatever the tree is right now". A caller
  // handing over a deferred or reconstructed state would have silently got
  // something else.
  //
  // Recomputing here is the behaviour we actually want, so the parameter is
  // gone rather than wired up.
  //
  // The `provisional` parameter and `finalizeProvisional()` went with it in
  // 15.0.0: a half-built coalescing scheme with no caller anywhere in
  // `packages/*/src`. Deferred entry completion IS a real requirement — it is
  // what a transaction's `commit()` needs — but that one has to close a
  // path-scoped delta spanning concurrent writers, which is not what this was
  // built for. Rebuilding ~20 lines beats reasoning about which of its
  // assumptions still hold. See docs/architecture/history-the-greenfield-target.md.
  addEntry(action: string, payload?: unknown): void {
    // If we're not at the end of history, remove everything after current position
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
      this.bumpHistory();
    }

    // A history entry IS the snapshot — no clone.
    //
    // This used to `structuredClone` the whole tree per entry, which made every
    // recorded write O(state) and retained a full copy of the state per entry:
    // 50 root writes each changing ONE number cost 0.03ms without time travel
    // and 340.60ms with it, at 10k rows.
    //
    // Materialisation is now memoised and structurally shared, so an unchanged
    // subtree is the SAME object across snapshots, and needs no copy to stay
    // correct because the library never mutates a materialised node: a write
    // builds new objects along the changed path and leaves the rest alone.
    //
    // ⚠️ WHAT THAT COSTS PER ENTRY, precisely — an earlier version of this
    // comment claimed "O(depth) per entry" flatly, and that is only true of
    // plain nested state. Measured on a 500-row collection, changing ONE entity:
    //
    //     unrelated branch shared : true      <- O(depth) holds here
    //     rows node shared        : false
    //     all ARRAY shared        : false
    //     entity objects shared   : 499 / 500
    //
    // So a collection costs O(collection-length IN POINTERS) per entry — the
    // `all` array is rebuilt — while the entity objects themselves are shared.
    // Far cheaper than the structuredClone it replaced, and far from free: 50
    // entries over 10k rows is ~500k pointer copies.
    //
    // This is why undo/redo over a large collection is not where SignalTree
    // wins: elf's state-history swaps ONE reference on undo, because it is an
    // immutable store. Measured at ~2.5x behind elf on 50 writes + 50 undos over
    // 10k entities (3.97ms vs 1.64ms) — and ~54x AHEAD of a hand-rolled
    // snapshot history, which is what every library without the primitive
    // forces. `node --expose-gc tools/bench-compare.mjs --n 10000`.
    //
    // The ~150x figure this comment used to quote was the PRE-FIX number, from
    // before restore diffed instead of calling setAll unconditionally — and it
    // cited the very document that retracts it. See
    // docs/compare/real-implementations.md.
    //
    // This is what makes the snapshot read-only contract load-bearing rather
    // than advisory (nodes are frozen in dev). A caller that mutates a snapshot
    // now corrupts history as well as the cache.
    // Prune history-excluded nodes AFTER building, not by snapshotting
    // differently. The memo stays untouched — one snapshot, one cell, sharing
    // preserved — and the entry simply does not retain what it dropped. A tree
    // with no `recordHistory: false` anywhere gets the identical object back, so it
    // pays one shallow walk and allocates nothing. See RFC 0012 option B.
    const rawSnapshot = snapshotState(this.tree.$ as unknown as TreeNode<T>);
    const plain = pruneHistoryExcluded(rawSnapshot, this.tree.$);
    // `pruneHistoryExcluded` returns the IDENTICAL object when nothing was
    // excluded, so this is an exact O(1) test for "does this tree use
    // `recordHistory: false` at all" — and it keeps the structural-equality walk below
    // off the hot path for every tree that does not.
    const didPrune = plain !== rawSnapshot;

    if (
      (typeof ngDevMode === 'undefined' || ngDevMode) &&
      this.history.length % RETENTION_CHECK_INTERVAL === 0
    ) {
      checkHistoryRetention(this.tree.$, this.history.length);
    }

    const entry: TimeTravelEntry<T> = {
      state: plain as T,
      timestamp: Date.now(),
      action: this.actionNames[action] || action,
      ...(this.includePayload && payload !== undefined && { payload }),
    };

    // Dedupe by REFERENCE. `tree()` returns the identical object when nothing
    // changed, so this is exact for the case that matters and O(1) — the
    // deepEqual it replaces was a second full-state walk on every recorded
    // write, on top of the clone.
    //
    // Behaviour change worth knowing: two snapshots that are structurally equal
    // but referentially distinct are no longer collapsed. That needs a write
    // that changed something and a later write that changed it back, in
    // separate flushes — which is arguably two user actions and two entries.
    //
    // The `===` stays FIRST and stays the only check for trees without
    // exclusions. `prunedEqual` runs ONLY when something was actually pruned,
    // because it is a walk and the write path is the hot path — putting an
    // unconditional walk here would repeat the mistake that read-time
    // `shouldSkip` was introduced to fix.
    //
    // Why the extra check is needed at all: a write to an EXCLUDED collection
    // still makes a new root, and pruning copies every node on the path down to
    // the excluded key — so two snapshots differing only inside excluded state
    // are structurally identical and referentially distinct. The `===` missed
    // them and each became a PHANTOM entry: `canUndo()` true, undo changes
    // nothing visible, and the user spends a step they never had.
    const last = this.history[this.history.length - 1];
    if (
      last &&
      (last.state === entry.state ||
        (didPrune && prunedEqual(last.state, entry.state)))
    ) {
      return; // skip duplicate
    }

    // `shouldSkip` is NOT consulted here. It used to be, and the entry was
    // discarded — see `skipsBackward()` for why that moved to read time.
    //
    // The reference-dedup above stays: it is O(1), structural rather than
    // semantic, and collapsing an identical snapshot loses nothing.

    this.history.push(entry as TimeTravelEntry<T>);
    this.bumpHistory();
    this.currentIndex = this.history.length - 1;

    // Enforce max history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.bumpHistory();
      this.currentIndex--;
    }
  }

  undo(): boolean {
    if (!this.canUndo()) {
      return false;
    }

    this.currentIndex = this.skipsBackward(this.currentIndex);
    const entry = this.history[this.currentIndex];
    this.restoreState(entry.state);
    return true;
  }

  /**
   * Where `undo()` should land, given `shouldSkip`.
   *
   * ## Why the comparator runs HERE and not at record time
   *
   * It used to run in `addEntry` and `return` early, so the entry was never
   * pushed. Five problems, one cause — the cost and the decision were on the
   * wrong operation:
   *
   * 1. **The cost was on the hot path.** A write happens per keystroke and per
   *    telemetry frame; `undo()` is a human gesture. Recording an entry is
   *    O(depth) and nearly free since structural sharing landed (50 writes over
   *    10,000 rows: 0.04 ms). The comparator is the expensive part, so a
   *    potentially O(state) predicate ran per write to avoid something that
   *    costs almost nothing.
   * 2. **It was irreversible.** A skipped entry never existed. A wrong predicate
   *    lost history permanently. Filtering at read time is a view over complete
   *    data — change the predicate, get different navigation, lose nothing.
   * 3. **One policy for every consumer.** An undo button, a devtools panel and an
   *    audit view had to share a single filter fixed at record time.
   * 4. **It was a documented foot-gun.** "A careless comparator is an O(state)
   *    walk per write" is no longer expressible: a careless predicate now costs
   *    one slow `undo()`, not a slow app.
   * 5. **Coalescing was impossible.** Merging keystrokes into one word needs a RUN
   *    of entries, and at write N you cannot know N+1 is coming. Discarding at
   *    write time forecloses it by construction.
   *
   * ## The rule
   *
   * Walk back while the transition INTO the state being left is uninteresting.
   * If `E2 -> E3` is skippable then E2 and E3 are the same state to the user, so
   * undoing from E3 must not land on E2 — it lands on the first state the user
   * would recognise as different.
   *
   * Index 0 is never skipped past: the initial state is always a valid
   * destination, or undo could refuse to move at all.
   */
  private skipsBackward(from: number): number {
    const skip = this.config.shouldSkip;
    let j = from - 1;
    if (!skip) return j;
    while (j > 0 && skip(this.history[j].state, this.history[j + 1].state)) {
      j--;
    }
    return j;
  }

  /** Mirror of `skipsBackward` for `redo()`. */
  private skipsForward(from: number): number {
    const skip = this.config.shouldSkip;
    const last = this.history.length - 1;
    let j = from + 1;
    if (!skip) return j;
    while (j < last && skip(this.history[j - 1].state, this.history[j].state)) {
      j++;
    }
    return j;
  }

  redo(): boolean {
    if (!this.canRedo()) {
      return false;
    }

    this.currentIndex = this.skipsForward(this.currentIndex);
    const entry = this.history[this.currentIndex];
    this.restoreState(entry.state);
    return true;
  }

  getHistory(): TimeTravelEntry<T>[] {
    // The entry OBJECTS are copied so a caller cannot rewrite history metadata,
    // but the STATE is handed over by reference.
    //
    // This used to `deepClone` every entry's state on every call — O(state x
    // entries) each time you asked, which is brutal for a devtools panel that
    // reads history on a timer, and it discarded the structural sharing between
    // entries at the API boundary: two entries differing in one leaf came back
    // as two full, unrelated copies.
    //
    // Snapshots are immutable by contract and frozen in dev, so the copy bought
    // nothing that the contract does not already give.
    this.historyVersion();
    return this.history.map((entry) => ({ ...entry }));
  }

  resetHistory(): void {
    this.history = [];
    this.bumpHistory();
    this.currentIndex = -1;
    this.addEntry('RESET');
  }

  jumpTo(index: number): boolean {
    if (index < 0 || index >= this.history.length) {
      return false;
    }

    this.currentIndex = index;
    const entry = this.history[index];
    this.restoreState(entry.state);
    return true;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    // Reads historyVersion as well as the index: redo depends on the LENGTH of
    // history, which changes without the index moving (a new entry pushed while
    // sitting at the end).
    this.historyVersion();
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Restore state without triggering time travel middleware
   */
  private restoreState(state: T): void {
    // Tag every leaf write performed during this undo/redo/jump with
    // `source: 'time-travel'`. Enhancers (validation, guardrails) read this
    // via `getActiveWriteContext()` and can suppress side effects for replays.
    withWriteContext({ intent: 'system', source: 'time-travel' }, () => {
      if (this.restoreStateFn) {
        this.restoreStateFn(state);
      } else {
        // Fallback if no restoration function provided
        this.tree(state);
      }
    });
  }
}

/**
 * Enhances a SignalTree with comprehensive time travel capabilities.
 *
 * Adds undo/redo functionality, state history management, and snapshot features.
 * Automatically tracks state changes and provides methods to navigate through
 * the application's state history with configurable limits and optimizations.
 *
 * @template T - The state object type
 * @param config - Configuration options for time travel behavior
 * @returns Function that enhances a SignalTree with time travel capabilities
 *
 * @example
 * ```typescript
 * // Basic time travel enhancement
 * const store = signalTree({ count: 0, text: '' }).with(timeTravel());
 *
 * // Make some changes
 * store.count.set(1);
 * store.text.set('hello');
 * store.count.set(2);
 *
 * // Access time travel interface
 * const timeTravel = store.__timeTravel;
 *
 * // Navigate history
 * console.log(timeTravel.canUndo()); // true
 * timeTravel.undo(); // count: 1, text: 'hello'
 * timeTravel.undo(); // count: 1, text: ''
 * timeTravel.undo(); // count: 0, text: ''
 *
 * timeTravel.redo(); // count: 1, text: ''
 * console.log(timeTravel.canRedo()); // true
 * ```
 *
 * @example
 * ```typescript
 * // Advanced configuration
 * const store = signalTree({
 *   document: { title: '', content: '' },
 *   settings: { theme: 'light' }
 * }).with(timeTravel({
 *   maxHistorySize: 50,        // Limit memory usage
 *   includePayload: true,      // Store action metadata
 *   actionNames: {             // Custom action names
 *     'update_title': 'Update Document Title',
 *     'change_theme': 'Change Theme'
 *   }
 * }));
 *
 * // Named actions with metadata
 * store.update(() => ({ document: { title: 'New Title' } }), 'update_title');
 *
 * // View detailed history
 * const history = store.__timeTravel.getHistory();
 * console.log(history[0].action); // 'Update Document Title'
 * console.log(history[0].timestamp); // Date when change occurred
 * ```
 */

/**
 * @internal Retained collection pointers above which history is worth a word.
 *
 * The unit is the one that actually costs memory: a history entry retains one
 * POINTER per entity in every included collection, so retention is
 * `entries x collection width`, not either alone. Calibrated against the RFC
 * 0012 measurements, which come out at ~10 bytes per retained pointer:
 *
 *     1,000 rows x 50 entries =    50k pointers ->  0.76MB
 *    10,000 rows x 50 entries =   500k pointers ->  5.08MB
 *    50,000 rows x 50 entries = 2,500k pointers -> 24.73MB
 *
 * 500k is therefore ~5MB of history spent purely on collection arrays, which is
 * where "silently heavier forever" stops being theoretical. Deriving the
 * threshold from retention rather than from a row count also means a small
 * collection with a long history and a big one with a short history are judged
 * by the same standard — a row-count threshold gets both wrong.
 */
const HISTORY_RETAINED_POINTER_BUDGET = 500_000;

/** @internal Records between retention checks. See `checkHistoryRetention`. */
const RETENTION_CHECK_INTERVAL = 16;

/** @internal One report per process. */
let warnedHistoryRetention = false;

/**
 * @internal ST2029 — history retention from included collections.
 *
 * Checked at RECORD time, not at attach. The first version of this checked once
 * when the enhancer attached, and that is the one moment it cannot work: an app
 * builds its tree, attaches `timeTravel()` in the same breath, and the rows
 * arrive later from a fetch. At attach the collection is empty, every time. The
 * check passed its own tests only because those tests populated the collection
 * first — test order chosen to suit the implementation rather than to match
 * what an app does.
 *
 * Sampled every `RETENTION_CHECK_INTERVAL` records so the walk is amortised to
 * nothing: collection width moves slowly, and this is a warning about a trend,
 * not a tripwire that must fire on an exact entry.
 */
function checkHistoryRetention(root: unknown, entries: number): void {
  if (warnedHistoryRetention || !root || typeof root !== 'object') return;

  let widest = 0;
  let widestPath = '';
  let total = 0;

  const seen = new WeakSet<object>();
  const visit = (node: Record<string, unknown>, path: string): void => {
    if (seen.has(node)) return;
    seen.add(node);

    for (const key of Object.keys(node)) {
      const child = node[key] as Record<string, unknown> | undefined;
      if (!child || typeof child !== 'object') continue;
      const childPath = path ? `${path}.${key}` : key;

      const all = (child as { all?: () => unknown[] }).all;
      const isCollection =
        typeof all === 'function' &&
        typeof (child as { setAll?: unknown }).setAll === 'function';

      if (isCollection) {
        // An excluded collection is not retained, so it is not counted.
        if ((child as Record<symbol, unknown>)[HISTORY_EXCLUDED] === true) {
          continue;
        }
        let size = 0;
        try {
          size = all.call(child).length;
        } catch {
          continue;
        }
        total += size;
        if (size > widest) {
          widest = size;
          widestPath = childPath;
        }
        continue;
      }

      visit(child, childPath);
    }
  };

  try {
    visit(root as Record<string, unknown>, '');
  } catch {
    return; // A diagnostic must never break a write.
  }

  const retained = total * entries;
  if (retained < HISTORY_RETAINED_POINTER_BUDGET) return;

  warnedHistoryRetention = true;
  console.warn(
    `SignalTree: time travel is retaining roughly ${Math.round(
      retained / 1000
    )}k entity pointers — ${entries} history entries, each holding a fresh ` +
      `array for every collection it captures (widest: "${widestPath}" at ` +
      `${widest}). Every write to those collections is O(collection), and the ` +
      `history only grows. If a collection should persist but not be undoable, ` +
      `pass entityMap({ recordHistory: false }); if it should be neither, use ` +
      `transient: true. [ST2029]`
  );
}

export function timeTravel(
  config: TimeTravelConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T> {
  const { enabled = true } = config;
  const enhancerFn = <T>(
    tree: ISignalTree<T>
  ): ISignalTree<T> & TimeTravelMethods<T> => {
    // Disabled (noop) path
    if (!enabled) {
      const noopMethods: TimeTravelMethods<T> = {
        undo(): void {
          /* disabled */
        },
        redo(): void {
          /* disabled */
        },
        canUndo(): boolean {
          return false;
        },
        canRedo(): boolean {
          return false;
        },
        getHistory(): TimeTravelEntry<T>[] {
          return [];
        },
        resetHistory(): void {
          /* disabled */
        },
        jumpTo(_index: number): void {
          void _index; /* disabled */
        },
        getCurrentIndex(): number {
          return -1;
        },
      };

      return Object.assign(tree, noopMethods) as unknown as ISignalTree<T> &
        TimeTravelMethods<T>;
    }
    // Store the original callable tree function
    const originalTreeCall = (
      tree as unknown as {
        bind: (t: unknown) => (...args: unknown[]) => T;
      }
    ).bind(tree);

    // Flag to prevent time travel during restoration
    let isRestoring = false;

    // Create time travel manager with restoration function
    const timeTravelManager = new TimeTravelManager(
      tree,
      config,
      (state: T) => {
        isRestoring = true;
        try {
          originalTreeCall(state);
        } finally {
          isRestoring = false;
        }
      }
    );

    // If PathNotifier batching is enabled, use flush events to record
    // a single snapshot per flush; otherwise, keep the existing immediate
    // update-based history entry.
    //
    // IMPORTANT: signalTree's recursive update pipeline writes to leaf
    // signals directly without calling PathNotifier.notify(); only entity
    // collections notify by themselves. To make direct leaf writes such as
    // `tree.$.user.profile.name.set('x')` observable here we recursively
    // intercept every plain writable signal and route their writes through
    // the global notifier. Without this interception, time-travel would
    // silently miss every leaf .set()/.update() in the tree.
    /** Set by this tree's own leaf interceptors; read by the global flush hook. */
    let selfDirty = false;
    let unsubscribeFlush: (() => void) | null = null;
    let restoreLeafInterceptors: (() => void) | null = null;
    try {
      const notifier = getPathNotifier();
      if (notifier) {
        if ('$' in tree) {
          restoreLeafInterceptors = interceptLeafSignals(
            (tree as ISignalTree<T>).$ as Record<string, unknown>,
            (path, next, prev) => {
              if (isRestoring) return;
              // Mark THIS tree dirty. The flush hook below is global, so
              // without this flag every time-travelled tree snapshotted itself
              // whenever ANY tree in the process flushed.
              selfDirty = true;
              notifier.notify(path, next, prev);
            }
          );
        }
        if (typeof notifier.onFlush === 'function') {
          unsubscribeFlush = notifier.onFlush(() => {
            // Avoid recording history while restoring
            if (isRestoring) return;
            // `onFlush` is on the GLOBAL PathNotifier, so this fires for writes
            // to trees that have nothing to do with this one. Recording
            // unconditionally meant a full materialise + structuredClone of
            // THIS tree on every unrelated flush, then throwing it away:
            // measured 0.008ms -> 3.7 -> 7.2 -> 9.7ms as 1/2/3 unrelated
            // 10k-leaf trees were kept alive. Cost that scales with OTHER
            // people's trees is the worst kind.
            if (!selfDirty) return;
            selfDirty = false;
            timeTravelManager.addEntry('batch');
          });
        }
      }
    } catch {
      // Ignore - fall back to default behavior
    }

    // Create enhanced tree function that includes time travel tracking
    const enhancedTree = function (this: ISignalTree<T>, ...args: unknown[]) {
      if (args.length === 0) {
        return originalTreeCall();
      } else {
        if (isRestoring) {
          if (args.length === 1) {
            const arg = args[0];
            if (typeof arg === 'function') {
              return originalTreeCall(arg as (current: T) => T);
            } else {
              return originalTreeCall(arg as T);
            }
          }
          return;
        }

        const beforeState = originalTreeCall();

        let result: unknown;
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            result = originalTreeCall(arg as (current: T) => T);
          } else {
            result = originalTreeCall(arg as T);
          }
        }

        const afterState = originalTreeCall();

        // Reference compare, not deepEqual. Both sides come from the memoised
        // root materialisation, which returns the IDENTICAL object when nothing
        // changed — so this is exact, and O(1) instead of a full-state walk on
        // every single root write. That walk was the dominant remaining cost:
        // 50 writes changing ONE number cost 57.49ms at 10k rows with it and
        // 0.44ms without.
        if (beforeState !== afterState) {
          // Immediate entry on explicit tree updates (preserve historical behavior)
          timeTravelManager.addEntry('update');
        }

        return result;
      }
    } as unknown as ISignalTree<T>;

    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    // copyTreeProperties, NOT Object.assign: `Object.assign` copies only
    // ENUMERABLE own properties, and every tree method (`updateAndReport`,
    // `batchUpdate`, `onPathChange`, `registerCleanup`, …) is defined
    // `enumerable: false`. They were silently dropped, so the builder that
    // wraps this enhanced tree found no method to forward to and returned an
    // empty result — `updateAndReport({count:1})` returned [] and never wrote.
    copyTreeProperties(
      tree as unknown as object,
      enhancedTree as unknown as object
    );

    // Define new .with() method that passes enhancedTree (not the original tree)
    // to subsequent enhancers. This is critical for preserving the enhancer chain.
    Object.defineProperty(enhancedTree, 'with', {
      value: function <R>(enhancer: (tree: ISignalTree<T>) => R): R {
        if (typeof enhancer !== 'function') {
          throw new Error('Enhancer must be a function');
        }
        return enhancer(enhancedTree as ISignalTree<T>) as R;
      },
      writable: false,
      enumerable: false,
      configurable: true,
    });

    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: (tree as ISignalTree<T>).$,
        enumerable: false,
        configurable: true,
      });
    }

    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['undo'] = () => {
      timeTravelManager.undo();
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['redo'] = () => {
      timeTravelManager.redo();
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['getHistory'] =
      () => timeTravelManager.getHistory();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['resetHistory'] =
      () => {
        timeTravelManager.resetHistory();
      };

    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['jumpTo'] = (
      index: number
    ) => {
      timeTravelManager.jumpTo(index);
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['canUndo'] = () =>
      timeTravelManager.canUndo();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['canRedo'] = () =>
      timeTravelManager.canRedo();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['getCurrentIndex'] =
      () => timeTravelManager.getCurrentIndex();

    // Expose internal manager for advanced tooling / demo usage
    (enhancedTree as unknown as Record<string, unknown>)['__timeTravel'] =
      timeTravelManager;

    // Register cleanup to free history snapshots on destroy and to tear down
    // PathNotifier subscriptions / leaf-signal interceptors.
    if (typeof tree.registerCleanup === 'function') {
      tree.registerCleanup(() => {
        try {
          unsubscribeFlush?.();
        } catch {
          /* ignore */
        }
        try {
          restoreLeafInterceptors?.();
        } catch {
          /* ignore */
        }
        unsubscribeFlush = null;
        restoreLeafInterceptors = null;
        timeTravelManager.resetHistory();
      });
    }

    return enhancedTree as unknown as ISignalTree<T> & TimeTravelMethods<T>;
  };

  const meta: EnhancerMeta = { name: 'timeTravel', provides: ['timeTravel'] };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}

/**
 * Convenience function to enable basic time travel
 */
export function enableTimeTravel(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & TimeTravelMethods<T> {
  return timeTravel({ enabled: true });
}

/**
 * Time travel with custom history size (v6 pattern).
 *
 * Not exported: reachable only as `withTimeTravel.history`, which is the
 * documented surface. Nothing imports the bare name.
 */
function timeTravelHistory(
  maxHistorySize: number
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T> {
  return timeTravel({ maxHistorySize });
}

// New v6-friendly export: `timeTravel` with named presets.
export const withTimeTravel = Object.assign(
  (config: TimeTravelConfig = {}) => timeTravel(config),
  {
    minimal: () => timeTravel({ maxHistorySize: 20, includePayload: false }),
    debug: () => timeTravel({ maxHistorySize: 200, includePayload: true }),
    history: timeTravelHistory,
  }
);

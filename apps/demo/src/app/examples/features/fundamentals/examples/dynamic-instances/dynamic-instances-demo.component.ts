import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  OnDestroy,
  Signal,
  signal,
} from '@angular/core';
import { entityMap, signalTree, timeTravel } from '@signaltree/core';

import { ExampleComponent } from '../../../../shared/components/example-shell';

import type {
  EntityMapMarker,
  ISignalTree,
  TimeTravelMethods,
} from '@signaltree/core';

/**
 * N runtime instances of one domain, inside ONE tree.
 *
 * The recurring ask (external RFC "dynamicSlices", and the same shape in
 * multi-window dashboards, side-by-side comparison and modal editors) is: let
 * me attach a typed composite slice at runtime, N times, and detach it later —
 * without giving up the single DevTools timeline, the single history buffer and
 * the shared batching that are the reasons to adopt a store at all.
 *
 * The usual workaround is one detached `signalTree()` per instance. That costs
 * a timeline per instance, an enhancer chain per instance, a split history, and
 * manual teardown. This page is the demonstration that you do not have to pay
 * any of it: an `entityMap` whose entities ARE the instances gives you runtime
 * membership, per-instance granular writes, one ordered history, one snapshot,
 * and a teardown seam for resources the instance owns.
 *
 * ── Two limits this page is deliberately honest about ────────────────────────
 *
 * 1. **Instance fields must be FLAT to be independently writable.**
 *    `createEntityNode` builds one field signal per own key of the entity and
 *    does not recurse. A nested object field materialises as a computed of the
 *    WHOLE object with `.set()` attached — so `node.draft.set({...})` replaces
 *    it, but `node.draft.customer` does not exist at runtime. The instance
 *    shape below is therefore flat.
 *
 * 2. **`clear()` and `setAll()` do not fire `tap({ onRemove })`.**
 *    `removeOne` / `removeMany` / `removeWhere` do. Where an instance owns an
 *    external resource, `clear()` drops it without teardown — so "Detach all"
 *    below routes through `removeMany(ids())`, not `clear()`.
 */
type ConnStatus = 'connecting' | 'live';
type SaveState = 'idle' | 'saving' | 'saved';

/** One live scale connection. Flat on purpose — see the note above. */
interface ScaleInstance {
  id: string;
  label: string;
  connStatus: ConnStatus;
  customer: string;
  project: string;
  saveState: SaveState;
}

/** The high-frequency half, kept in its own history-excluded collection. */
interface ScaleSample {
  id: string;
  net: number;
}

interface DashboardState {
  scales: EntityMapMarker<ScaleInstance, string>;
  samples: EntityMapMarker<ScaleSample, string>;
  ticketsWritten: number;
}

/**
 * The per-instance signal bundle a card binds to.
 *
 * Built ONCE per instance and cached. Creating these in a template-called
 * getter would allocate a fresh `computed` every change-detection cycle —
 * no memoisation, and the fan-out measurement below would read as N instead
 * of 1. It is the same inline-allocation trap `entityMap` reports as ST2026
 * for `where`/`find` predicates.
 */
interface InstanceView {
  id: string;
  label: Signal<string>;
  connStatus: Signal<ConnStatus | ''>;
  customer: Signal<string>;
  project: Signal<string>;
  saveState: Signal<SaveState | ''>;
  net: Signal<number>;
}

@Component({
  selector: 'app-dynamic-instances-demo',
  standalone: true,
  imports: [ExampleComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dynamic-instances-demo.component.html',
  styleUrl: './dynamic-instances-demo.component.scss',
})
export class DynamicInstancesDemoComponent implements OnDestroy {
  /** Kept small so the page stays legible; the pattern has no such limit. */
  private readonly maxInstances = 4;

  private readonly tree = signalTree<DashboardState>({
    scales: entityMap<ScaleInstance, string>({ selectId: (s) => s.id }),
    // The operator's actions belong in history. A 2 Hz weight feed does not —
    // it would bury them and make undo rewind a reading.
    samples: entityMap<ScaleSample, string>({
      selectId: (s) => s.id,
      recordHistory: false,
    }),
    ticketsWritten: 0,
  }).with(timeTravel({ maxHistorySize: 100 })) as unknown as ISignalTree<
    DashboardState
  > &
    TimeTravelMethods<DashboardState>;

  private readonly scales = this.tree.$.scales;
  private readonly samples = this.tree.$.samples;

  /** Simulated per-instance streams, opened and closed by the collection tap. */
  private readonly feeds = new Map<string, ReturnType<typeof setInterval>>();
  private seq = 0;

  readonly instanceIds = this.scales.ids;
  readonly instanceCount = this.scales.count;
  readonly ticketsWritten = this.tree.$.ticketsWritten;

  readonly openFeeds = signal(0);
  readonly samplesWritten = signal(0);
  readonly feedsRunning = signal(false);
  readonly historyLength = signal(0);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly lastFanOut = signal(0);
  readonly recentHistory = signal<string[]>([]);

  readonly atCapacity = computed(
    () => this.instanceCount() >= this.maxInstances
  );

  readonly snapshot = computed(() => ({
    scales: this.scales.all(),
    samples: this.samples.all(),
    ticketsWritten: this.ticketsWritten(),
  }));

  // One derivation per instance, each reading ONE instance's `customer`.
  // The body increments a counter, so an edit's true fan-out is measurable.
  private bodyRuns = 0;
  private readonly derivations = new Map<string, Signal<string>>();

  /**
   * Per-instance signal bundles, memoised by id.
   *
   * Get-or-create rather than built-at-attach, because **`undo()` can put an
   * instance back**. Time travel restores the collection wholesale, so an
   * instance detached three actions ago reappears in the tree without going
   * through `attach()`. Anything keyed off `attach()` alone desynchronises from
   * the tree the moment that happens — the card count stops matching the
   * instance count. The tree is the source of truth for membership; this map is
   * only a cache of derivations over it.
   *
   * (Bounded by membership: `pruneCaches` drops entries no longer present.)
   */
  private readonly viewCache = new Map<string, InstanceView>();

  /** The cards to render — one per instance currently in the tree. */
  readonly views = computed(() => this.instanceIds().map((id) => this.viewFor(id)));

  private readonly disposeTap: () => void;

  constructor() {
    // The disposal seam. Membership drives BOTH halves of an instance: the
    // stream it owns, and its row in the history-excluded sample collection.
    // Routing both through the tap is what makes undo-restore coherent — a
    // re-attached instance gets its feed and its reading back without
    // `attach()` ever running again.
    this.disposeTap = this.scales.tap({
      onAdd: (_entity, id) => {
        const key = String(id);
        this.openFeed(key);
        if (!this.samples.has(key)()) this.samples.addOne({ id: key, net: 0 });
      },
      onRemove: (id) => {
        const key = String(id);
        this.closeFeed(key);
        if (this.samples.has(key)()) this.samples.removeOne(key);
      },
    });

    this.attach();
    this.attach();
    this.refresh();
  }

  /** Memoised per-instance derivations. Created on demand, never per CD cycle. */
  private viewFor(id: string): InstanceView {
    let view = this.viewCache.get(id);
    if (view === undefined) {
      view = {
        id,
        label: computed(() => this.scales.byId(id)?.label() ?? ''),
        connStatus: computed(() => this.scales.byId(id)?.connStatus() ?? ''),
        customer: computed(() => this.scales.byId(id)?.customer() ?? ''),
        project: computed(() => this.scales.byId(id)?.project() ?? ''),
        saveState: computed(() => this.scales.byId(id)?.saveState() ?? ''),
        net: computed(() => this.samples.byId(id)?.net() ?? 0),
      };
      this.viewCache.set(id, view);
    }
    return view;
  }

  /** Same get-or-create, for the fan-out probes. */
  private derivationFor(id: string): Signal<string> {
    let deriv = this.derivations.get(id);
    if (deriv === undefined) {
      deriv = computed(() => {
        this.bodyRuns++;
        return this.scales.byId(id)?.customer() ?? '';
      });
      this.derivations.set(id, deriv);
    }
    return deriv;
  }

  /** Drop cache entries for instances no longer in the tree. */
  private pruneCaches(): void {
    const live = new Set(this.instanceIds());
    for (const id of [...this.viewCache.keys()]) {
      if (!live.has(id)) this.viewCache.delete(id);
    }
    for (const id of [...this.derivations.keys()]) {
      if (!live.has(id)) this.derivations.delete(id);
    }
  }

  ngOnDestroy(): void {
    this.disposeTap();
    for (const handle of this.feeds.values()) clearInterval(handle);
    this.feeds.clear();
    this.openFeeds.set(0);
  }

  // ── Membership ────────────────────────────────────────────────────────────

  attach(): void {
    if (this.atCapacity()) return;
    const n = ++this.seq;
    const id = `scale-${n}`;
    this.scales.addOne({
      id,
      label: `Scale ${n}`,
      connStatus: 'connecting',
      customer: '',
      project: '',
      saveState: 'idle',
    });
    // The `scales` tap seeds the sample row and opens the feed — membership is
    // declared in one place only.
    this.primeDerivations();
    // A connection settles a moment after it is opened.
    setTimeout(() => {
      if (this.scales.has(id)()) {
        this.scales.byIdOrFail(id).connStatus.set('live');
      }
      this.refresh();
    }, 400);
    this.refresh();
  }

  detach(id: string): void {
    this.scales.removeOne(id);
    this.pruneCaches();
    this.refresh();
  }

  /**
   * `removeMany`, NOT `clear()` — `clear()` does not fire `tap({ onRemove })`,
   * so it would drop every instance without closing the stream it owns.
   */
  detachAll(): void {
    this.scales.removeMany([...this.instanceIds()]);
    this.pruneCaches();
    this.refresh();
  }

  // ── Per-instance writes ───────────────────────────────────────────────────

  setCustomer(id: string, value: string): void {
    this.measured(() => this.scales.byIdOrFail(id).customer.set(value));
  }

  setProject(id: string, value: string): void {
    this.measured(() => this.scales.byIdOrFail(id).project.set(value));
  }

  writeTicket(id: string): void {
    this.scales.byIdOrFail(id).saveState.set('saving');
    this.refresh();
    setTimeout(() => {
      if (!this.scales.has(id)()) return;
      this.scales.byIdOrFail(id).saveState.set('saved');
      this.tree.$.ticketsWritten.set(this.ticketsWritten() + 1);
      this.refresh();
    }, 500);
  }

  /** Runs a write and records how many instance derivations re-ran because of it. */
  private measured(write: () => void): void {
    const before = this.bodyRuns;
    write();
    this.primeDerivations();
    this.lastFanOut.set(this.bodyRuns - before);
    this.refresh();
  }

  /**
   * Read every live instance's probe, so the next write's fan-out is measured
   * against a fully-clean set. Reads through `derivationFor` so an instance
   * restored by `undo()` gets a probe too.
   */
  private primeDerivations(): void {
    for (const id of this.instanceIds()) this.derivationFor(id)();
  }

  // ── History ───────────────────────────────────────────────────────────────

  /**
   * Undo can cross an attach/detach boundary — an instance detached several
   * actions ago comes back. Membership is read from the tree afterwards rather
   * than tracked alongside it, so a restored instance simply reappears.
   */
  undo(): void {
    this.tree.undo();
    this.pruneCaches();
    this.primeDerivations();
    this.refresh();
  }

  redo(): void {
    this.tree.redo();
    this.pruneCaches();
    this.primeDerivations();
    this.refresh();
  }

  /**
   * Time-travel entries commit on a later tick, so every action refreshes on a
   * macrotask rather than reading synchronously (the same detail the
   * time-travel demo documents).
   */
  private refresh(): void {
    setTimeout(() => {
      const history = this.tree.getHistory();
      this.historyLength.set(history.length);
      this.canUndo.set(this.tree.canUndo());
      this.canRedo.set(this.tree.canRedo());
      const start = Math.max(0, history.length - 6);
      this.recentHistory.set(
        history.slice(start).map((entry, i) => {
          // A history entry holds the SNAPSHOT shape, not the declared state
          // shape: an `entityMap` marker snapshots as `{ all: [...] }`.
          const state = entry.state as unknown as Partial<{
            scales: { all: ScaleInstance[] };
          }>;
          const drafts = (state.scales?.all ?? [])
            .filter((s) => s.customer)
            .map((s) => `${s.label}="${s.customer}"`)
            .join(' ');
          return `${start + i + 1}. ${drafts || '(no drafts)'}`;
        })
      );
    }, 0);
  }

  // ── Simulated external resource ───────────────────────────────────────────

  private openFeed(id: string): void {
    if (this.feeds.has(id)) return;
    const handle = setInterval(() => {
      if (!this.feedsRunning()) return;
      if (!this.samples.has(id)()) return;
      const next = 18000 + Math.round(Math.sin(Date.now() / 900) * 1200);
      this.samples.byIdOrFail(id).net.set(next);
      this.samplesWritten.set(this.samplesWritten() + 1);
    }, 500);
    this.feeds.set(id, handle);
    this.openFeeds.set(this.feeds.size);
  }

  private closeFeed(id: string): void {
    const handle = this.feeds.get(id);
    if (handle === undefined) return;
    clearInterval(handle);
    this.feeds.delete(id);
    this.openFeeds.set(this.feeds.size);
  }

  toggleFeeds(): void {
    this.feedsRunning.set(!this.feedsRunning());
  }
}

import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { entityMap, signalTree, timeTravel } from '@signaltree/core';
import { onHydrateDecision, onTreeError } from '@signaltree/core/authoring';

/**
 * 14.0.0, running.
 *
 * The What's New page narrates this release; nothing on the site let you CALL
 * any of it. A capability audit that finds a gap, a release that closes it, and
 * a demo that never shows it is three quarters of a feature.
 *
 * The two benchmarks here run IN YOUR BROWSER on purpose. Every number the repo
 * publishes is Node 24 / V8 on one machine, and whether the ratios transfer to
 * a browser is explicitly unestablished in the research. A page that prints a
 * number from someone else's CI run asks for trust; one that measures on the
 * visitor's own machine does not need it.
 */

interface Row {
  id: string;
  label: string;
  done: boolean;
}

interface Measurement {
  hoistedMs: number;
  inlineMs: number;
  ratio: number;
  entities: number;
}

interface FanoutPoint {
  consumers: number;
  granularMs: number;
  wholeStateMs: number;
  ratio: number;
}

let seq = 0;
const nextId = () => `r${++seq}`;

@Component({
  selector: 'app-whats-new-14',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './whats-new-14.component.html',
  styleUrl: './whats-new-14.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNew14Component {
  // ── Collections: prepend, active entity, id migration ────────────────────
  readonly tree = signalTree({
    rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    note: 'edit me',
    // Sealing counter. A collection mutation does NOT create a history entry —
    // only a tree/branch write does — so a bulk import needs a root write after
    // it to record one entry holding the finished result.
    imports: 0,
  }).with(
    timeTravel({
      maxHistorySize: 50,
      // A cursor move is not an undo step. The comparator runs on EVERY
      // recorded write, so it compares the one field it means — walking the
      // whole state here would reintroduce the O(state) cost per write that
      // reference-dedup exists to remove.
      shouldSkip: (prev, next) =>
        (prev as { note?: string })?.note ===
          (next as { note?: string })?.note &&
        (prev as { rows?: { all?: unknown[] } })?.rows?.all?.length ===
          (next as { rows?: { all?: unknown[] } })?.rows?.all?.length,
    })
  );

  readonly errors = signal<string[]>([]);
  readonly hydrateDecisions = signal<string[]>([]);

  constructor() {
    this.tree.$.rows.addMany([
      { id: nextId(), label: 'first', done: false },
      { id: nextId(), label: 'second', done: true },
    ]);

    // One place to observe every error the library CATCHES. Markers still
    // handle their own errors exactly as before — this is additive, and a
    // listener that throws cannot damage the operation that reported to it.
    onTreeError((e) =>
      this.errors.update((l) => [...l, String(e.error)].slice(-5))
    );

    // Not a warning, deliberately: declining a rehydrate because a loader owns
    // the source is CORRECT, and warning on correct behaviour trains people to
    // ignore the channel.
    onHydrateDecision((e) =>
      this.hydrateDecisions.update((l) =>
        [...l, `${e.marker}: ${e.decision} (${e.reason})`].slice(-5)
      )
    );
  }

  readonly rows = computed(() => this.tree.$.rows.all());
  readonly activeRow = computed(() => this.tree.$.rows.activeEntity());
  readonly canUndo = computed(() => this.tree.canUndo());
  readonly canRedo = computed(() => this.tree.canRedo());
  readonly paused = computed(() => this.tree.isRecordingPaused());

  prepend(): void {
    this.tree.$.rows.prependOne({
      id: nextId(),
      label: 'prepended',
      done: false,
    });
  }

  /** Front, in the order given — `prependMany([a, b])` reads back as `a, b`. */
  prependBatch(): void {
    this.tree.$.rows.prependMany([
      { id: nextId(), label: 'batch A', done: false },
      { id: nextId(), label: 'batch B', done: false },
    ]);
  }

  append(): void {
    this.tree.$.rows.addOne({ id: nextId(), label: 'appended', done: false });
  }

  select(id: string): void {
    this.tree.$.rows.setActiveId(id);
  }

  clearSelection(): void {
    this.tree.$.rows.clearActiveId();
  }

  /** The other half of optimistic creation: adopt the id the server assigned. */
  adoptServerId(): void {
    const first = this.rows()[0];
    if (!first) return;
    this.tree.$.rows.changeId(first.id, `srv-${first.id}`);
  }

  /**
   * A bulk import should be ONE undo step, not a hundred — and pausing ALONE
   * does not achieve that. It achieves zero.
   *
   * This method used to pause, add all 25, and resume. Nothing was recorded, so
   * the newest history entry still described the state BEFORE the import:
   * `undo()` stepped back past it to the state before THAT, and the 25 rows
   * became unreachable with `canRedo()` false. The comment above it claimed the
   * opposite, and the page shipped that way.
   *
   * The seal is a ROOT write after `resumeRecording()`, which records one entry
   * holding the finished import. It cannot be another `addOne`: collection
   * mutations do not create history entries at all — only tree/branch writes do.
   * Snapshots still CARRY collections, so the recorded entry holds all 25 rows
   * and undo/redo round-trips them.
   */
  bulkImport(): void {
    this.tree.pauseRecording();
    for (let i = 0; i < 25; i++) {
      this.tree.$.rows.addOne({
        id: nextId(),
        label: `bulk ${i}`,
        done: false,
      });
    }
    this.tree.resumeRecording();
    // The sealing write must be a ROOT write. Sealing with another `addOne`
    // does not work: collection mutations never record an entry, which is the
    // same reason pausing was not the whole story.
    this.tree({ imports: this.tree.$.imports() + 1 });
  }

  undo(): void {
    this.tree.undo();
  }
  redo(): void {
    this.tree.redo();
  }

  // ── ST2026, measured here ────────────────────────────────────────────────
  readonly predicateResult = signal<Measurement | null>(null);
  readonly measuring = signal(false);

  /** Hoisted to a stable reference — this is the fix ST2026 asks for. */
  private readonly notDone = (r: Row) => !r.done;

  async measurePredicate(entities = 1000): Promise<void> {
    this.measuring.set(true);
    await new Promise((r) => setTimeout(r, 0));

    const bench = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    bench.$.rows.addMany(
      Array.from({ length: entities }, (_, i) => ({
        id: `b${i}`,
        label: `row ${i}`,
        done: i % 3 === 0,
      }))
    );

    const PASSES = 200;

    // Hoisted: one predicate identity, so the WeakMap cache hits every time.
    const t0 = performance.now();
    for (let i = 0; i < PASSES; i++) bench.$.rows.where(this.notDone)();
    const hoistedMs = performance.now() - t0;

    // Inline: a NEW arrow per pass — exactly what a template allocates on every
    // change-detection cycle. Misses the cache, re-filters the collection.
    const t1 = performance.now();
    for (let i = 0; i < PASSES; i++) bench.$.rows.where((r: Row) => !r.done)();
    const inlineMs = performance.now() - t1;

    this.predicateResult.set({
      hoistedMs,
      inlineMs,
      ratio: inlineMs / Math.max(hoistedMs, 0.0001),
      entities,
    });
    this.measuring.set(false);
  }

  // ── Fan-out, measured here ───────────────────────────────────────────────
  readonly fanoutResult = signal<FanoutPoint[] | null>(null);
  readonly measuringFanout = signal(false);

  /**
   * Granular vs whole-state notification, same workload.
   *
   * Both arms hold the same data and take the same number of writes. The only
   * difference is what a consumer DEPENDS on: one leaf, or the whole state. The
   * second arm is what a store with one signal at the root gives you — every
   * consumer re-projects on every emission and filters downstream.
   */
  async measureFanout(): Promise<void> {
    this.measuringFanout.set(true);
    await new Promise((r) => setTimeout(r, 0));

    const points: FanoutPoint[] = [];
    const WRITES = 200;

    for (const consumers of [0, 100, 1000, 5000]) {
      const fields: Record<string, number> = {};
      for (let i = 0; i < 100; i++) fields[`k${i}`] = 0;

      // Arm 1 — consumers depend on ONE leaf each.
      const granular = signalTree({ ...fields });
      const granularConsumers = Array.from({ length: consumers }, (_, i) =>
        computed(() =>
          (granular.$ as Record<string, () => number>)[`k${i % 100}`]()
        )
      );
      granularConsumers.forEach((c) => c());
      for (let w = 0; w < 20; w++) granular.$['k0'].set(w);
      granularConsumers.forEach((c) => c());

      const g0 = performance.now();
      for (let w = 0; w < WRITES; w++) granular.$['k0'].set(w);
      granularConsumers.forEach((c) => c());
      const granularMs = performance.now() - g0;

      // Arm 2 — one signal holds everything; consumers project off the whole
      // object, which is the immutable-root shape.
      const root = signal<Record<string, number>>({ ...fields });
      const rootConsumers = Array.from({ length: consumers }, (_, i) =>
        computed(() => root()[`k${i % 100}`])
      );
      rootConsumers.forEach((c) => c());
      for (let w = 0; w < 20; w++) root.set({ ...root(), k0: w });
      rootConsumers.forEach((c) => c());

      const r0 = performance.now();
      for (let w = 0; w < WRITES; w++) root.set({ ...root(), k0: w });
      rootConsumers.forEach((c) => c());
      const wholeStateMs = performance.now() - r0;

      points.push({
        consumers,
        granularMs,
        wholeStateMs,
        ratio: wholeStateMs / Math.max(granularMs, 0.0001),
      });
      await new Promise((r) => setTimeout(r, 0));
    }

    this.fanoutResult.set(points);
    this.measuringFanout.set(false);
  }
}

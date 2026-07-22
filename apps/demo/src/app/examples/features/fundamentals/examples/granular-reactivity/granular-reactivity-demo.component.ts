import { CommonModule } from '@angular/common';
import { Component, computed, signal, Signal, ChangeDetectionStrategy } from '@angular/core';
import { entityMap, signalTree } from '@signaltree/core';

import type { EntityMapMarker } from '@signaltree/core';

import { ExampleComponent } from '../../../../shared/components/example-shell';

interface Row {
  id: number;
  value: number;
}

/**
 * Honest demonstration of body-granular reactivity.
 *
 * IMPORTANT (and the reason this demo measures derivations, not renders):
 * Angular's `computed()` equality already isolates *renders* for ANY library —
 * a `signal(bigObject)` with per-item `computed()` under `OnPush` re-renders
 * only the rows whose value actually changed. So "who re-renders" is NOT a
 * SignalTree win.
 *
 * What DOES differ is how many derivation BODIES re-run per change:
 *  - SignalTree `entityMap`: per-entity signals — only the touched entity's
 *    derivation re-runs (fan-out 1).
 *  - Naive `signal(object)`: every per-item computed reads the one root signal,
 *    so ALL N bodies re-run on every change (they then return equal values, so
 *    renders still isolate — the work is wasted, not visible).
 *
 * To match SignalTree with raw signals you'd hand-roll one signal per field —
 * which is exactly what SignalTree does for you.
 */
@Component({
  selector: 'app-granular-reactivity-demo',
  standalone: true,
  imports: [CommonModule, ExampleComponent],
  template: `
    <st-example heading="Granular reactivity — how many derivations re-run?" [headingLevel]="1">
      <p intro class="muted">
        Both columns isolate <em>renders</em> (Angular <code>computed()</code>
        equality). Watch <strong>derivations re-run per change</strong> instead:
        SignalTree re-runs only the touched entity's; the naive single signal
        re-runs all {{ n }}.
      </p>

      <section class="demo">
      <div class="cols">
        <div class="col">
          <h3>SignalTree <code>entityMap</code></h3>
          <button type="button" (click)="bumpTree()">Bump a random row</button>
          <p class="metric">
            derivations re-run on last change:
            <strong [class.good]="treeDelta() <= 1">{{ treeDelta() }}</strong>
            / {{ n }}
          </p>
          <p class="muted total">total since load: {{ treeTotal() }}</p>
        </div>

        <div class="col">
          <h3>Naive <code>signal(object)</code></h3>
          <button type="button" (click)="bumpRaw()">Bump a random row</button>
          <p class="metric">
            derivations re-run on last change:
            <strong [class.bad]="rawDelta() > 1">{{ rawDelta() }}</strong>
            / {{ n }}
          </p>
          <p class="muted total">total since load: {{ rawTotal() }}</p>
        </div>
      </div>

      <p class="muted">
        After a few bumps the SignalTree side stays at <strong>1</strong>; the
        naive side re-runs all {{ n }} every time. Renders look identical — the
        difference is the wasted derivation work the naive pattern can't avoid
        without hand-rolling a signal per field.
      </p>
      </section>
    </st-example>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .demo {
        max-width: 48rem;
      }
      .muted {
        color: var(--color-neutral-500, #6b7280);
        font-size: 0.85rem;
      }
      .cols {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        margin: 1rem 0;
      }
      .metric {
        font-variant-numeric: tabular-nums;
      }
      .metric strong {
        font-size: 1.2rem;
      }
      .good {
        color: var(--color-success, #16a34a);
      }
      .bad {
        color: var(--color-danger, #dc2626);
      }
      .total {
        margin-top: -0.25rem;
      }
      button {
        margin: 0.5rem 0;
      }
    `,
  ],
})
export class GranularReactivityDemoComponent {
  readonly n = 6;

  // Body-execution counters incremented INSIDE each row's derivation.
  private treeBodyRuns = 0;
  private rawBodyRuns = 0;
  readonly treeDelta = signal(0);
  readonly rawDelta = signal(0);
  readonly treeTotal = signal(0);
  readonly rawTotal = signal(0);

  // --- SignalTree: entityMap, per-entity signals ---
  private tree = signalTree<{ rows: EntityMapMarker<Row, number> }>({
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
  });
  private treeDerivations: Signal<number>[] = [];

  // --- Naive baseline: one root signal holding all rows ---
  private rawRoot = signal<Record<number, Row>>({});
  private rawDerivations: Signal<number>[] = [];

  constructor() {
    const seed: Row[] = Array.from({ length: this.n }, (_, i) => ({
      id: i + 1,
      value: 0,
    }));
    this.tree.$.rows.addMany(seed);
    const raw: Record<number, Row> = {};
    for (const r of seed) raw[r.id] = r;
    this.rawRoot.set(raw);

    // One derivation per row. The body increments a counter so we can measure
    // exactly how many re-run per change.
    for (const r of seed) {
      const id = r.id;
      this.treeDerivations.push(
        computed(() => {
          this.treeBodyRuns++;
          return this.tree.$.rows.byId(id)?.value() ?? 0; // depends on entity `id` only
        })
      );
      this.rawDerivations.push(
        computed(() => {
          this.rawBodyRuns++;
          return this.rawRoot()[id]?.value ?? 0; // depends on the ROOT signal
        })
      );
    }
    // Prime both (initial body run for each).
    this.flush(this.treeDerivations);
    this.flush(this.rawDerivations);
  }

  private flush(derivs: Signal<number>[]): void {
    for (const d of derivs) d();
  }

  bumpTree(): void {
    const ids = this.tree.$.rows.ids();
    const id = ids[Math.floor(Math.random() * ids.length)];
    const before = this.treeBodyRuns;
    this.tree.$.rows.updateOne(id, {
      value: (this.tree.$.rows.byId(id)?.value() ?? 0) + 1,
    });
    this.flush(this.treeDerivations); // re-read; only dirty derivations re-run
    this.treeDelta.set(this.treeBodyRuns - before);
    this.treeTotal.set(this.treeBodyRuns);
  }

  bumpRaw(): void {
    const ids = Object.keys(this.rawRoot()).map(Number);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const before = this.rawBodyRuns;
    this.rawRoot.update((m) => ({
      ...m,
      [id]: { ...m[id], value: m[id].value + 1 },
    }));
    this.flush(this.rawDerivations);
    this.rawDelta.set(this.rawBodyRuns - before);
    this.rawTotal.set(this.rawBodyRuns);
  }
}

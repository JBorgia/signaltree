import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { linked, signalTree } from '@signaltree/core';

import {
  type CodeFile,
  ExampleComponent,
} from '../../../../shared/components/example-shell';

interface Item {
  id: number;
  name: string;
}

const SEED: Item[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Bravo' },
  { id: 3, name: 'Charlie' },
  { id: 4, name: 'Delta' },
];

/**
 * Demonstrates `linked()` (v11+) — SignalTree's derived-but-writable signal,
 * the marker-ethos answer to NgRx SignalStore's `withLinkedState`. It wraps
 * Angular's native `linkedSignal`.
 *
 * `selected` is DERIVED from `items` (defaults to the first), yet WRITABLE
 * (click a row to override), and RE-DERIVES when `items` changes — keeping the
 * chosen item if it still exists ("sticky selection"), otherwise falling back.
 */
@Component({
  selector: 'app-linked-derived-demo',
  standalone: true,
  imports: [CommonModule, ExampleComponent],
  template: `
    <st-example
      heading="Derived-but-writable — linked()"
      intro="linked() is SignalTree's derived-but-writable signal (it wraps Angular's linkedSignal). selected is derived from items — defaulting to the first — yet writable (click a row to override), and re-derives when items changes: it keeps the chosen item if it still exists (sticky selection), otherwise falls back to the first."
      [code]="codeFiles"
    >
      <section class="demo">
      <div class="cols">
        <div>
          <h3>items <span class="muted">(click to select)</span></h3>
          <ul class="list">
            @for (it of items(); track it.id) {
            <li
              role="button"
              tabindex="0"
              [class.active]="it.id === selected()?.id"
              (click)="select(it)"
              (keyup.enter)="select(it)"
              (keyup.space)="select(it)"
            >
              {{ it.name }} <span class="muted">#{{ it.id }}</span>
            </li>
            }
          </ul>
        </div>

        <div>
          <h3>selected</h3>
          <p class="selected">
            {{ selected()?.name ?? '—' }}
            <span class="muted">#{{ selected()?.id ?? '—' }}</span>
          </p>
          <p class="muted">
            Derived from <code>items</code>, overridable by clicking, and
            re-derived when the list changes.
          </p>
        </div>
      </div>

      <div class="controls">
        <button type="button" (click)="shuffleKeep()">
          Shuffle (keep selected) → stays sticky
        </button>
        <button type="button" (click)="removeSelected()">
          Remove selected → falls back to first
        </button>
        <button type="button" (click)="reset()">Reset</button>
      </div>
      </section>
    </st-example>
  `,
  styles: [
    `
      .demo {
        max-width: 34rem;
      }
      .muted {
        color: var(--color-neutral-500, #6b7280);
        font-size: 0.85rem;
      }
      .cols {
        display: flex;
        gap: 2rem;
        margin: 0.75rem 0;
      }
      .cols > div {
        flex: 1;
      }
      .list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .list li {
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-neutral-200, #e5e7eb);
        border-radius: 0.375rem;
        margin-bottom: 0.35rem;
        cursor: pointer;
      }
      .list li.active {
        border-color: var(--color-primary-500, #3b82f6);
        background: var(--color-primary-50, #eff6ff);
        font-weight: 600;
      }
      .selected {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0.25rem 0;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
    `,
  ],
})
export class LinkedDerivedDemoComponent {
  store = signalTree({ items: [...SEED] }).derived(($) => ({
    // Sticky selection: derived from items, writable, re-derives on change.
    // (Return type annotated — like Angular's linkedSignal, TS can't infer it
    // from the body when `prev.value` is referenced.)
    selected: linked({
      source: () => $.items(),
      computation: (items, prev): Item | undefined =>
        items.find((i) => i.id === prev?.value?.id) ?? items[0],
    }),
  }));

  items = this.store.$.items;
  selected = this.store.$.selected;

  readonly codeFiles: CodeFile[] = [
    {
      label: 'linked-derived-demo.component.ts',
      language: 'typescript',
      source: `store = signalTree({ items: [...SEED] }).derived(($) => ({
  // Sticky selection: derived from items, writable, re-derives on change.
  selected: linked({
    source: () => $.items(),
    computation: (items, prev): Item | undefined =>
      items.find((i) => i.id === prev?.value?.id) ?? items[0],
  }),
}));`,
    },
  ];

  select(it: Item): void {
    this.store.$.selected.set(it); // manual override — `selected` is writable
  }

  /** Reorder + rename, but keep the selected id present → selection sticks. */
  shuffleKeep(): void {
    const cur = this.selected();
    const shuffled = [...this.items()].reverse();
    this.store.$.items.set(shuffled);
    // `selected` re-derives: cur.id still present → stays on it.
    void cur;
  }

  /** Drop the selected item → linked() falls back to the first remaining. */
  removeSelected(): void {
    const cur = this.selected();
    if (!cur) return;
    this.store.$.items.set(this.items().filter((i) => i.id !== cur.id));
  }

  reset(): void {
    this.store.$.items.set([...SEED]);
  }
}

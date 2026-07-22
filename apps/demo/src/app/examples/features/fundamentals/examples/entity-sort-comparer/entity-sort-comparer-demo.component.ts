import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { entityMap, signalTree } from '@signaltree/core';

import { ExampleComponent } from '../../../../shared/components/example-shell';

import type { EntityMapMarker } from '@signaltree/core';

interface Player {
  id: number;
  name: string;
  score: number;
}

interface LeaderboardState {
  players: EntityMapMarker<Player, number>;
}

/**
 * Demonstrates `entityMap({ sortComparer })` (v10.5+, @ngrx/entity parity).
 *
 * The collection stays sorted by the comparator on EVERY read of `all()` /
 * `ids()` — no manual re-sort after each mutation. `map()` keeps insertion
 * order. Here players are kept highest-score-first; adding or updating a score
 * re-positions the row automatically.
 */
@Component({
  selector: 'app-entity-sort-comparer-demo',
  standalone: true,
  imports: [CommonModule, ExampleComponent],
  template: `
    <st-example heading="Auto-sorted collection — sortComparer" [headingLevel]="1">
      <p intro class="muted">
        <code
          >entityMap&lt;Player&gt;({{ '{' }} sortComparer: (a, b) =&gt; b.score
          - a.score {{ '}' }})</code
        >
        keeps <code>all()</code> highest-score-first on every read.
      </p>

      <div class="demo">
        <div class="controls">
          <button type="button" (click)="addRandom()">+ Add player</button>
          <button type="button" (click)="bumpRandom()">↑ Bump a score</button>
          <button type="button" (click)="reset()">Reset</button>
        </div>

        <ol class="board">
          @for (p of players(); track p.id) {
          <li>
            <span class="rank">#{{ $index + 1 }}</span>
            <span class="name">{{ p.name }}</span>
            <span class="score">{{ p.score }}</span>
          </li>
          }
        </ol>
        <p class="muted">
          Rows reorder automatically — no manual sort runs after mutations.
        </p>
      </div>
    </st-example>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .demo {
        max-width: 28rem;
      }
      .muted {
        color: var(--color-neutral-500, #6b7280);
        font-size: 0.85rem;
      }
      .controls {
        display: flex;
        gap: 0.5rem;
        margin: 0.75rem 0;
      }
      .board {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .board li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.4rem 0.6rem;
        border-bottom: 1px solid var(--color-neutral-200, #e5e7eb);
      }
      .rank {
        width: 2.5rem;
        color: var(--color-neutral-500, #6b7280);
      }
      .name {
        flex: 1;
        font-weight: 600;
      }
      .score {
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class EntitySortComparerDemoComponent {
  private nextId = 5;
  private readonly names = [
    'Ada',
    'Bjarne',
    'Carmack',
    'Dijkstra',
    'Euler',
    'Fermat',
    'Grace',
    'Hopper',
  ];

  store = signalTree<LeaderboardState>({
    // The comparator keeps all()/ids() sorted by score, descending.
    players: entityMap<Player, number>({
      selectId: (p) => p.id,
      sortComparer: (a, b) => b.score - a.score,
    }),
  });

  // all() is always returned in sorted order — no manual sort here.
  players = this.store.$.players.all;

  constructor() {
    this.store.$.players.addMany([
      { id: 1, name: 'Ada', score: 120 },
      { id: 2, name: 'Grace', score: 90 },
      { id: 3, name: 'Hopper', score: 150 },
      { id: 4, name: 'Euler', score: 60 },
    ]);
  }

  addRandom(): void {
    const id = this.nextId++;
    this.store.$.players.addOne({
      id,
      name: this.names[id % this.names.length] + ' ' + id,
      score: Math.floor(Math.random() * 200),
    });
  }

  bumpRandom(): void {
    const ids = this.store.$.players.ids();
    if (!ids.length) return;
    const id = ids[Math.floor(Math.random() * ids.length)];
    const cur = this.store.$.players.byId(id)?.();
    if (cur) this.store.$.players.updateOne(id, { score: cur.score + 50 });
  }

  reset(): void {
    this.store.$.players.setAll([
      { id: 1, name: 'Ada', score: 120 },
      { id: 2, name: 'Grace', score: 90 },
      { id: 3, name: 'Hopper', score: 150 },
      { id: 4, name: 'Euler', score: 60 },
    ]);
    this.nextId = 5;
  }
}

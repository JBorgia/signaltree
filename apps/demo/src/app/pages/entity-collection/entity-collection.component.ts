import { CommonModule } from '@angular/common';
import { Component, computed, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  entityMap,
  invalidateTag,
  signalTree,
  type EntityStorageAdapter,
} from '@signaltree/core';
import { delay, of } from 'rxjs';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

interface Item {
  id: string;
  name: string;
  detail: string;
}

const CATALOG: Item[] = [
  { id: 'aloe', name: 'Aloe Vera', detail: 'succulent · low water' },
  { id: 'basil', name: 'Basil', detail: 'herb · full sun' },
  { id: 'clover', name: 'Red Clover', detail: 'cover · nitrogen-fixing' },
  { id: 'dahlia', name: 'Dahlia', detail: 'flower · tuberous' },
  { id: 'elder', name: 'Elderberry', detail: 'shrub · pollinator' },
  { id: 'fern', name: 'Boston Fern', detail: 'foliage · shade' },
];
const SEEDS: Item[] = [
  { id: 's-kale', name: 'Kale seed', detail: 'brassica · cool season' },
  { id: 's-corn', name: 'Sweet corn', detail: 'grain · warm season' },
  { id: 's-pea', name: 'Snap pea', detail: 'legume · trellis' },
];

@Component({
  selector: 'app-entity-collection-showcase',
  standalone: true,
  imports: [CommonModule, RouterModule, CodeTabsComponent],
  templateUrl: './entity-collection.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './entity-collection.component.scss',
})
export class EntityCollectionShowcaseComponent implements OnDestroy {
  readonly dark = signal(false);
  toggleTheme(): void {
    this.dark.update((d) => !d);
  }

  // A ~6fps clock that drives the freshness ring / countdowns.
  readonly now = signal(0);
  private readonly clock = setInterval(() => this.now.set(nowMs()), 160);
  ngOnDestroy(): void {
    clearInterval(this.clock);
  }

  // =========================================================================
  // PANEL 1 — Single-flight: many callers, one fetch
  // =========================================================================
  readonly p1Fetches = signal(0); // real network calls (loader invocations)
  readonly p1LoadCalls = signal(0); // .load() calls issued by "subsystems"
  readonly p1BurstFetches = signal<number | null>(null);

  readonly p1 = signalTree({
    items: entityMap<Item, string>({
      load: () => {
        this.p1Fetches.update((n) => n + 1);
        return of(CATALOG).pipe(delay(900));
      },
      selectId: (i) => i.id,
      lazy: true,
    }),
  });

  readonly callers = [1, 2, 3, 4, 5];

  async fireBurst(): Promise<void> {
    const before = this.p1Fetches();
    this.p1.$.items.invalidate(); // make it stale so load() actually fetches
    const calls: Promise<void>[] = [];
    for (let i = 0; i < this.callers.length; i++) {
      this.p1LoadCalls.update((n) => n + 1);
      calls.push(this.p1.$.items.load()); // guarded → all but one coalesce
    }
    await Promise.all(calls);
    this.p1BurstFetches.set(this.p1Fetches() - before);
  }

  resetP1(): void {
    this.p1Fetches.set(0);
    this.p1LoadCalls.set(0);
    this.p1BurstFetches.set(null);
    this.p1.$.items.clear();
    this.p1.$.items.invalidate();
  }

  readonly p1Code: CodeFile[] = [
    {
      label: 'single-flight.ts',
      language: 'typescript',
      source: `plants: entityMap<Plant, string>({
  load: () => plantApi.list$(),   // ONE network call per fetch
  selectId: (p) => p.id,
})

// Five subsystems each ask to load — in the same tick:
tree.$.plants.load();
tree.$.plants.load();
tree.$.plants.load();   // .load() is guarded: no-op if already in-flight
tree.$.plants.load();
tree.$.plants.load();
// → the loader runs ONCE; all five callers await the same request.`,
    },
  ];

  // =========================================================================
  // PANEL 2 — staleTime: skip the refetch while fresh
  // =========================================================================
  readonly P2_STALE_MS = 8000;
  readonly p2Fetches = signal(0);
  readonly p2Log = signal<{ kind: 'fetch' | 'skip'; text: string }[]>([]);

  readonly p2 = signalTree({
    items: entityMap<Item, string>({
      load: () => {
        this.p2Fetches.update((n) => n + 1);
        return of(CATALOG).pipe(delay(500));
      },
      selectId: (i) => i.id,
      staleTime: this.P2_STALE_MS,
      lazy: true,
    }),
  });

  readonly p2Remaining = computed(() => {
    const last = this.p2.$.items.lastLoadedAt();
    if (last == null) return 0;
    return Math.max(0, (this.P2_STALE_MS - (this.now() - last)) / 1000);
  });
  readonly p2FreshPct = computed(() =>
    Math.min(1, Math.max(0, (this.p2Remaining() * 1000) / this.P2_STALE_MS))
  );
  // SVG ring geometry (r = 52 → circumference).
  readonly ringCirc = 2 * Math.PI * 52;
  readonly p2DashOffset = computed(() => this.ringCirc * (1 - this.p2FreshPct()));

  async tryLoad(): Promise<void> {
    const before = this.p2Fetches();
    const remaining = this.p2Remaining();
    await this.p2.$.items.load();
    const fetched = this.p2Fetches() > before;
    this.pushP2(
      fetched
        ? { kind: 'fetch', text: 'load() → stale, refetched from network' }
        : {
            kind: 'skip',
            text: `load() → skipped, still fresh (${remaining.toFixed(
              1
            )}s left)`,
          }
    );
  }
  forceRefresh(): void {
    this.p2.$.items.refresh();
    this.pushP2({ kind: 'fetch', text: 'refresh() → forced refetch (ignores staleTime)' });
  }
  private pushP2(entry: { kind: 'fetch' | 'skip'; text: string }): void {
    this.p2Log.update((l) => [entry, ...l].slice(0, 6));
  }

  readonly p2Code: CodeFile[] = [
    {
      label: 'stale-time.ts',
      language: 'typescript',
      source: `plants: entityMap<Plant, string>({
  load: () => plantApi.list$(),
  selectId: (p) => p.id,
  staleTime: '8s',   // ms or '30m' / '2h'. default 0 = always stale
})

tree.$.plants.load();   // fetches
tree.$.plants.load();   // < 8s later → NO-OP (served from cache)
// ...8s pass...
tree.$.plants.load();   // stale again → refetches`,
    },
  ];

  // =========================================================================
  // PANEL 3 — invalidateTag: push freshness to every tagged collection
  // =========================================================================
  readonly p3PlantFetches = signal(0);
  readonly p3SeedFetches = signal(0);
  readonly p3Invalidated = signal<number | null>(null);

  readonly p3 = signalTree({
    plants: entityMap<Item, string>({
      load: () => {
        this.p3PlantFetches.update((n) => n + 1);
        return of(CATALOG).pipe(delay(500));
      },
      selectId: (i) => i.id,
      staleTime: 600_000,
      tags: ['catalog'],
      lazy: true,
    }),
    seeds: entityMap<Item, string>({
      load: () => {
        this.p3SeedFetches.update((n) => n + 1);
        return of(SEEDS).pipe(delay(500));
      },
      selectId: (i) => i.id,
      staleTime: 600_000,
      tags: ['catalog'],
      lazy: true,
    }),
  });

  loadP3(): void {
    this.p3.$.plants.load();
    this.p3.$.seeds.load();
  }
  emitSseEvent(): void {
    this.p3Invalidated.set(invalidateTag(this.p3, 'catalog'));
  }
  refreshP3(): void {
    this.p3.$.plants.load();
    this.p3.$.seeds.load();
    this.p3Invalidated.set(null);
  }

  readonly p3Code: CodeFile[] = [
    {
      label: 'invalidate-tag.ts',
      language: 'typescript',
      source: `const tree = signalTree({
  plants: entityMap({ load: …, tags: ['catalog'] }),
  seeds:  entityMap({ load: …, tags: ['catalog'] }),
});

// An SSE / SignalR event says "the catalog changed":
source.addEventListener('catalog.changed', () => {
  invalidateTag(tree, 'catalog');   // BOTH collections go stale at once
});
// Next read (or an explicit refresh) refetches only what's stale.`,
    },
  ];

  // =========================================================================
  // PANEL 4 — swr: serve the last value while revalidating
  // =========================================================================
  readonly p4 = signalTree({
    withSwr: entityMap<Item, string>({
      load: () => of(CATALOG.slice(0, 4)).pipe(delay(1400)),
      selectId: (i) => i.id,
      swr: true,
      lazy: true,
    }),
    noSwr: entityMap<Item, string>({
      load: () => of(CATALOG.slice(0, 4)).pipe(delay(1400)),
      selectId: (i) => i.id,
      swr: false,
      lazy: true,
    }),
  });

  loadP4(): void {
    this.p4.$.withSwr.load();
    this.p4.$.noSwr.load();
  }
  revalidateP4(): void {
    this.p4.$.withSwr.invalidate();
    this.p4.$.noSwr.invalidate();
    this.p4.$.withSwr.refresh();
    this.p4.$.noSwr.refresh();
  }

  readonly p4Code: CodeFile[] = [
    {
      label: 'swr.ts',
      language: 'typescript',
      source: `entityMap({
  load: () => api.list$(),
  swr: true,    // keep serving the last value while revalidating
})
// swr:true  → rows stay on screen, subtle "revalidating…" shimmer
// swr:false → loaded() flips false → show a loading skeleton`,
    },
  ];

  // =========================================================================
  // PANEL 5 — persist: offline-first hydrate-then-revalidate
  // =========================================================================
  // Simulated IndexedDB — pre-seeded, as if a previous session cached it.
  private readonly offlineStore = new Map<string, string>([
    ['offline-items', JSON.stringify(CATALOG.slice(0, 5))],
  ]);
  private readonly offlineAdapter: EntityStorageAdapter = {
    getItem: (k) => this.offlineStore.get(k) ?? null,
    setItem: (k, v) => {
      this.offlineStore.set(k, v);
    },
    removeItem: (k) => {
      this.offlineStore.delete(k);
    },
  };

  readonly offlineTree = signal<ReturnType<typeof this.makeOfflineTree> | null>(
    null
  );

  private makeOfflineTree() {
    return signalTree({
      items: entityMap<Item, string>({
        load: () => of(CATALOG).pipe(delay(1100)),
        selectId: (i) => i.id,
        persist: {
          adapter: this.offlineAdapter,
          key: 'offline-items',
          hydrateThenRevalidate: true,
        },
      }),
    });
  }

  reloadOffline(): void {
    const t = this.makeOfflineTree();
    // First .$ access finalizes the tree: seeds cached rows synchronously,
    // marks stale, and kicks off the background revalidation.
    t.$.items.all();
    this.offlineTree.set(t);
  }

  readonly p5Code: CodeFile[] = [
    {
      label: 'offline-first.ts',
      language: 'typescript',
      source: `import { entityMap, createIndexedDBAdapter } from '@signaltree/core';

plants: entityMap<Plant, string>({
  load: () => plantApi.list$(),
  selectId: (p) => p.id,
  persist: {
    adapter: createIndexedDBAdapter(),
    key: 'plants',
    hydrateThenRevalidate: true,  // paint cached rows at t=0, revalidate in bg
  },
})
// On reload: rows appear INSTANTLY from IndexedDB (marked stale),
// then swap to fresh data when the network responds — no blank screen.`,
    },
  ];
}

function nowMs(): number {
  // Wrapper so the class field initializer stays simple; Date.now is fine here
  // (this is app code, not a workflow script).
  return Date.now();
}

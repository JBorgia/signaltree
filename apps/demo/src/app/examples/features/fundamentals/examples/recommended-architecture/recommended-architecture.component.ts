import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  type CodeFile,
  ExampleComponent,
  type StackblitzConfig,
  trackEmissions,
} from '../../../../shared/components/example-shell';
import { AppStore } from '../../../../../store';

/** Which pillar the most recent interaction exercised — drives the diagram highlight. */
type Pillar = 'read' | 'write' | 'react';

// ── Source shown in the st-example code panel (real store excerpts) ──────────

const FACADE_SOURCE = `// store/app-store.ts — the one injectable components see
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;              // READ  → store.$.<domain>.<path>()

  readonly ops = {                        // WRITE → store.ops.<domain>.<method>()
    users: inject(UserOps),
    posts: inject(PostOps),
    ui: inject(UiOps),
  };

  // Cross-domain workflows live here; single-domain logic stays in ops.
  loadDashboard$(): Observable<void> {
    return forkJoin({
      users: this.ops.users.loadUsers$(),
      posts: this.ops.posts.loadPosts$(),
    }).pipe(map(() => void 0));
  }
}`;

const OPS_SOURCE = `// store/ops/post.ops.ts — every write goes through here
@Injectable({ providedIn: 'root' })
export class PostOps {
  private readonly _api = inject(ApiService);
  private readonly _$ = inject(APP_TREE).$;

  setSearch(term: string): void {
    this._$.posts.filters.search.set(term);
  }

  // Business rule enforced in ops — not the component, not the tree.
  publishPost$(postId: number): Observable<void> {
    const post = this._$.posts.entities.byId(postId)?.();
    const author = this._$.users.entities.byId(post?.authorId)?.();
    if (author?.role !== 'admin') {
      this._$.posts.loading.error.set('Only admins can publish posts');
      return of(void 0);
    }
    return this._api.publishPost$(postId).pipe(
      tap((updated) => this._$.posts.entities.upsertOne(updated)),
      map(() => void 0)
    );
  }
}`;

const DERIVED_SOURCE = `// store/tree/derived/tier-2.derived.ts — computed on $, not in components
export const tier2Derived = derived(($) => ({
  posts: {
    // Reads search + published filter straight from the tree.
    filtered: computed(() => {
      const all = $.posts.entities.all();
      const search = $.posts.filters.search().toLowerCase();
      const publishedFilter = $.posts.filters.published();
      return all.filter((p) => {
        if (publishedFilter !== null && p.published !== publishedFilter) return false;
        return !search || p.title.toLowerCase().includes(search)
                        || p.content.toLowerCase().includes(search);
      });
    }),
  },
}));`;

/** Self-contained single-file version of the pattern for the StackBlitz playground. */
const PLAYGROUND_APP = `import { Component, computed, effect, inject, Injectable } from '@angular/core';
import { signalTree } from '@signaltree/core';

// One tree per app, assembled once.
const APP_TREE = signalTree({
  count: 0,
  history: [] as number[],
})
  .derived(($) => ({ doubled: computed(() => $.count() * 2) }));

// WRITE — mutations go through an ops service.
@Injectable({ providedIn: 'root' })
class CounterOps {
  private $ = APP_TREE.$;
  increment() { this.$.count.update((n) => n + 1); }
  reset() { this.$.count.set(0); }
}

@Component({
  selector: 'app-root',
  standalone: true,
  template: \`
    <h1>READ / WRITE / REACT</h1>
    <p>count: {{ $.count() }} · doubled: {{ $.doubled() }}</p>
    <button (click)="ops.increment()">+1</button>
    <button (click)="ops.reset()">reset</button>
    <pre>history: {{ $.history() | json }}</pre>
  \`,
})
export class AppComponent {
  readonly $ = APP_TREE.$;            // READ
  readonly ops = inject(CounterOps);  // WRITE
  constructor() {
    // REACT — the state change IS the event. No actions, no dispatch.
    effect(() => {
      const n = this.$.count();
      this.$.history.update((h) => [...h, n].slice(-5));
    });
  }
}`;

/**
 * Recommended Architecture Demo
 *
 * The canonical SignalTree production pattern (mirrors v3 trax-mobile). One
 * tree per app, and one rule applied everywhere:
 *
 *   - **READ**  → `store.$.<domain>.<path>()`     (all computed on `$`, tiered)
 *   - **WRITE** → `store.ops.<domain>.<method>()` (mutations + async only)
 *   - **REACT** → `tree.effect()`                 (state changes are the events)
 *
 * API services are a *supporting* layer beneath those three — HTTP only, no
 * state knowledge. The interactive demo is hosted in the shared `st-example`
 * shell, which supplies the live-state inspector, emission log, source viewer,
 * and StackBlitz playground.
 */
@Component({
  selector: 'app-recommended-architecture',
  standalone: true,
  imports: [FormsModule, ExampleComponent],
  templateUrl: './recommended-architecture.component.html',
  styleUrl: './recommended-architecture.component.scss',
})
export class RecommendedArchitectureComponent {
  readonly store = inject(AppStore);

  /** The pillar exercised by the last interaction — highlights the diagram. */
  readonly lastPillar = signal<Pillar>('read');

  // ── READ — everything below is `store.$.<path>()` ──────────────────────────

  readonly theme = this.store.$.ui.theme;
  readonly sidebarOpen = this.store.$.ui.sidebarOpen;

  readonly allUsers = computed(() => this.store.$.users.entities.all());
  readonly selectedUserId = this.store.$.users.selectedId;
  readonly selectedUser = this.store.$.users.selected;

  readonly searchTerm = this.store.$.posts.filters.search;
  readonly publishedOnly = computed(
    () => this.store.$.posts.filters.published() === true
  );
  readonly filteredPosts = this.store.$.posts.filtered;
  readonly selectedPostId = this.store.$.posts.selectedId;
  readonly selectedPost = this.store.$.posts.selected;

  readonly totals = this.store.$.ui.totals;
  readonly isLoading = this.store.$.ui.isLoading;
  readonly firstError = this.store.$.ui.firstError;

  readonly canPublishSelected = this.store.$.posts.canPublishSelected;

  /** Live snapshot for the st-example state inspector. */
  readonly stateSnapshot = computed(() => ({
    ui: {
      theme: this.store.$.ui.theme(),
      sidebarOpen: this.store.$.ui.sidebarOpen(),
    },
    users: {
      total: this.totals().users,
      selected: this.store.$.users.selected()?.name ?? null,
    },
    posts: {
      filters: {
        search: this.store.$.posts.filters.search(),
        publishedOnly: this.publishedOnly(),
      },
      shown: this.totals().filteredPosts,
      total: this.totals().posts,
      selected: this.store.$.posts.selected()?.title ?? null,
    },
  }));

  /** REACT — signal emissions, fed to the st-example emission log. */
  readonly emissions = trackEmissions({
    'ui.theme': () => this.store.$.ui.theme(),
    'users.selected': () => this.store.$.users.selected()?.name ?? null,
    'posts.selected': () => this.store.$.posts.selected()?.title ?? null,
    'posts.filtered': () => this.totals().filteredPosts,
  });

  /** Source tabs for the st-example code viewer. */
  readonly codeFiles: CodeFile[] = [
    { label: 'app-store.ts', language: 'typescript', source: FACADE_SOURCE },
    { label: 'post.ops.ts', language: 'typescript', source: OPS_SOURCE },
    { label: 'tier-2.derived.ts', language: 'typescript', source: DERIVED_SOURCE },
  ];

  /** StackBlitz playground config. */
  readonly stackblitzConfig: StackblitzConfig = {
    title: 'SignalTree — READ / WRITE / REACT',
    description: 'The recommended one-tree architecture, self-contained.',
    files: { 'src/app/app.component.ts': PLAYGROUND_APP },
  };

  constructor() {
    // First visit lands on an empty tree — load the dashboard so there's
    // something live. `AppStore` is a root singleton, so on revisits the data
    // is already there; don't refetch.
    if (this.store.$.users.entities.all().length === 0) {
      this.loadDashboard();
    }

    // REACT: selection changes drive the diagram's REACT-pillar highlight.
    effect(() => {
      const touched =
        this.store.$.users.selected() || this.store.$.posts.selected();
      if (touched) this.pillar('react');
    });
  }

  // ── WRITE — every mutation goes through `store.ops.*` ───────────────────────

  toggleTheme(): void {
    this.pillar('write');
    this.store.ops.ui.toggleTheme();
  }

  toggleSidebar(): void {
    this.pillar('write');
    this.store.ops.ui.toggleSidebar();
  }

  selectUser(id: number): void {
    this.pillar('write');
    this.store.ops.users.setSelected(id);
  }

  selectPost(id: number): void {
    this.pillar('write');
    this.store.ops.posts.setSelected(id);
  }

  setSearch(term: string): void {
    this.pillar('write');
    this.store.ops.posts.setSearch(term);
  }

  togglePublishedFilter(): void {
    this.pillar('write');
    this.store.ops.posts.togglePublishedFilter();
  }

  loadDashboard(): void {
    this.pillar('write');
    this.store.loadDashboard$().subscribe();
  }

  deleteSelectedUser(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.pillar('write');
    const userPosts = this.store.$.posts.entities
      .all()
      .filter((p) => p.authorId === user.id)
      .map((p) => p.id);

    // SignalTree v9+ auto-batches sequential mutations on the same tick.
    this.store.ops.posts.removeMany(userPosts);
    this.store.ops.users.remove(user.id);
  }

  publishSelected(): void {
    const post = this.selectedPost();
    if (!post) return;
    this.pillar('write');
    this.store.ops.posts.publishPost$(post.id).subscribe();
  }

  authorName(authorId: number): string {
    return this.store.$.users.entities.byId(authorId)?.()?.name ?? 'Unknown';
  }

  /** Flags the active pillar so the architecture diagram can highlight it. */
  private pillar(p: Pillar): void {
    this.lastPillar.set(p);
  }
}

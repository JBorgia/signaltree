import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppStore } from '../../../../../store';

/**
 * Recommended Architecture Demo
 *
 * Showcases the canonical SignalTree pattern used in production
 * (v3 trax-mobile). Two rules:
 *
 *   1. **Reads** go through `store.$.<domain>.<path>()`
 *   2. **Writes / async** go through `store.ops.<domain>.<method>()`
 *
 * The store itself is split into:
 *   - `store/tree/state/*.state.ts` — initial state per domain
 *   - `store/tree/derived/tier-*.derived.ts` — layered computed signals
 *   - `store/tree/app-tree.ts` — assembly + enhancers
 *   - `store/ops/*.ops.ts` — mutations + async per domain
 *   - `store/app-store.ts` — thin facade (`$` + `ops`)
 */
@Component({
  selector: 'app-recommended-architecture',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="demo-container" [class.dark]="theme() === 'dark'">
      <h1>Recommended Architecture Demo</h1>
      <p class="description">
        The 3-pillar pattern: <strong>READ</strong> via <code>.derived()</code>
        (all computed on <code>$</code>), <strong>WRITE</strong> via Ops services
        (mutations + async only), <strong>REACT</strong> via
        <code>tree.effect()</code> (state changes are the events). One rule,
        consistently applied.
      </p>

      <div class="demo-sections">
        <section class="section">
          <h3>1. Reads via <code>$</code>, writes via <code>ops</code></h3>
          <p class="section-desc">
            Components read state directly from the tree. All mutations go
            through ops services so async logic, validation, and side effects
            live in one place per domain. Click the buttons — the panel below
            updates in real time so you can see the tree drive the DOM.
          </p>

          <div class="controls">
            <button class="btn" (click)="store.ops.ui.toggleTheme()">
              Toggle Theme: {{ theme() }}
            </button>
            <button class="btn" (click)="store.ops.ui.toggleSidebar()">
              Sidebar: {{ sidebarOpen() ? 'Open' : 'Closed' }}
            </button>
          </div>

          <div class="ui-state-preview">
            <div class="ui-state-preview__main">
              <strong>Theme:</strong> {{ theme() }} — the panel border + colors
              react to <code>$.ui.theme</code>.
            </div>
            @if (sidebarOpen()) {
              <aside class="ui-state-preview__sidebar">
                <strong>Demo sidebar</strong>
                <p>
                  Driven by <code>$.ui.sidebarOpen</code>. Click
                  <em>Sidebar: Open</em> again to hide.
                </p>
              </aside>
            }
          </div>
        </section>

        <section class="section">
          <h3>2. Cross-domain async on the store</h3>
          <p class="section-desc">
            Single-domain async lives in its ops service. Cross-domain
            workflows that touch multiple slices live as orchestration methods
            on <code>AppStore</code>.
          </p>

          <div class="controls">
            <button
              class="btn"
              [disabled]="isLoading()"
              (click)="loadDashboard()"
            >
              {{ isLoading() ? 'Loading…' : 'Load Dashboard (users + posts)' }}
            </button>
            <button
              class="btn danger"
              [disabled]="!selectedUser()"
              (click)="deleteSelectedUser()"
            >
              Delete Selected User + Posts
            </button>
          </div>

          @if (firstError()) {
            <div class="error">{{ firstError() }}</div>
          }
        </section>

        <section class="section">
          <h3>3. Reactive reads (tier 1 + tier 2 in action)</h3>
          <p class="section-desc">
            <code>$.users.selected()</code> is a tier-1 derived signal — no
            manual lookup in the component.
            <code>$.posts.filtered()</code> is tier 2 and reads search +
            published filter from the tree automatically.
          </p>

          <div class="state-grid">
            <div class="state-section">
              <h4>Users ({{ totals().users }})</h4>
              @for (user of allUsers(); track user.id) {
                <div
                  class="item"
                  [class.selected]="user.id === selectedUserId()"
                  (click)="store.ops.users.setSelected(user.id)"
                  (keydown.enter)="store.ops.users.setSelected(user.id)"
                  tabindex="0"
                  role="button"
                >
                  <strong>{{ user.name }}</strong> ({{ user.role }})
                  <br /><small>{{ user.email }}</small>
                </div>
              }
            </div>

            <div class="state-section">
              <h4>
                Posts ({{ totals().filteredPosts }} / {{ totals().posts }})
              </h4>
              <div class="filters">
                <input
                  class="search-input"
                  type="text"
                  placeholder="Search posts…"
                  [value]="searchTerm()"
                  (input)="store.ops.posts.setSearch($any($event.target).value)"
                />
                <label>
                  <input
                    type="checkbox"
                    [checked]="publishedOnly()"
                    (change)="store.ops.posts.togglePublishedFilter()"
                  />
                  Published only
                </label>
              </div>

              @for (post of filteredPosts(); track post.id) {
                <div
                  class="item post-item"
                  [class.selected]="post.id === selectedPostId()"
                  (click)="store.ops.posts.setSelected(post.id)"
                  (keydown.enter)="store.ops.posts.setSelected(post.id)"
                  tabindex="0"
                  role="button"
                >
                  <div class="post-header">
                    <strong>{{ post.title }}</strong>
                    <span class="status" [class.published]="post.published">
                      {{ post.published ? 'Published' : 'Draft' }}
                    </span>
                  </div>
                  <div class="post-meta">
                    By {{ authorName(post.authorId) }} • {{ post.likes }} likes
                  </div>
                  <div class="post-content">{{ post.content }}</div>
                </div>
              }

              @if (selectedPost()) {
                <button
                  class="btn"
                  [disabled]="!canPublishSelected()"
                  (click)="publishSelected()"
                >
                  Publish Selected Post
                </button>
              }
            </div>
          </div>
        </section>

        <section class="section explanation">
          <h3>4. The 3-pillar architecture</h3>
          <div class="architecture-diagram">
            <div class="layer pillar-read">
              <h4>READ — <code>.derived()</code></h4>
              <ul>
                <li>All computed state on <code>$</code></li>
                <li>Tiered (entity → filter → UI)</li>
                <li>Never in Ops or components</li>
              </ul>
            </div>
            <div class="layer pillar-write">
              <h4>WRITE — Ops services</h4>
              <ul>
                <li>Mutations &amp; async only</li>
                <li>No computed properties</li>
                <li>One file per domain</li>
              </ul>
            </div>
            <div class="layer pillar-react">
              <h4>REACT — <code>tree.effect()</code></h4>
              <ul>
                <li>State changes are the events</li>
                <li>No actions, no dispatch</li>
                <li>Registered in root services</li>
              </ul>
            </div>
            <div class="layer">
              <h4>API services</h4>
              <ul>
                <li>HTTP only</li>
                <li>Return typed observables</li>
                <li>No state knowledge</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [
    `
      .demo-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        transition: background 0.25s ease, color 0.25s ease;
        border-radius: 12px;
      }
      .demo-container.dark {
        background: #1a1d24;
        color: #e6e6e6;
      }
      .demo-container.dark .description {
        color: #c1c8d6;
      }
      .demo-container.dark .section {
        background: #232730;
        border-color: #3a3f4a;
      }
      .demo-container.dark .section h3,
      .demo-container.dark .section h4 {
        color: #f0f0f0;
      }
      .demo-container.dark .section-desc,
      .demo-container.dark .post-meta,
      .demo-container.dark .post-content {
        color: #c1c8d6;
      }
      .demo-container.dark .state-section {
        background: #2a2f3a;
        border-color: #3a3f4a;
      }
      .demo-container.dark .item {
        border-color: #3a3f4a;
      }
      .demo-container.dark .item:hover {
        background: #323847;
      }
      .demo-container.dark .item.selected {
        background: #1d3557;
        border-color: #4dabf7;
      }
      .demo-container.dark .btn {
        background: transparent;
        color: #4dabf7;
        border-color: #4dabf7;
      }
      .demo-container.dark .btn:hover:not(:disabled) {
        background: #4dabf7;
        color: #1a1d24;
      }
      .demo-container.dark .search-input {
        background: #1a1d24;
        color: #e6e6e6;
        border-color: #3a3f4a;
      }
      .description {
        color: #666;
        margin-bottom: 30px;
        font-style: italic;
      }
      .ui-state-preview {
        margin-top: 18px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 14px 16px;
        border: 1px dashed #007acc;
        border-radius: 6px;
        background: rgba(0, 122, 204, 0.06);
      }
      .demo-container.dark .ui-state-preview {
        border-color: #4dabf7;
        background: rgba(77, 171, 247, 0.12);
      }
      .ui-state-preview__sidebar {
        padding: 12px 14px;
        border-left: 4px solid #007acc;
        background: white;
        border-radius: 4px;
      }
      .demo-container.dark .ui-state-preview__sidebar {
        background: #2a2f3a;
        border-left-color: #4dabf7;
        color: #e6e6e6;
      }
      .ui-state-preview__sidebar p {
        margin: 6px 0 0;
        font-size: 0.9em;
      }
      .demo-sections {
        display: flex;
        flex-direction: column;
        gap: 30px;
      }
      .section {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 20px;
        background: #fafafa;
      }
      .section h3 {
        margin-top: 0;
        color: #333;
        border-bottom: 2px solid #007acc;
        padding-bottom: 8px;
      }
      .section-desc {
        color: #555;
        margin: 0 0 12px;
        font-size: 0.95em;
      }
      .section-desc code,
      .layer code {
        background: #e8edf3;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 0.9em;
        color: #333;
      }
      .controls {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 15px;
      }
      .btn {
        padding: 8px 16px;
        border: 1px solid #007acc;
        background: white;
        color: #007acc;
        border-radius: 4px;
        cursor: pointer;
      }
      .btn:hover:not(:disabled) {
        background: #007acc;
        color: white;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn.danger {
        border-color: #dc3545;
        color: #dc3545;
      }
      .btn.danger:hover:not(:disabled) {
        background: #dc3545;
        color: white;
      }
      .error {
        color: #dc3545;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        padding: 8px;
        border-radius: 4px;
        margin: 10px 0;
      }
      .state-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 20px;
      }
      .state-section {
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 15px;
      }
      .state-section h4 {
        margin-top: 0;
        color: #555;
        border-bottom: 1px solid #eee;
        padding-bottom: 5px;
      }
      .filters {
        margin-bottom: 15px;
        display: flex;
        gap: 15px;
        align-items: center;
      }
      .search-input {
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        flex: 1;
      }
      .item {
        padding: 10px;
        border: 1px solid #eee;
        border-radius: 4px;
        margin-bottom: 8px;
        cursor: pointer;
      }
      .item:hover {
        background: #f8f9fa;
      }
      .item.selected {
        background: #e3f2fd;
        border-color: #007acc;
      }
      .post-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }
      .status {
        font-size: 0.8em;
        padding: 2px 6px;
        border-radius: 3px;
        background: #dc3545;
        color: white;
      }
      .status.published {
        background: #28a745;
      }
      .post-meta {
        font-size: 0.9em;
        color: #666;
        margin-bottom: 8px;
      }
      .post-content {
        font-size: 0.9em;
        color: #555;
      }
      .explanation {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .explanation h3 {
        color: white;
        border-bottom-color: rgba(255, 255, 255, 0.3);
      }
      .architecture-diagram {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        margin-top: 20px;
      }
      .layer {
        flex: 1;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 15px;
      }
      .layer h4 {
        margin-top: 0;
        color: white;
        text-align: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.3);
        padding-bottom: 8px;
      }
      .layer ul {
        margin: 10px 0 0 0;
        padding-left: 20px;
      }
      .layer li {
        margin-bottom: 5px;
        font-size: 0.9em;
      }
      @media (max-width: 768px) {
        .state-grid,
        .architecture-diagram {
          grid-template-columns: 1fr;
          flex-direction: column;
        }
        .controls {
          flex-direction: column;
        }
        .btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class RecommendedArchitectureComponent {
  readonly store = inject(AppStore);

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

  loadDashboard(): void {
    this.store.loadDashboard$().subscribe();
  }

  deleteSelectedUser(): void {
    const user = this.selectedUser();
    if (!user) return;
    const userPosts = this.store.$.posts.entities
      .all()
      .filter((p) => p.authorId === user.id)
      .map((p) => p.id);

    // SignalTree v9 auto-batches sequential mutations on the same tick.
    this.store.ops.posts.removeMany(userPosts);
    this.store.ops.users.remove(user.id);
  }

  publishSelected(): void {
    const post = this.selectedPost();
    if (!post) return;
    this.store.ops.posts.publishPost$(post.id).subscribe();
  }

  authorName(authorId: number): string {
    return this.store.$.users.entities.byId(authorId)?.()?.name ?? 'Unknown';
  }
}

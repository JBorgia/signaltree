import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { batching, entityMap, signalTree } from '@signaltree/core';

import type { EntityMapMarker } from '@signaltree/core';

// Domain Models
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  published: boolean;
  likes: number;
  createdAt: Date;
}

// Global App Tree - Single source of truth
export interface AppState {
  users: {
    entities: EntityMapMarker<User, number>;
    loading: boolean;
    error: string | null;
    selectedUserId: number | null;
  };
  posts: {
    entities: EntityMapMarker<Post, number>;
    loading: boolean;
    error: string | null;
    filters: {
      authorId: number | null;
      published: boolean | null;
      search: string;
    };
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
  };
}

// Global App Tree Service - Injectable service for the global tree
@Injectable({ providedIn: 'root' })
export class AppTreeService {
  readonly tree = signalTree<AppState>({
    users: {
      entities: entityMap<User, number>({ selectId: (user) => user.id }),
      loading: false,
      error: null,
      selectedUserId: null,
    },
    posts: {
      entities: entityMap<Post, number>({ selectId: (post) => post.id }),
      loading: false,
      error: null,
      filters: {
        authorId: null,
        published: null,
        search: '',
      },
    },
    ui: {
      theme: 'light',
      sidebarOpen: false,
    },
  }).with(batching());

  // Expose state slices as public signals
  readonly users = this.tree.$.users;
  readonly posts = this.tree.$.posts;
  readonly ui = this.tree.$.ui;
}

// Selective Facade - Only for orchestrated operations
@Injectable({ providedIn: 'root' })
export class ContentManagementFacade {
  private appTreeService = inject(AppTreeService);

  // Complex orchestration: Load user + their posts together
  async loadUserWithPosts(userId: number) {
    try {
      this.appTreeService.users.loading.set(true);
      this.appTreeService.posts.loading.set(true);

      // Simulate API calls
      await new Promise((resolve) => setTimeout(resolve, 500));

      const user: User = {
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`,
        role: userId === 1 ? 'admin' : 'user',
      };

      const posts: Post[] = Array.from({ length: 3 }, (_, i) => ({
        id: userId * 100 + i,
        title: `Post ${i + 1} by User ${userId}`,
        content: `This is post content ${i + 1}...`,
        authorId: userId,
        published: i < 2,
        likes: Math.floor(Math.random() * 50),
        createdAt: new Date(),
      }));

      // Batch update for atomicity
      this.appTreeService.tree.batch(() => {
        this.appTreeService.users.entities.addOne(user);
        this.appTreeService.users.selectedUserId.set(userId);
        posts.forEach((post) =>
          this.appTreeService.posts.entities.addOne(post)
        );
      });
    } catch {
      this.appTreeService.users.error.set('Failed to load user');
      this.appTreeService.posts.error.set('Failed to load posts');
    } finally {
      this.appTreeService.users.loading.set(false);
      this.appTreeService.posts.loading.set(false);
    }
  }

  // Business logic: Publish post with validation
  async publishPost(postId: number) {
    const postNode = this.appTreeService.posts.entities.byId(postId);
    const post = postNode ? postNode() : null;
    if (!post) throw new Error('Post not found');

    // Business rule: Only admins can publish posts
    const authorNode = this.appTreeService.users.entities.byId(post.authorId);
    const author = authorNode ? authorNode() : null;
    if (author?.role !== 'admin') {
      throw new Error('Only admins can publish posts');
    }

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 300));

    this.appTreeService.posts.entities.updateOne(postId, { published: true });
  }

  // Cross-domain operation: Delete user and all their posts
  async deleteUser(userId: number) {
    const userPosts = this.appTreeService.posts.entities
      .all()
      .filter((post) => post.authorId === userId);

    this.appTreeService.tree.batch(() => {
      this.appTreeService.users.entities.removeOne(userId);
      userPosts.forEach((post) =>
        this.appTreeService.posts.entities.removeOne(post.id)
      );
      if (this.appTreeService.users.selectedUserId() === userId) {
        this.appTreeService.users.selectedUserId.set(null);
      }
    });
  }
}

// API Service - HTTP concerns only
@Injectable({ providedIn: 'root' })
export class ApiService {
  // In real app, this would make HTTP calls
  async getUsers(): Promise<User[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [
      { id: 1, name: 'Alice Admin', email: 'alice@example.com', role: 'admin' },
      { id: 2, name: 'Bob User', email: 'bob@example.com', role: 'user' },
      {
        id: 3,
        name: 'Carol Mod',
        email: 'carol@example.com',
        role: 'moderator',
      },
    ];
  }

  async getPosts(): Promise<Post[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [
      {
        id: 101,
        title: 'Welcome Post',
        content: 'Welcome to our platform!',
        authorId: 1,
        published: true,
        likes: 25,
        createdAt: new Date(),
      },
      {
        id: 102,
        title: 'Getting Started',
        content: "Here's how to get started...",
        authorId: 1,
        published: true,
        likes: 15,
        createdAt: new Date(),
      },
      {
        id: 201,
        title: 'My First Post',
        content: 'Hello world!',
        authorId: 2,
        published: false,
        likes: 3,
        createdAt: new Date(),
      },
    ];
  }
}

@Component({
  selector: 'app-recommended-architecture',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="demo-container">
      <h2>Recommended Architecture Demo</h2>
      <p class="description">
        This demo shows the recommended SignalTree architecture: Global tree +
        selective facades + direct component access. Each section includes the
        code that powers it.
      </p>

      <div class="demo-sections">
        <!-- Direct Tree Access Section -->
        <section class="section">
          <h3>1. Direct Tree Access (Simple Operations)</h3>
          <p class="section-desc">
            For simple state mutations, inject the tree directly and call
            <code>.set()</code> or <code>.update()</code>. No facade needed.
          </p>
          <div class="controls">
            <button (click)="toggleTheme()" class="btn">
              Toggle Theme: {{ tree.$.ui.theme() }}
            </button>
            <button (click)="toggleSidebar()" class="btn">
              Sidebar: {{ tree.$.ui.sidebarOpen() ? 'Open' : 'Closed' }}
            </button>
          </div>
          <details class="code-block">
            <summary>View Code</summary>
            <pre><code>// Direct tree access — no facade needed for simple mutations
toggleTheme() &#123;
  this.tree.$.ui.theme.update(t => t === 'light' ? 'dark' : 'light');
&#125;

toggleSidebar() &#123;
  this.tree.$.ui.sidebarOpen.update(open => !open);
&#125;</code></pre>
          </details>
        </section>

        <!-- Facade Orchestration Section -->
        <section class="section">
          <h3>2. Facade Orchestration (Complex Operations)</h3>
          <p class="section-desc">
            Use a facade when the operation spans multiple domains, involves
            async calls, or enforces business rules.
          </p>
          <div class="controls">
            <button
              (click)="loadUserWithPosts()"
              class="btn"
              [disabled]="usersLoading()"
            >
              Load User + Posts
            </button>
            <button
              (click)="publishPost()"
              class="btn"
              [disabled]="!selectedPost()"
            >
              Publish Selected Post
            </button>
            <button
              (click)="deleteSelectedUser()"
              class="btn danger"
              [disabled]="!selectedUser()"
            >
              Delete User + Posts
            </button>
          </div>
          <details class="code-block">
            <summary>View Facade Code</summary>
            <pre><code>&#64;Injectable(&#123; providedIn: 'root' &#125;)
export class ContentManagementFacade &#123;
  private tree = inject(APP_TREE);

  // Cross-domain operation: load user + their posts atomically
  async loadUserWithPosts(userId: number) &#123;
    this.tree.$.users.loading.set(true);
    this.tree.$.posts.loading.set(true);

    const [user, posts] = await Promise.all([
      this.api.getUser(userId),
      this.api.getPosts(userId),
    ]);

    // Batch update — one change notification, not many
    this.tree.batch(() => &#123;
      this.tree.$.users.entities.addOne(user);
      this.tree.$.users.selectedUserId.set(userId);
      posts.forEach(p => this.tree.$.posts.entities.addOne(p));
    &#125;);

    this.tree.$.users.loading.set(false);
    this.tree.$.posts.loading.set(false);
  &#125;

  // Business rule: only admins can publish
  async publishPost(postId: number) &#123;
    const post = this.tree.$.posts.entities.byId(postId)?.();
    const author = this.tree.$.users.entities.byId(post.authorId)?.();
    if (author?.role !== 'admin') throw new Error('Only admins can publish');
    this.tree.$.posts.entities.updateOne(postId, &#123; published: true &#125;);
  &#125;
&#125;</code></pre>
          </details>
        </section>

        <!-- State Display Section -->
        <section class="section">
          <h3>3. State Display (Reactive Reads)</h3>
          <p class="section-desc">
            Components read state via <code>tree.$.path()</code> and use
            <code>computed()</code> for derived values. All updates are
            automatic.
          </p>

          <div class="state-grid">
            <div class="state-section">
              <h4>Users ({{ allUsers().length }})</h4>
              @if (usersLoading()) {
                <div class="loading">Loading users...</div>
              }
              @if (usersError()) {
                <div class="error">{{ usersError() }}</div>
              }
              <div class="items">
                @for (user of allUsers(); track user.id) {
                  <div
                    class="item"
                    [class.selected]="user.id === selectedUserId()"
                    (click)="selectUser(user.id)"
                    (keydown.enter)="selectUser(user.id)"
                    tabindex="0"
                    role="button"
                  >
                    <strong>{{ user.name }}</strong> ({{ user.role }})
                    <br /><small>{{ user.email }}</small>
                  </div>
                }
              </div>
            </div>

            <div class="state-section">
              <h4>Posts ({{ filteredPosts().length }})</h4>
              @if (postsLoading()) {
                <div class="loading">Loading posts...</div>
              }
              @if (postsError()) {
                <div class="error">{{ postsError() }}</div>
              }
              <div class="filters">
                <input
                  type="text"
                  placeholder="Search posts..."
                  [value]="searchTerm()"
                  (input)="updateSearch($any($event.target).value)"
                  class="search-input"
                />
                <label>
                  <input
                    type="checkbox"
                    [checked]="showPublishedOnly()"
                    (change)="togglePublishedFilter()"
                  />
                  Published only
                </label>
              </div>
              <div class="items">
                @for (post of filteredPosts(); track post.id) {
                  <div
                    class="item post-item"
                    [class.selected]="post.id === selectedPostId()"
                    (click)="selectPost(post.id)"
                    (keydown.enter)="selectPost(post.id)"
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
                      By {{ getAuthorName(post.authorId) }} •
                      {{ post.likes }} likes
                    </div>
                    <div class="post-content">{{ post.content }}</div>
                  </div>
                }
              </div>
            </div>
          </div>

          <details class="code-block">
            <summary>View Component Code</summary>
            <pre><code>&#64;Component(&#123; ... &#125;)
export class MyComponent &#123;
  private tree = inject(APP_TREE);
  private facade = inject(ContentManagementFacade);

  // Reactive reads — auto-update when tree changes
  allUsers = computed(() => this.tree.$.users.entities.all());
  selectedUser = computed(() => &#123;
    const id = this.tree.$.users.selectedUserId();
    return id ? this.tree.$.users.entities.byId(id)?.() : null;
  &#125;);

  filteredPosts = computed(() => &#123;
    const posts = this.tree.$.posts.entities.all();
    const search = this.tree.$.posts.filters.search().toLowerCase();
    return posts.filter(p =>
      !search || p.title.toLowerCase().includes(search)
    );
  &#125;);

  // Simple mutations — direct tree access
  selectUser(id: number) &#123;
    this.tree.$.users.selectedUserId.set(id);
  &#125;

  // Complex operations — delegate to facade
  loadUserWithPosts() &#123;
    this.facade.loadUserWithPosts(1);
  &#125;
&#125;</code></pre>
          </details>
        </section>

        <!-- Tree Definition Section -->
        <section class="section">
          <h3>4. Global Tree Definition</h3>
          <p class="section-desc">
            The tree declares all shared state as a single typed JSON structure.
            <code>entityMap()</code> markers provide CRUD operations.
            <code>batching()</code> groups rapid mutations into a single change event.
          </p>
          <details class="code-block" open>
            <summary>View Tree Code</summary>
            <pre><code>export const APP_TREE = new InjectionToken('AppTree');

export function createAppTree() &#123;
  return signalTree(&#123;
    users: &#123;
      entities: entityMap&lt;User, number&gt;(&#123;
        selectId: u => u.id
      &#125;),
      loading: false,
      error: null as string | null,
      selectedUserId: null as number | null,
    &#125;,
    posts: &#123;
      entities: entityMap&lt;Post, number&gt;(&#123;
        selectId: p => p.id
      &#125;),
      loading: false,
      error: null as string | null,
      filters: &#123;
        search: '',
        published: null as boolean | null,
      &#125;,
    &#125;,
    ui: &#123;
      theme: 'light' as 'light' | 'dark',
      sidebarOpen: false,
    &#125;,
  &#125;).with(batching());
&#125;</code></pre>
          </details>
        </section>

        <!-- Architecture Explanation -->
        <section class="section explanation">
          <h3>5. Architecture Summary</h3>
          <div class="architecture-diagram">
            <div class="layer">
              <h4>Components</h4>
              <ul>
                <li>Inject tree directly for reads</li>
                <li>Inject facades for complex ops</li>
                <li>Use local signals for UI-only state</li>
              </ul>
            </div>
            <div class="layer">
              <h4>Facades (Selective)</h4>
              <ul>
                <li>Multi-step workflows</li>
                <li>Cross-domain coordination</li>
                <li>Business rule validation</li>
              </ul>
            </div>
            <div class="layer">
              <h4>Global Tree</h4>
              <ul>
                <li>All shared state</li>
                <li>Entities with entityMap()</li>
                <li>Unified dot notation access</li>
              </ul>
            </div>
            <div class="layer">
              <h4>API Services</h4>
              <ul>
                <li>HTTP calls only</li>
                <li>No state management</li>
                <li>Return typed data</li>
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
      }

      .description {
        color: #666;
        margin-bottom: 30px;
        font-style: italic;
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
        transition: all 0.2s;
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

      .loading {
        color: #007acc;
        font-style: italic;
        margin-bottom: 10px;
      }

      .error {
        color: #dc3545;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 10px;
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

      .items {
        max-height: 400px;
        overflow-y: auto;
      }

      .item {
        padding: 10px;
        border: 1px solid #eee;
        border-radius: 4px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .item:hover {
        background: #f8f9fa;
      }

      .item.selected {
        background: #e3f2fd;
        border-color: #007acc;
      }

      .post-item {
        cursor: pointer;
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
        backdrop-filter: blur(10px);
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
        .state-grid {
          grid-template-columns: 1fr;
        }

        .architecture-diagram {
          flex-direction: column;
        }

        .controls {
          flex-direction: column;
        }

        .btn {
          width: 100%;
        }
      }

      .section-desc {
        color: #555;
        margin: 0 0 12px;
        font-size: 0.95em;
      }

      .code-block {
        margin-top: 16px;
        border: 1px solid #ddd;
        border-radius: 6px;
        overflow: hidden;
      }

      .code-block summary {
        padding: 10px 14px;
        background: #f0f4f8;
        cursor: pointer;
        font-weight: 600;
        color: #333;
        font-size: 0.9em;
        user-select: none;
      }

      .code-block summary:hover {
        background: #e2e8f0;
      }

      .code-block pre {
        margin: 0;
        padding: 16px;
        background: #1e1e2e;
        color: #cdd6f4;
        overflow-x: auto;
        font-size: 0.85em;
        line-height: 1.5;
      }

      .code-block code {
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      }

      .section-desc code {
        background: #e8edf3;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 0.9em;
        color: #333;
      }
    `,
  ],
})
export class RecommendedArchitectureComponent {
  // Inject services
  private appTreeService = inject(AppTreeService);
  facade = inject(ContentManagementFacade);
  api = inject(ApiService);

  // Expose tree for template access
  tree = this.appTreeService.tree;

  // Local UI state (not in global tree)
  selectedPostId = signal<number | null>(null);

  // Reactive reads from global tree
  allUsers = computed(() => this.appTreeService.users.entities.all());
  selectedUserId = computed(() => this.appTreeService.users.selectedUserId());
  selectedUser = computed(() => {
    const id = this.selectedUserId();
    if (!id) return null;
    const userNode = this.appTreeService.users.entities.byId(id);
    return userNode ? userNode() : null;
  });

  allPosts = computed(() => this.appTreeService.posts.entities.all());
  searchTerm = computed(() => this.appTreeService.posts.filters.search());
  showPublishedOnly = computed(
    () => this.appTreeService.posts.filters.published() === true
  );

  filteredPosts = computed(() => {
    const posts = this.allPosts();
    const search = this.searchTerm().toLowerCase();
    const publishedOnly = this.showPublishedOnly();

    return posts.filter((post) => {
      const matchesSearch =
        !search ||
        post.title.toLowerCase().includes(search) ||
        post.content.toLowerCase().includes(search);
      const matchesPublished = !publishedOnly || post.published;
      return matchesSearch && matchesPublished;
    });
  });

  selectedPost = computed(() => {
    const id = this.selectedPostId();
    if (!id) return null;
    const postNode = this.tree.$.posts.entities.byId(id);
    return postNode ? postNode() : null;
  });

  usersLoading = computed(() => this.appTreeService.users.loading());
  usersError = computed(() => this.appTreeService.users.error());
  postsLoading = computed(() => this.appTreeService.posts.loading());
  postsError = computed(() => this.appTreeService.posts.error());

  // Direct tree access for simple operations
  toggleTheme() {
    this.appTreeService.ui.theme.update((theme) =>
      theme === 'light' ? 'dark' : 'light'
    );
  }

  toggleSidebar() {
    this.appTreeService.ui.sidebarOpen.update((open) => !open);
  }

  selectUser(userId: number) {
    this.appTreeService.users.selectedUserId.set(userId);
  }

  selectPost(postId: number) {
    this.selectedPostId.set(postId);
  }

  updateSearch(term: string) {
    this.appTreeService.posts.filters.search.set(term);
  }

  togglePublishedFilter() {
    const current = this.appTreeService.posts.filters.published();
    this.appTreeService.posts.filters.published.set(
      current === true ? null : true
    );
  }

  // Facade orchestration for complex operations
  async loadUserWithPosts() {
    await this.facade.loadUserWithPosts(1);
  }

  async publishPost() {
    const post = this.selectedPost();
    if (post) {
      try {
        await this.facade.publishPost(post.id);
        alert('Post published successfully!');
      } catch (error) {
        alert(`Failed to publish post: ${error}`);
      }
    }
  }

  async deleteSelectedUser() {
    const user = this.selectedUser();
    if (user && confirm(`Delete user "${user.name}" and all their posts?`)) {
      await this.facade.deleteUser(user.id);
    }
  }

  getAuthorName(authorId: number): string {
    const authorNode = this.appTreeService.users.entities.byId(authorId);
    const author = authorNode ? authorNode() : null;
    return author?.name || 'Unknown';
  }
}

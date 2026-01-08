import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  entities,
  entityMap,
  LoadingState,
  signalTree,
  status,
  stored,
} from '@signaltree/core';

interface User {
  id: number;
  name: string;
  email: string;
}

interface MarkersState {
  // Status marker for async operations
  users: {
    entities: ReturnType<typeof entityMap<User, number>>;
    status: ReturnType<typeof status<Error>>;
  };

  // Stored markers for persistence
  theme: ReturnType<typeof stored<'light' | 'dark'>>;
  fontSize: ReturnType<typeof stored<number>>;
  lastViewedUserId: ReturnType<typeof stored<number | null>>;
}

@Component({
  selector: 'app-markers-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './markers-demo.component.html',
  styleUrls: ['./markers-demo.component.scss'],
})
export class MarkersDemoComponent {
  // LoadingState enum for template
  LoadingState = LoadingState;

  store = signalTree<MarkersState>({
    users: {
      entities: entityMap<User, number>({ selectId: (u) => u.id }),
      status: status<Error>(),
    },
    theme: stored<'light' | 'dark'>('demo-theme', 'light'),
    fontSize: stored('demo-fontSize', 14),
    lastViewedUserId: stored<number | null>('demo-lastViewedUserId', null),
  }).derived(($) => ({
    // Derived state combining status and entities
    isReady: computed(
      () => $.users.status.isLoaded() && $.users.entities.all().length > 0
    ),
    selectedUser: computed(() => {
      const id = $.lastViewedUserId();
      return id != null ? $.users.entities.byId(id)?.() ?? null : null;
    }),
    // Theme-based styles
    themeStyles: computed(() => ({
      background: $.theme() === 'dark' ? '#1e1e1e' : '#ffffff',
      color: $.theme() === 'dark' ? '#ffffff' : '#1e1e1e',
      fontSize: `${$.fontSize()}px`,
    })),
  }));

  // Simulate async loading
  async loadUsers() {
    this.store.$.users.status.setLoading();

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate success or failure
    const shouldFail = Math.random() < 0.2; // 20% chance of failure

    if (shouldFail) {
      this.store.$.users.status.setError(new Error('Network error'));
      return;
    }

    // Add mock users
    const mockUsers: User[] = [
      { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
      { id: 3, name: 'Carol Davis', email: 'carol@example.com' },
      { id: 4, name: 'David Wilson', email: 'david@example.com' },
    ];

    this.store.$.users.entities.setAll(mockUsers);
    this.store.$.users.status.setLoaded();
  }

  resetUsers() {
    this.store.$.users.entities.removeAll();
    this.store.$.users.status.reset();
  }

  selectUser(userId: number) {
    this.store.$.lastViewedUserId.set(userId);
  }

  toggleTheme() {
    const current = this.store.$.theme();
    this.store.$.theme.set(current === 'light' ? 'dark' : 'light');
  }

  increaseFontSize() {
    this.store.$.fontSize.update((size) => Math.min(size + 2, 24));
  }

  decreaseFontSize() {
    this.store.$.fontSize.update((size) => Math.max(size - 2, 10));
  }

  clearPreferences() {
    this.store.$.theme.clear();
    this.store.$.fontSize.clear();
    this.store.$.lastViewedUserId.clear();
  }

  // Code examples for display
  statusExample = `// status() marker - async operation state
const tree = signalTree({
  users: {
    entities: entityMap<User>(),
    status: status(),  // Async state tracking
  },
});

// Derived boolean signals (lazy-created)
tree.$.users.status.isNotLoaded();  // true initially
tree.$.users.status.isLoading();    // false
tree.$.users.status.isLoaded();     // false
tree.$.users.status.isError();      // false

// Helper methods
tree.$.users.status.setLoading();   // Start loading
tree.$.users.status.setLoaded();    // Mark complete
tree.$.users.status.setError(err);  // Set error
tree.$.users.status.reset();        // Back to NotLoaded`;

  storedExample = `// stored() marker - localStorage persistence
const tree = signalTree({
  theme: stored('app-theme', 'light'),
  fontSize: stored('app-fontSize', 14),
  lastViewed: stored('last-viewed', null),
});

// Auto-loads from localStorage on init
tree.$.theme();  // 'light' or restored value

// Auto-saves on change (debounced 100ms default)
tree.$.theme.set('dark');  // Immediate signal update

// Methods
tree.$.theme.clear();   // Reset to default
tree.$.theme.reload();  // Force reload from storage

// Custom debounce
stored('key', value, { debounceMs: 0 });  // Immediate`;

  combinedExample = `// Combining markers with derived state
const tree = signalTree({
  users: {
    entities: entityMap<User>(),
    status: status(),
  },
  lastViewedUserId: stored('lastViewed', null),
})
.with(entities())
.derived(($) => ({
  isReady: computed(() => 
    $.users.status.isLoaded() && 
    $.users.entities.all().length > 0
  ),
  selectedUser: computed(() => {
    const id = $.lastViewedUserId();
    return id != null 
      ? $.users.entities.byId(id)?.() 
      : null;
  }),
}));`;
}

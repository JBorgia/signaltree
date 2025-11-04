import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface User {
  id: number;
  name: string;
  email: string;
  avatar: string;
}

/**
 * Async Operations Demo
 *
 * Demonstrates handling async operations with signals:
 * - Loading states
 * - Error handling
 * - Debounced search
 * - Data fetching simulation
 * - Optimistic updates
 */
@Component({
  selector: 'app-async-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './async-demo.component.html',
  styleUrl: './async-demo.component.scss',
})
export class AsyncDemoComponent {
  // Search state
  searchTerm = signal('');
  searchResults = signal<User[]>([]);
  isSearching = signal(false);
  searchError = signal<string | null>(null);

  // Data loading state
  users = signal<User[]>([]);
  isLoading = signal(false);
  loadError = signal<string | null>(null);

  // Debounce timer
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Computed
  hasResults = computed(() => this.searchResults().length > 0);
  hasUsers = computed(() => this.users().length > 0);

  // Mock API delay
  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Mock user data
  private mockUsers: User[] = [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', avatar: '👩' },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', avatar: '👨' },
    {
      id: 3,
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      avatar: '🧑',
    },
    { id: 4, name: 'Diana Prince', email: 'diana@example.com', avatar: '👸' },
    { id: 5, name: 'Eve Anderson', email: 'eve@example.com', avatar: '👩‍💼' },
  ];

  // Load users (simulated API call)
  async loadUsers() {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      await this.delay(1500); // Simulate network delay

      // Simulate occasional error
      if (Math.random() < 0.2) {
        throw new Error('Network error: Failed to fetch users');
      }

      this.users.set([...this.mockUsers]);
    } catch (error) {
      this.loadError.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.users.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Search users (debounced)
  onSearchInput(term: string) {
    this.searchTerm.set(term);

    if (this.searchTimeout !== null) {
      clearTimeout(this.searchTimeout);
    }

    if (!term.trim()) {
      this.searchResults.set([]);
      this.searchError.set(null);
      return;
    }

    this.isSearching.set(true);

    this.searchTimeout = setTimeout(() => {
      this.performSearch(term);
    }, 500); // 500ms debounce
  }

  // Perform search
  private async performSearch(term: string) {
    this.searchError.set(null);

    try {
      await this.delay(800); // Simulate API delay

      // Simulate occasional error
      if (Math.random() < 0.15) {
        throw new Error('Search service temporarily unavailable');
      }

      const results = this.mockUsers.filter(
        (user) =>
          user.name.toLowerCase().includes(term.toLowerCase()) ||
          user.email.toLowerCase().includes(term.toLowerCase())
      );

      this.searchResults.set(results);
    } catch (error) {
      this.searchError.set(
        error instanceof Error ? error.message : 'Search failed'
      );
      this.searchResults.set([]);
    } finally {
      this.isSearching.set(false);
    }
  }

  // Optimistic update (add user)
  async addUser() {
    const newUser: User = {
      id: Date.now(),
      name: 'New User',
      email: 'new.user@example.com',
      avatar: '🆕',
    };

    // Optimistic update - add immediately
    this.users.update((users) => [...users, newUser]);

    try {
      await this.delay(1000); // Simulate save

      // Simulate occasional failure
      if (Math.random() < 0.3) {
        throw new Error('Failed to save user');
      }

      // Success! Update is already in place
      console.log('User saved successfully');
    } catch {
      // Rollback on error
      this.users.update((users) => users.filter((u) => u.id !== newUser.id));
      this.loadError.set('Failed to add user');

      setTimeout(() => this.loadError.set(null), 3000);
    }
  }

  // Delete user (optimistic)
  async deleteUser(userId: number) {
    const usersCopy = [...this.users()];

    // Optimistic delete
    this.users.update((users) => users.filter((u) => u.id !== userId));

    try {
      await this.delay(800);

      if (Math.random() < 0.2) {
        throw new Error('Failed to delete');
      }
    } catch {
      // Rollback
      this.users.set(usersCopy);
      this.loadError.set('Failed to delete user');
      setTimeout(() => this.loadError.set(null), 3000);
    }
  }

  clearSearch() {
    this.searchTerm.set('');
    this.searchResults.set([]);
    this.searchError.set(null);
  }

  retry() {
    this.loadUsers();
  }
}

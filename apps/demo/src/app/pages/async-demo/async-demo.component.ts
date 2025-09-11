import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { withAsync } from '@signaltree/async';
import { signalTree } from '@signaltree/core';

import { generateUsers, sleep, User } from '../../shared/models';

interface AsyncState {
  users: User[];
  loading: boolean;
  error: string | null;
  selectedUser: User | null;
  searchQuery: string;
}

// Simulated API service
class MockApiService {
  private users: User[] = generateUsers(100);

  async getUsers(delay = 1000): Promise<User[]> {
    await sleep(delay);
    if (Math.random() > 0.9) {
      throw new Error('Network error: Failed to fetch users');
    }
    return [...this.users];
  }

  async getUserById(id: number, delay = 500): Promise<User> {
    await sleep(delay);
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }
    return { ...user };
  }

  async searchUsers(query: string, delay = 800): Promise<User[]> {
    await sleep(delay);
    const filtered = this.users.filter(
      (user) =>
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase())
    );
    return [...filtered];
  }

  async createUser(userData: Partial<User>, delay = 1200): Promise<User> {
    await sleep(delay);
    const newUser: User = {
      id: Math.max(...this.users.map((u) => u.id)) + 1,
      name: userData.name || 'New User',
      email: userData.email || 'new@example.com',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.name}`,
    };
    this.users.push(newUser);
    return { ...newUser };
  }
}

@Component({
  selector: 'app-async-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 class="text-2xl sm:text-3xl font-bold mb-6">SignalTree Async Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <!-- API Operations -->
        <div class="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 class="text-lg sm:text-xl font-semibold mb-4">API Operations</h2>

          <div class="space-y-4">
            <!-- Load Users -->
            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">Load All Users</h3>
              <div class="flex gap-2">
                <button
                  (click)="loadUsers()"
                  [disabled]="loading()"
                  class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ loading() ? 'Loading...' : 'Load Users' }}
                </button>
                <button
                  (click)="loadUsersWithError()"
                  [disabled]="loading()"
                  class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Simulate Error
                </button>
              </div>
            </div>

            <!-- Search Users -->
            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">Search Users</h3>
              <div class="space-y-2">
                <input
                  type="text"
                  [(ngModel)]="searchQueryValue"
                  placeholder="Search by name or email..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  (click)="searchUsers()"
                  [disabled]="loading() || !searchQuery().trim()"
                  class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ loading() ? 'Searching...' : 'Search' }}
                </button>
              </div>
            </div>

            <!-- Create User -->
            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">Create New User</h3>
              <div class="space-y-2">
                <input
                  type="text"
                  [(ngModel)]="newUserName"
                  placeholder="User name..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  [(ngModel)]="newUserEmail"
                  placeholder="User email..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div class="flex gap-2">
                  <button
                    (click)="generateRandomUser()"
                    [disabled]="loading()"
                    class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate
                  </button>
                  <button
                    (click)="createUser()"
                    [disabled]="
                      loading() || !newUserName.trim() || !newUserEmail.trim()
                    "
                    class="flex-1 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {{ loading() ? 'Creating...' : 'Create User' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Results & State -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Results</h2>

          <!-- Loading State -->
          <div *ngIf="loading()" class="flex items-center justify-center py-8">
            <div
              class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
            ></div>
            <span class="ml-2 text-gray-600">Loading...</span>
          </div>

          <!-- Error State -->
          <div
            *ngIf="error()"
            class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
          >
            <div class="flex items-center">
              <div class="text-red-500 mr-2">⚠️</div>
              <div>
                <h3 class="font-medium text-red-800">Error</h3>
                <p class="text-red-700 text-sm">{{ error() }}</p>
              </div>
            </div>
            <button
              (click)="clearError()"
              class="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Dismiss
            </button>
          </div>

          <!-- Users List -->
          <div *ngIf="!loading() && !error() && users().length > 0">
            <h3 class="font-medium mb-2">Users ({{ users().length }})</h3>
            <div class="space-y-2 max-h-64 overflow-y-auto">
              <div
                *ngFor="let user of users(); trackBy: trackUser"
                (click)="selectUser(user)"
                (keydown.enter)="selectUser(user)"
                (keydown.space)="selectUser(user)"
                [class]="
                  selectedUser()?.id === user.id
                    ? 'bg-blue-100 border-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 border-transparent'
                "
                class="p-3 rounded-md cursor-pointer border-2 transition-colors"
                tabindex="0"
                role="button"
                [attr.aria-label]="'Select user ' + user.name"
              >
                <div class="flex items-center gap-3">
                  <img
                    [src]="user.avatar"
                    [alt]="user.name"
                    class="w-8 h-8 rounded-full"
                  />
                  <div>
                    <div class="font-medium text-sm">{{ user.name }}</div>
                    <div class="text-xs text-gray-500">{{ user.email }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            *ngIf="!loading() && !error() && users().length === 0"
            class="text-center text-gray-500 py-8"
          >
            No users found. Click "Load Users" to get started.
          </div>
        </div>
      </div>

      <!-- Selected User Details -->
      <div class="mt-8 bg-white rounded-lg shadow p-6" *ngIf="selectedUser()">
        <h2 class="text-xl font-semibold mb-4">Selected User Details</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div class="flex items-center gap-4 mb-4">
              <img
                [src]="selectedUser()!.avatar"
                [alt]="selectedUser()!.name"
                class="w-16 h-16 rounded-full"
              />
              <div>
                <h3 class="text-lg font-medium">{{ selectedUser()!.name }}</h3>
                <p class="text-gray-600">{{ selectedUser()!.email }}</p>
                <p class="text-sm text-gray-500">
                  ID: {{ selectedUser()!.id }}
                </p>
              </div>
            </div>

            <button
              (click)="refreshSelectedUser()"
              [disabled]="loading()"
              class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ loading() ? 'Refreshing...' : 'Refresh Details' }}
            </button>
          </div>

          <div>
            <h4 class="font-medium mb-2">User Actions</h4>
            <div class="space-y-2">
              <button
                (click)="loadUserPosts()"
                [disabled]="loading()"
                class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ loading() ? 'Loading...' : 'Load User Posts' }}
              </button>
              <button
                (click)="loadUserFriends()"
                [disabled]="loading()"
                class="w-full px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ loading() ? 'Loading...' : 'Load Friends' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Async State Inspector -->
      <div class="mt-8 bg-gray-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Async State Inspector</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 class="font-medium text-gray-700 mb-2">Current State</h3>
            <div class="bg-white p-3 rounded text-sm space-y-1">
              <div>
                <strong>Loading:</strong> {{ loading() ? 'Yes' : 'No' }}
              </div>
              <div>
                <strong>Has Error:</strong> {{ error() ? 'Yes' : 'No' }}
              </div>
              <div><strong>Users Count:</strong> {{ users().length }}</div>
              <div>
                <strong>Selected:</strong> {{ selectedUser()?.name || 'None' }}
              </div>
            </div>
          </div>

          <div>
            <h3 class="font-medium text-gray-700 mb-2">Operation History</h3>
            <div class="bg-white p-3 rounded text-sm space-y-1">
              <div><strong>Last Operation:</strong> {{ lastOperation }}</div>
              <div><strong>Total Operations:</strong> {{ operationCount }}</div>
              <div><strong>Success Rate:</strong> {{ successRate() }}%</div>
            </div>
          </div>

          <div>
            <h3 class="font-medium text-gray-700 mb-2">Performance</h3>
            <div class="bg-white p-3 rounded text-sm space-y-1">
              <div><strong>Last Duration:</strong> {{ lastDuration }}ms</div>
              <div><strong>Avg Duration:</strong> {{ avgDuration() }}ms</div>
              <div><strong>Cache Hits:</strong> {{ cacheHits }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Features Explanation -->
      <div class="mt-8 bg-purple-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Async Features Demonstrated</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-purple-800 mb-2">Loading States</h3>
            <p class="text-sm text-purple-700">
              Reactive loading indicators that automatically update based on
              async operation status.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-purple-800 mb-2">Error Handling</h3>
            <p class="text-sm text-purple-700">
              Centralized error state management with user-friendly error
              messages and recovery options.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-purple-800 mb-2">
              Request Cancellation
            </h3>
            <p class="text-sm text-purple-700">
              Automatic cancellation of in-flight requests when new requests are
              made.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-purple-800 mb-2">State Consistency</h3>
            <p class="text-sm text-purple-700">
              Ensures UI state remains consistent during async operations with
              proper state transitions.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AsyncDemoComponent {
  private store = signalTree({
    users: [] as User[],
    selectedUser: null as User | null,
    loading: false,
    error: null as string | null,
    searchQuery: '',
  }).with(withAsync());

  private apiService = new MockApiService();

  // Async actions using @signaltree/async
  loadUsersAction = this.store.loadData(() => this.apiService.getUsers(), {
    loadingKey: 'loading',
    errorKey: 'error',
    onSuccess: (users: User[]) => ({ users }),
  });

  searchUsersAction = this.store.asyncAction(
    async (query: string) => this.apiService.searchUsers(query),
    {
      loadingKey: 'loading',
      errorKey: 'error',
      onSuccess: (users: User[]) => ({ users }),
    }
  );

  loadUserByIdAction = this.store.asyncAction(
    async (id: number) => this.apiService.getUserById(id),
    {
      loadingKey: 'loading',
      errorKey: 'error',
      onSuccess: (user: User) => ({ selectedUser: user }),
    }
  );

  createUserAction = this.store.asyncAction(
    async (userData: { name: string; email: string }) =>
      this.apiService.createUser(userData),
    {
      loadingKey: 'loading',
      errorKey: 'error',
      onSuccess: (newUser: User, state: AsyncState) => ({
        users: [...state.users, newUser],
      }),
    }
  );

  // State signals
  users = this.store.state.users;
  loading = this.store.state.loading;
  error = this.store.state.error;
  selectedUser = this.store.state.selectedUser;
  searchQuery = this.store.state.searchQuery;

  // Form fields
  newUserName = '';
  newUserEmail = '';

  // Getter/setter for template two-way binding
  get searchQueryValue() {
    return this.searchQuery();
  }

  set searchQueryValue(value: string) {
    this.searchQuery.set(value);
  }

  updateSearchQuery(query: string) {
    this.searchQuery.set(query);
  }

  // Async action states
  isLoadingUsers = this.loadUsersAction.pending;
  loadUsersError = this.loadUsersAction.error;

  isSearching = this.searchUsersAction.pending;
  searchError = this.searchUsersAction.error;

  isCreatingUser = this.createUserAction.pending;
  createError = this.createUserAction.error;

  // Performance tracking
  lastOperation = 'None';
  operationCount = 0;
  successCount = 0;
  lastDuration = 0;
  totalDuration = 0;
  cacheHits = 0;

  // Computed values
  successRate = computed(() =>
    this.operationCount > 0
      ? Math.round((this.successCount / this.operationCount) * 100)
      : 0
  );

  avgDuration = computed(() =>
    this.operationCount > 0
      ? Math.round(this.totalDuration / this.operationCount)
      : 0
  );

  private async performAsyncOperation<T>(
    operation: string,
    asyncFn: () => Promise<T>
  ): Promise<T | null> {
    this.store.$.loading.set(true);
    this.store.$.error.set(null);
    this.lastOperation = operation;
    this.operationCount++;

    const startTime = performance.now();

    try {
      const result = await asyncFn();
      this.successCount++;
      this.lastDuration = performance.now() - startTime;
      this.totalDuration += this.lastDuration;
      return result;
    } catch (error) {
      this.store.$.error.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.lastDuration = performance.now() - startTime;
      this.totalDuration += this.lastDuration;
      return null;
    } finally {
      this.store.$.loading.set(false);
    }
  }

  async loadUsers() {
    await this.loadUsersAction.execute();
  }

  async loadUsersWithError() {
    // Force an error by setting random to 0
    const originalRandom = Math.random;
    Math.random = () => 0; // Force error condition

    await this.loadUsersAction.execute();

    Math.random = originalRandom; // Restore original
  }

  async searchUsers() {
    if (!this.searchQuery().trim()) return;
    await this.searchUsersAction.execute(this.searchQuery());
    // Store already updated via action
  }

  generateRandomUser() {
    const firstNames = [
      'Alex',
      'Jordan',
      'Casey',
      'Taylor',
      'Morgan',
      'Avery',
      'Riley',
      'Jamie',
      'Drew',
      'Blake',
    ];
    const lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
    ];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    this.newUserName = `${firstName} ${lastName}`;
    this.newUserEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
  }

  async createUser() {
    if (!this.newUserName.trim() || !this.newUserEmail.trim()) return;

    await this.createUserAction.execute({
      name: this.newUserName,
      email: this.newUserEmail,
    });

    this.newUserName = '';
    this.newUserEmail = '';
  }

  async selectUser(user: User) {
    await this.loadUserByIdAction.execute(user.id);
    this.cacheHits++; // Simulate cache behavior
  }

  async refreshSelectedUser() {
    const current = this.selectedUser();
    if (!current) return;

    const refreshedUser = await this.performAsyncOperation('Refresh User', () =>
      this.apiService.getUserById(current.id)
    );

    if (refreshedUser) {
      this.store.state.selectedUser.set(refreshedUser);
      this.store.state.users.update((users) =>
        users.map((u: User) => (u.id === refreshedUser.id ? refreshedUser : u))
      );
    }
  }

  async loadUserPosts() {
    const user = this.selectedUser();
    if (!user) return;

    // Simulate loading user posts
    await this.performAsyncOperation('Load User Posts', () =>
      sleep(1000).then(() => ({
        posts: [`Post 1 by ${user.name}`, `Post 2 by ${user.name}`],
      }))
    );
  }

  async loadUserFriends() {
    const user = this.selectedUser();
    if (!user) return;

    // Simulate loading user friends
    await this.performAsyncOperation('Load User Friends', () =>
      sleep(800).then(() => ({ friends: ['Friend 1', 'Friend 2', 'Friend 3'] }))
    );
  }

  clearError() {
    this.store.$.error.set(null);
  }

  trackUser(index: number, user: User): number {
    return user.id;
  }
}

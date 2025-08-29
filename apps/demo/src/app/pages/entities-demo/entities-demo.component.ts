import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

import { generatePosts, generateUsers, Post, User } from '../../shared/models';

interface EntitiesState {
  users: User[];
  posts: Post[];
  selectedUserId: number | null;
  searchTerm: string;
}

@Component({
  selector: 'app-entities-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Entities Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Users Panel -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Users ({{ userCount() }})</h2>
            <button
              (click)="loadUsers()"
              class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Load Users
            </button>
          </div>

          <div class="mb-4">
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (input)="updateSearchTerm($event)"
              placeholder="Search users..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              *ngFor="let user of filteredUsers(); trackBy: trackUser"
              (click)="selectUser(user.id)"
              (keyup.enter)="selectUser(user.id)"
              (keyup.space)="selectUser(user.id)"
              [class]="getUserClass(user.id)"
              class="p-3 rounded-md cursor-pointer transition-colors"
              tabindex="0"
              role="button"
            >
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

            <div
              *ngIf="filteredUsers().length === 0"
              class="text-center text-gray-500 py-4"
            >
              No users found
            </div>
          </div>

          <div class="mt-4 pt-4 border-t">
            <button
              (click)="addRandomUser()"
              class="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add Random User
            </button>
          </div>
        </div>

        <!-- Posts Panel -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">
              Posts
              <span *ngIf="selectedUser()" class="text-sm text-gray-500">
                by {{ selectedUser()?.name }}
              </span>
              ({{ displayedPosts().length }})
            </h2>
            <button
              (click)="loadPosts()"
              class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Load Posts
            </button>
          </div>

          <div class="space-y-3 max-h-80 overflow-y-auto">
            <div
              *ngFor="let post of displayedPosts(); trackBy: trackPost"
              class="p-3 bg-gray-50 rounded-md"
            >
              <h3 class="font-medium text-sm mb-1">{{ post.title }}</h3>
              <p class="text-xs text-gray-600 mb-2">{{ post.content }}</p>
              <div
                class="flex justify-between items-center text-xs text-gray-500"
              >
                <span>{{
                  getPostAuthor(post.authorId)?.name || 'Unknown'
                }}</span>
                <span>{{ post.likes }} likes</span>
              </div>
              <div class="flex gap-1 mt-2">
                <span
                  *ngFor="let tag of post.tags"
                  class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <div
              *ngIf="displayedPosts().length === 0"
              class="text-center text-gray-500 py-4"
            >
              No posts found
            </div>
          </div>

          <div class="mt-4 pt-4 border-t">
            <button
              (click)="addRandomPost()"
              [disabled]="userCount() === 0"
              class="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Random Post
            </button>
          </div>
        </div>

        <!-- Stats & Inspector -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Entity Statistics</h2>

          <div class="space-y-4">
            <div>
              <h3 class="font-medium text-gray-700 mb-2">Counts</h3>
              <div class="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div><strong>Total Users:</strong> {{ userCount() }}</div>
                <div>
                  <strong>Filtered Users:</strong> {{ filteredUsers().length }}
                </div>
                <div><strong>Total Posts:</strong> {{ postCount() }}</div>
                <div>
                  <strong>User's Posts:</strong> {{ userPosts().length }}
                </div>
              </div>
            </div>

            <div>
              <h3 class="font-medium text-gray-700 mb-2">Selected User</h3>
              <div class="bg-gray-50 p-3 rounded text-sm">
                <div *ngIf="selectedUser(); else noUser">
                  <div><strong>Name:</strong> {{ selectedUser()?.name }}</div>
                  <div><strong>Email:</strong> {{ selectedUser()?.email }}</div>
                  <div><strong>Posts:</strong> {{ userPosts().length }}</div>
                  <div>
                    <strong>Total Likes:</strong> {{ userTotalLikes() }}
                  </div>
                </div>
                <ng-template #noUser>
                  <div class="text-gray-500">No user selected</div>
                </ng-template>
              </div>
            </div>

            <div>
              <h3 class="font-medium text-gray-700 mb-2">Performance</h3>
              <div class="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div><strong>Last Operation:</strong> {{ lastOperation }}</div>
                <div><strong>Operations:</strong> {{ operationCount }}</div>
                <div>
                  <strong>Search Active:</strong>
                  {{ searchTerm.length > 0 ? 'Yes' : 'No' }}
                </div>
              </div>
            </div>

            <div>
              <h3 class="font-medium text-gray-700 mb-2">Entity Operations</h3>
              <div class="space-y-2">
                <button
                  (click)="bulkUpdatePosts()"
                  [disabled]="postCount() === 0"
                  class="w-full px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50"
                >
                  Bulk Update Posts (+10 likes)
                </button>
                <button
                  (click)="removeInactivePosts()"
                  [disabled]="postCount() === 0"
                  class="w-full px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
                >
                  Remove Low-Engagement Posts
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Features Explanation -->
      <div class="mt-8 bg-green-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Entity Features Demonstrated</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-green-800 mb-2">Normalized State</h3>
            <p class="text-sm text-green-700">
              Entities are stored as arrays with reactive updates through
              SignalTree. This example shows CRUD operations, filtering, and
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">Relational Queries</h3>
            <p class="text-sm text-green-700">
              Complex queries across related entities (users and their posts)
              are computed efficiently.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">Filtered Views</h3>
            <p class="text-sm text-green-700">
              Search and filtering maintain reactivity while preserving
              performance.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">Bulk Operations</h3>
            <p class="text-sm text-green-700">
              Efficient bulk updates and deletions with minimal re-computation.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EntitiesDemoComponent {
  private store = signalTree<EntitiesState>({
    users: [],
    posts: [],
    selectedUserId: null,
    searchTerm: '',
  });

  // Entity helpers using @signaltree/entities
  userHelpers = this.store.asCrud<User>('users');
  postHelpers = this.store.asCrud<Post>('posts');

  // State signals
  searchTerm = '';
  lastOperation = 'None';
  operationCount = 0;

  // Entity selectors using entity helpers
  userCount = this.userHelpers.selectTotal();
  postCount = this.postHelpers.selectTotal();
  allUsers = this.userHelpers.selectAll();
  allPosts = this.postHelpers.selectAll();

  selectedUser = computed(() => {
    const id = this.store.$.selectedUserId();
    return id ? this.userHelpers.findById(id)() : null;
  });

  filteredUsers = computed(() => {
    const users = this.allUsers();
    const term = this.searchTerm.toLowerCase();

    if (!term) return users;

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
    );
  });

  userPosts = computed(() => {
    const selectedId = this.store.$.selectedUserId();
    if (!selectedId) return [];

    return this.store.$.posts().filter((post) => post.authorId === selectedId);
  });

  displayedPosts = computed(() => {
    const selectedId = this.store.$.selectedUserId();
    const allPosts = this.store.$.posts();

    return selectedId
      ? allPosts.filter((post) => post.authorId === selectedId)
      : allPosts.slice(0, 20); // Show first 20 if no user selected
  });

  userTotalLikes = computed(() => {
    return this.userPosts().reduce((sum, post) => sum + post.likes, 0);
  });

  private trackOperation(operation: string) {
    this.lastOperation = operation;
    this.operationCount++;
  }

  loadUsers() {
    const users = generateUsers(50);
    // Use entity helpers to clear and add all users
    this.userHelpers.clear();
    users.forEach((user) => this.userHelpers.add(user));
    this.trackOperation('Load Users');
  }

  loadPosts() {
    const userCount = this.userCount();
    if (userCount === 0) {
      this.loadUsers();
    }

    const posts = generatePosts(200, Math.max(userCount, 50));
    // Use entity helpers to clear and add all posts
    this.postHelpers.clear();
    posts.forEach((post) => this.postHelpers.add(post));
    this.trackOperation('Load Posts');
  }

  addRandomUser() {
    const newUser = generateUsers(1, Date.now())[0];
    const users = this.store.$.users();
    const currentMaxId = Math.max(0, ...users.map((u) => u.id));
    newUser.id = currentMaxId + 1;

    // Use entity helper to add user
    this.userHelpers.add(newUser);
    this.trackOperation('Add User');
  }

  addRandomPost() {
    const users = this.store.$.users();
    if (users.length === 0) return;

    const newPost = generatePosts(1, users.length, Date.now())[0];
    const posts = this.store.$.posts();
    const currentMaxId = Math.max(0, ...posts.map((p) => p.id));
    newPost.id = currentMaxId + 1;
    newPost.authorId = users[Math.floor(Math.random() * users.length)].id;

    // Use entity helper to add post
    this.postHelpers.add(newPost);
    this.trackOperation('Add Post');
  }

  selectUser(userId: number) {
    this.store.$.selectedUserId.set(
      this.store.$.selectedUserId() === userId ? null : userId
    );
    this.trackOperation('Select User');
  }

  updateSearchTerm(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.trackOperation('Search');
  }

  bulkUpdatePosts() {
    this.store.$.posts.update((posts) =>
      posts.map((post) => ({
        ...post,
        likes: post.likes + 10,
      }))
    );
    this.trackOperation('Bulk Update Posts');
  }

  removeInactivePosts() {
    this.store.$.posts.update((posts) =>
      posts.filter((post) => post.likes >= 20)
    );
    this.trackOperation('Remove Inactive Posts');
  }

  getPostAuthor(authorId: number): User | undefined {
    return this.store.$.users().find((u) => u.id === authorId);
  }

  getUserClass(userId: number): string {
    const isSelected = this.store.$.selectedUserId() === userId;
    return isSelected
      ? 'bg-blue-100 border-2 border-blue-300'
      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent';
  }

  trackUser(index: number, user: User): number {
    return user.id;
  }

  trackPost(index: number, post: Post): number {
    return post.id;
  }
}

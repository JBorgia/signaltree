import { Component, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import {
  User,
  Post,
  generateUsers,
  generatePosts,
  sleep,
} from '../../shared/models';

interface BatchingState {
  users: User[];
  posts: Post[];
  batchQueue: BatchOperation[];
  processing: boolean;
  completedOperations: BatchOperation[];
  batchResults: BatchResult[];
  autoProcess: boolean;
  batchSize: number;
  processingDelay: number;
}

// NOTE: This interface forces data to be Record<string, unknown> which is why
// we needed 'unknown' assertions. SignalTree's recursive typing works perfectly!
// This is a demo design limitation, not a SignalTree limitation.
interface BatchOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'user' | 'post';
  data: Record<string, unknown>; // ← This artificial constraint caused the type issues
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface BatchResult {
  batchId: string;
  operations: BatchOperation[];
  duration: number;
  successCount: number;
  failureCount: number;
  timestamp: number;
}

// Simulated batch processing service
class BatchProcessor {
  async processBatch(
    operations: BatchOperation[],
    delay = 1000
  ): Promise<BatchResult> {
    const startTime = performance.now();
    const batchId = `batch_${Date.now()}`;

    await sleep(delay);

    // Simulate some operations failing randomly
    const processedOps = operations.map((op) => ({
      ...op,
      status: (Math.random() > 0.1 ? 'completed' : 'failed') as
        | 'completed'
        | 'failed',
      error: Math.random() > 0.1 ? undefined : 'Simulated processing error',
    }));

    const duration = performance.now() - startTime;
    const successCount = processedOps.filter(
      (op) => op.status === 'completed'
    ).length;
    const failureCount = processedOps.filter(
      (op) => op.status === 'failed'
    ).length;

    return {
      batchId,
      operations: processedOps,
      duration,
      successCount,
      failureCount,
      timestamp: Date.now(),
    };
  }
}

@Component({
  selector: 'app-batching-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Batching Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Batch Operations Panel -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Batch Operations</h2>

          <!-- Batch Settings -->
          <div class="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 class="font-medium mb-3">Batch Settings</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  for="batchSize"
                  class="block text-sm font-medium text-gray-700 mb-1"
                  >Batch Size</label
                >
                <input
                  id="batchSize"
                  type="number"
                  [(ngModel)]="batchSize"
                  min="1"
                  max="50"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  for="processingDelay"
                  class="block text-sm font-medium text-gray-700 mb-1"
                  >Delay (ms)</label
                >
                <input
                  id="processingDelay"
                  type="number"
                  [(ngModel)]="processingDelay"
                  min="100"
                  max="5000"
                  step="100"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div class="mt-3">
              <label class="flex items-center">
                <input
                  type="checkbox"
                  [(ngModel)]="autoProcess"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="ml-2 text-sm text-gray-700"
                  >Auto-process when batch is full</span
                >
              </label>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="space-y-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">User Operations</h3>
              <div class="grid grid-cols-2 gap-2">
                <button
                  (click)="addCreateUserOperation()"
                  class="px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                >
                  + Create User
                </button>
                <button
                  (click)="addUpdateUserOperation()"
                  [disabled]="users().length === 0"
                  class="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↻ Update User
                </button>
                <button
                  (click)="addDeleteUserOperation()"
                  [disabled]="users().length === 0"
                  class="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  × Delete User
                </button>
                <button
                  (click)="addBulkUserOperations()"
                  class="px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                >
                  ⚡ Bulk Users
                </button>
              </div>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">Post Operations</h3>
              <div class="grid grid-cols-2 gap-2">
                <button
                  (click)="addCreatePostOperation()"
                  [disabled]="users().length === 0"
                  class="px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Create Post
                </button>
                <button
                  (click)="addUpdatePostOperation()"
                  [disabled]="posts().length === 0"
                  class="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↻ Update Post
                </button>
                <button
                  (click)="addDeletePostOperation()"
                  [disabled]="posts().length === 0"
                  class="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  × Delete Post
                </button>
                <button
                  (click)="addBulkPostOperations()"
                  [disabled]="users().length === 0"
                  class="px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⚡ Bulk Posts
                </button>
              </div>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-2">Batch Control</h3>
              <div class="flex gap-2">
                <button
                  (click)="processBatch()"
                  [disabled]="batchQueue().length === 0 || processing()"
                  class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ processing() ? 'Processing...' : 'Process Batch' }} ({{
                    batchQueue().length
                  }})
                </button>
                <button
                  (click)="clearBatch()"
                  [disabled]="batchQueue().length === 0 || processing()"
                  class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Batch
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Batch Queue & Status -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Batch Queue</h2>

          <!-- Queue Status -->
          <div class="mb-4 p-3 bg-blue-50 rounded-lg">
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div class="text-center">
                <div class="font-semibold text-blue-800">
                  {{ batchQueue().length }}
                </div>
                <div class="text-blue-600">Queued</div>
              </div>
              <div class="text-center">
                <div class="font-semibold text-blue-800">
                  {{ pendingOperationsCount() }}
                </div>
                <div class="text-blue-600">Pending</div>
              </div>
              <div class="text-center">
                <div class="font-semibold text-blue-800">
                  {{ completedOperations().length }}
                </div>
                <div class="text-blue-600">Completed</div>
              </div>
            </div>
          </div>

          <!-- Processing Indicator -->
          <div
            *ngIf="processing()"
            class="mb-4 flex items-center justify-center py-4"
          >
            <div
              class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"
            ></div>
            <span class="ml-2 text-orange-600">Processing batch...</span>
          </div>

          <!-- Batch Queue Items -->
          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              *ngFor="let operation of batchQueue(); trackBy: trackOperation"
              class="flex items-center justify-between p-3 border rounded-lg"
              [class]="getOperationStatusClass(operation)"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-2 h-2 rounded-full"
                  [class]="getOperationStatusDot(operation)"
                ></div>
                <div>
                  <div class="font-medium text-sm">
                    {{ operation.type | titlecase }}
                    {{ operation.entity | titlecase }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ operation.id }} •
                    {{ formatTimestamp(operation.timestamp) }}
                  </div>
                </div>
              </div>
              <button
                (click)="removeOperation(operation.id)"
                [disabled]="processing() || operation.status === 'processing'"
                class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
          </div>

          <!-- Empty State -->
          <div
            *ngIf="batchQueue().length === 0"
            class="text-center text-gray-500 py-8"
          >
            No operations in queue. Add some operations to get started.
          </div>
        </div>
      </div>

      <!-- Data Display -->
      <div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Users -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">
            Users ({{ users().length }})
          </h2>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              *ngFor="let user of users(); trackBy: trackUser"
              class="flex items-center gap-3 p-2 rounded bg-gray-50"
            >
              <img
                [src]="user.avatar"
                [alt]="user.name"
                class="w-8 h-8 rounded-full"
              />
              <div class="flex-1">
                <div class="font-medium text-sm">{{ user.name }}</div>
                <div class="text-xs text-gray-500">{{ user.email }}</div>
              </div>
            </div>
          </div>

          <div
            *ngIf="users().length === 0"
            class="text-center text-gray-500 py-4"
          >
            No users yet. Create some users to see them here.
          </div>
        </div>

        <!-- Posts -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">
            Posts ({{ posts().length }})
          </h2>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div
              *ngFor="let post of posts(); trackBy: trackPost"
              class="p-3 rounded bg-gray-50"
            >
              <div class="font-medium text-sm">{{ post.title }}</div>
              <div class="text-xs text-gray-500 mt-1">
                by {{ getUserName(post.authorId) }} •
                {{ post.content.length }} chars
              </div>
            </div>
          </div>

          <div
            *ngIf="posts().length === 0"
            class="text-center text-gray-500 py-4"
          >
            No posts yet. Create some posts to see them here.
          </div>
        </div>
      </div>

      <!-- Batch Results History -->
      <div class="mt-8 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4">Batch Processing History</h2>

        <div class="space-y-3">
          <div
            *ngFor="
              let result of batchResults().slice().reverse();
              trackBy: trackBatchResult
            "
            class="border rounded-lg p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="font-medium">{{ result.batchId }}</div>
              <div class="text-sm text-gray-500">
                {{ formatTimestamp(result.timestamp) }}
              </div>
            </div>

            <div class="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div class="font-medium text-gray-700">Operations</div>
                <div>{{ result.operations.length }}</div>
              </div>
              <div>
                <div class="font-medium text-green-700">Success</div>
                <div>{{ result.successCount }}</div>
              </div>
              <div>
                <div class="font-medium text-red-700">Failed</div>
                <div>{{ result.failureCount }}</div>
              </div>
              <div>
                <div class="font-medium text-blue-700">Duration</div>
                <div>{{ result.duration.toFixed(0) }}ms</div>
              </div>
            </div>

            <div class="mt-2 text-xs text-gray-600">
              {{ getOperationsSummary(result.operations) }}
            </div>
          </div>
        </div>

        <div
          *ngIf="batchResults().length === 0"
          class="text-center text-gray-500 py-8"
        >
          No batch processing history yet. Process some batches to see results
          here.
        </div>
      </div>

      <!-- Features Explanation -->
      <div class="mt-8 bg-green-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">
          Batching Features Demonstrated
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-green-800 mb-2">Operation Queuing</h3>
            <p class="text-sm text-green-700">
              Operations are queued in memory and processed together for
              efficiency.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">
              Configurable Batching
            </h3>
            <p class="text-sm text-green-700">
              Batch size and processing delays can be configured for optimal
              performance.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">Auto-Processing</h3>
            <p class="text-sm text-green-700">
              Batches can be automatically processed when they reach the
              configured size.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-green-800 mb-2">Error Handling</h3>
            <p class="text-sm text-green-700">
              Individual operation failures don't block the entire batch from
              processing.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BatchingDemoComponent {
  private store = signalTree<BatchingState>({
    users: generateUsers(5),
    posts: generatePosts(10, 5),
    batchQueue: [],
    processing: false,
    completedOperations: [],
    batchResults: [],
    autoProcess: true,
    batchSize: 5,
    processingDelay: 1000,
  }).pipe(
    withBatching({
      enabled: true,
      maxBatchSize: 50,
      autoFlushDelay: 16,
      batchTimeoutMs: 100,
    })
  );

  private batchProcessor = new BatchProcessor();

  // State signals
  users = this.store.$.users;
  posts = this.store.$.posts;
  batchQueue = this.store.$.batchQueue;
  processing = this.store.$.processing;
  completedOperations = this.store.$.completedOperations;
  batchResults = this.store.$.batchResults;

  // Form fields
  batchSize = this.store.$.batchSize();
  processingDelay = this.store.$.processingDelay();
  autoProcess = this.store.$.autoProcess();

  // Computed values
  pendingOperationsCount = computed(
    () =>
      this.batchQueue().filter((op: BatchOperation) => op.status === 'pending')
        .length
  );

  constructor() {
    // Auto-process effect
    effect(() => {
      if (
        this.autoProcess &&
        this.batchQueue().length >= this.batchSize &&
        !this.processing()
      ) {
        this.processBatch();
      }
    });

    // Sync form fields with store
    effect(() => {
      this.store.$.batchSize.set(this.batchSize);
      this.store.$.processingDelay.set(this.processingDelay);
      this.store.$.autoProcess.set(this.autoProcess);
    });
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  addCreateUserOperation() {
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'create',
      entity: 'user',
      data: {
        name: `User ${Date.now()}`,
        email: `user${Date.now()}@example.com`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
      },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addUpdateUserOperation() {
    const users = this.users();
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'update',
      entity: 'user',
      data: {
        id: randomUser.id,
        name: `${randomUser.name} (updated)`,
        email: randomUser.email,
        avatar: randomUser.avatar,
      },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addDeleteUserOperation() {
    const users = this.users();
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'delete',
      entity: 'user',
      data: { id: randomUser.id },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addBulkUserOperations() {
    // Use proper batching from @signaltree/batching
    const newUsers: User[] = [];
    for (let i = 0; i < 3; i++) {
      newUsers.push({
        id: Date.now() + i,
        name: `Bulk User ${Date.now()}_${i}`,
        email: `bulk${Date.now()}_${i}@example.com`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=bulk${Date.now()}_${i}`,
      });
    }

    // Use batchUpdate to efficiently update multiple state properties
    this.store.batchUpdate((state) => ({
      users: [...state.users, ...newUsers],
      batchQueue: [], // Clear queue after processing
      processing: false,
    }));

    // NOTE: SignalTree preserves User[] type perfectly! The 'unknown' conversion
    // is only needed because BatchOperation.data is artificially constrained
    const operations: BatchOperation[] = newUsers.map((user) => ({
      id: this.generateOperationId(),
      type: 'create',
      entity: 'user',
      data: user as unknown as Record<string, unknown>, // ← Demo limitation, not SignalTree
      timestamp: Date.now(),
      status: 'completed',
    }));

    this.store.$.completedOperations.update((ops) => [...ops, ...operations]);
  }

  addCreatePostOperation() {
    const users = this.users();
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'create',
      entity: 'post',
      data: {
        title: `Post ${Date.now()}`,
        content: `This is a new post created at ${new Date().toLocaleTimeString()}`,
        authorId: randomUser.id,
        tags: ['demo'],
        likes: 0,
        createdAt: new Date(),
      },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addUpdatePostOperation() {
    const posts = this.posts();
    if (posts.length === 0) return;

    const randomPost = posts[Math.floor(Math.random() * posts.length)];
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'update',
      entity: 'post',
      data: {
        id: randomPost.id,
        title: `${randomPost.title} (updated)`,
        content: randomPost.content,
        authorId: randomPost.authorId,
        tags: randomPost.tags,
        likes: randomPost.likes,
        createdAt: randomPost.createdAt,
      },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addDeletePostOperation() {
    const posts = this.posts();
    if (posts.length === 0) return;

    const randomPost = posts[Math.floor(Math.random() * posts.length)];
    const operation: BatchOperation = {
      id: this.generateOperationId(),
      type: 'delete',
      entity: 'post',
      data: { id: randomPost.id },
      timestamp: Date.now(),
      status: 'pending',
    };

    this.store.$.batchQueue.update((queue) => [...queue, operation]);
  }

  addBulkPostOperations() {
    const users = this.users();
    if (users.length === 0) return;

    // Use proper batching from @signaltree/batching
    const newPosts: Post[] = [];
    for (let i = 0; i < 4; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      newPosts.push({
        id: Date.now() + i,
        title: `Bulk Post ${Date.now()}_${i}`,
        content: `This is bulk post ${i} created at ${new Date().toLocaleTimeString()}`,
        authorId: randomUser.id,
        tags: ['bulk', 'demo'],
        likes: 0,
        createdAt: new Date(),
      });
    }

    // Use batchUpdate to efficiently update multiple state properties
    this.store.batchUpdate((state) => ({
      posts: [...state.posts, ...newPosts],
      batchQueue: [], // Clear queue after processing
      processing: false,
    }));

    // NOTE: SignalTree preserves Post[] type perfectly! The 'unknown' conversion
    // is only needed because BatchOperation.data is artificially constrained
    const operations: BatchOperation[] = newPosts.map((post) => ({
      id: this.generateOperationId(),
      type: 'create',
      entity: 'post',
      data: post as unknown as Record<string, unknown>, // ← Demo limitation, not SignalTree
      timestamp: Date.now(),
      status: 'completed',
    }));

    this.store.$.completedOperations.update((ops) => [...ops, ...operations]);
  }

  async processBatch() {
    const queue = this.batchQueue();
    if (queue.length === 0) return;

    this.store.$.processing.set(true);

    try {
      const result = await this.batchProcessor.processBatch(
        queue,
        this.processingDelay
      );

      // Apply successful operations to state
      result.operations.forEach((op) => {
        if (op.status === 'completed') {
          this.applyOperationToState(op);
        }
      });

      // Update batch results
      this.store.$.batchResults.update((results) => [...results, result]);

      // Move operations to completed
      this.store.$.completedOperations.update((completed) => [
        ...completed,
        ...result.operations,
      ]);

      // Clear the queue
      this.store.$.batchQueue.set([]);
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      this.store.$.processing.set(false);
    }
  }

  private applyOperationToState(operation: BatchOperation) {
    switch (operation.entity) {
      case 'user': {
        switch (operation.type) {
          case 'create': {
            // Generate a complete user instead of using incomplete operation.data
            const newUser = generateUsers(1)[0];
            newUser.id = Math.max(...this.users().map((u) => u.id), 0) + 1;
            this.store.$.users.update((users) => [...users, newUser]);
            break;
          }
          case 'update': {
            this.store.$.users.update((users) =>
              users.map((u) =>
                u.id === operation.data['id'] ? { ...u, ...operation.data } : u
              )
            );
            break;
          }
          case 'delete': {
            this.store.$.users.update((users) =>
              users.filter((u) => u.id !== operation.data['id'])
            );
            // Also delete associated posts
            this.store.$.posts.update((posts) =>
              posts.filter((p) => p.authorId !== operation.data['id'])
            );
            break;
          }
        }
        break;
      }
      case 'post': {
        switch (operation.type) {
          case 'create': {
            // Generate a complete post instead of using incomplete operation.data
            const users = this.users();
            if (users.length === 0) break; // Need users to create posts
            const newPost = generatePosts(1, users.length)[0];
            newPost.id = Math.max(...this.posts().map((p) => p.id), 0) + 1;
            newPost.authorId =
              users[Math.floor(Math.random() * users.length)].id;
            this.store.$.posts.update((posts) => [...posts, newPost]);
            break;
          }
          case 'update': {
            this.store.$.posts.update((posts) =>
              posts.map((p) =>
                p.id === operation.data['id'] ? { ...p, ...operation.data } : p
              )
            );
            break;
          }
          case 'delete': {
            this.store.$.posts.update((posts) =>
              posts.filter((p) => p.id !== operation.data['id'])
            );
            break;
          }
        }
        break;
      }
    }
  }

  removeOperation(operationId: string) {
    this.store.$.batchQueue.update((queue) =>
      queue.filter((op) => op.id !== operationId)
    );
  }

  clearBatch() {
    this.store.$.batchQueue.set([]);
  }

  getOperationStatusClass(operation: BatchOperation): string {
    switch (operation.status) {
      case 'pending':
        return 'bg-gray-50 border-gray-200';
      case 'processing':
        return 'bg-yellow-50 border-yellow-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  }

  getOperationStatusDot(operation: BatchOperation): string {
    switch (operation.status) {
      case 'pending':
        return 'bg-gray-400';
      case 'processing':
        return 'bg-yellow-400';
      case 'completed':
        return 'bg-green-400';
      case 'failed':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  }

  getUserName(userId: number): string {
    const user = this.users().find((u) => u.id === userId);
    return user ? user.name : 'Unknown User';
  }

  getOperationsSummary(operations: BatchOperation[]): string {
    return operations.map((op) => `${op.type} ${op.entity}`).join(', ');
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  trackOperation(index: number, operation: BatchOperation): string {
    return operation.id;
  }

  trackUser(index: number, user: User): number {
    return user.id;
  }

  trackPost(index: number, post: Post): number {
    return post.id;
  }

  trackBatchResult(index: number, result: BatchResult): string {
    return result.batchId;
  }
}

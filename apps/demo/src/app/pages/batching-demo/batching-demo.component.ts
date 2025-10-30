import { CommonModule } from '@angular/common';
import { Component, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withBatching } from '@signaltree/core';

import { generatePosts, generateUsers, Post, sleep, User } from '../../shared/models';

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
  templateUrl: './batching-demo.component.html',
  styleUrls: ['./batching-demo.component.scss'],
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
  }).with(
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

    // Use tree update to efficiently update multiple state properties (batched automatically)
    this.store.$.users.update((users) => [...users, ...newUsers]);
    this.store.$.batchQueue.set([]);
    this.store.$.processing.set(false);

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

    // Use tree update to efficiently update multiple state properties (batched automatically)
    this.store.$.posts.update((posts) => [...posts, ...newPosts]);
    this.store.$.batchQueue.set([]);
    this.store.$.processing.set(false);

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

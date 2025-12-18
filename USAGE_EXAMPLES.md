# SignalTree v5.0 - Usage Examples

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Entity Collections](#entity-collections)
3. [Entity Hooks](#entity-hooks)
4. [Entity Interception](#entity-interception)
5. [Enhanced Features](#enhanced-features)
6. [Real-World Examples](#real-world-examples)

---

## Basic Setup

### Create a Simple Tree

```typescript
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

// Read and update via $
console.log(tree.$.user.name()); // 'Alice'
tree.$.user.name.set('Bob');
tree.$.user.age.update((a) => a + 1);
```

### Create a Tree with Entities

```typescript
import { signalTree, entityMap, withEntities } from '@signaltree/core';

const tree = signalTree({
  // Regular signal state
  filters: {
    searchTerm: '',
    sortBy: 'name',
  },

  // Entity collections (new!)
  users: entityMap<User>(), // EntitySignal<User, string>
  posts: entityMap<Post>(), // EntitySignal<Post, string>
  comments: entityMap<Comment>(), // EntitySignal<Comment, string>
}).with(withEntities()); // Enable entity system

// Now you have both:
tree.$.filters.searchTerm(); // Regular signal access
tree.$.users; // EntitySignal<User, string>
tree.$.posts; // EntitySignal<Post, string>
```

---

## Entity Collections

### Basic CRUD

```typescript
// ==================
// CREATE (addOne)
// ==================

const userId = tree.$.users.addOne({
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  createdAt: new Date(),
});
// Returns: 'u1' (the ID)

// Can also auto-generate IDs
const userId2 = tree.$.users.addOne({ name: 'Bob', email: 'bob@example.com' }, { selectId: (user) => user.id || crypto.randomUUID() });

// Add multiple
const userIds = [
  { id: 'u2', name: 'Charlie', email: 'charlie@example.com' },
  { id: 'u3', name: 'Diana', email: 'diana@example.com' },
].map((user) => tree.$.users.addOne(user));

// ==================
// READ (byId, all, bracket notation)
// ==================

// Method 1: byId
const user1 = tree.$.users.byId('u1')?.(); // User | undefined
console.log(user1); // { id: 'u1', name: 'Alice', ... }

// Method 2: Bracket notation (same result)
const user2 = tree.$.users['u1']?.(); // User | undefined

// Get all users as reactive array
const allUsers = tree.$.users.all(); // Signal<User[]>
console.log(allUsers()); // [User, User, User]

// Count (also reactive)
const userCount = tree.$.users.count(); // Signal<number>
console.log(userCount()); // 3

// Get all IDs
const userIds = tree.$.users.ids(); // Signal<string[]>
console.log(userIds()); // ['u1', 'u2', 'u3']

// ==================
// UPDATE (updateOne)
// ==================

tree.$.users.updateOne('u1', {
  name: 'Alice Updated',
  email: 'alice.updated@example.com',
});
// Only updates specified fields, rest unchanged

// Update multiple
['u1', 'u2', 'u3'].forEach((id) => {
  tree.$.users.updateOne(id, { updatedAt: new Date() });
});

// ==================
// DELETE (removeOne)
// ==================

tree.$.users.removeOne('u1');
// User 'u1' removed from collection

// Delete multiple
['u2', 'u3'].forEach((id) => tree.$.users.removeOne(id));

// ==================
// UPSERT (addOne or updateOne)
// ==================

tree.$.users.upsertOne({
  id: 'u4',
  name: 'Eve',
  email: 'eve@example.com',
});
// Creates if doesn't exist, updates if does

// ==================
// ERROR HANDLING
// ==================

// Option 1: Throw on error (halt execution)
try {
  tree.$.users.updateOne('u999', { name: 'NoOne' });
} catch (err) {
  console.error('User not found:', err.message);
  // Stop here
}

// Option 2: Handle with callback (continue execution)
tree.$.users.updateOne(
  'u999',
  { name: 'NoOne' },
  {
    onError: (err) => {
      console.warn('Update failed:', err.message);
      // Execution continues
    },
  }
);

// Both onError runs first, prevents throw if provided
tree.$.users.removeOne('u999', {
  onError: (err) => {
    showNotification('User not found');
    // Execution continues, no throw
  },
});
```

---

## Entity Hooks

### Observe Changes (tap)

```typescript
import { signalTree, entityMap, withEntities } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  posts: entityMap<Post>(),
}).with(withEntities());

// ==================
// SIMPLE OBSERVATION
// ==================

// Listen to any changes
const unsub = tree.$.users.tap({
  // When entity is added
  onAdd: (user, id) => {
    console.log(`✅ Added user: ${user.name} (${id})`);
    updateDashboard();
  },

  // When entity is updated (receives partial changes + full updated entity)
  onUpdate: (id, changes, updatedEntity) => {
    console.log(`🔄 Updated user ${id}:`, changes);

    // React to specific field changes
    if (changes.name) {
      notifyNameChange(updatedEntity.name);
    }
    if (changes.role) {
      handleRoleChange(id, changes.role);
    }
  },

  // When entity is removed
  onRemove: (id, removedEntity) => {
    console.log(`🗑️ Removed user ${id}: ${removedEntity.name}`);
    cleanupUserData(id);
  },

  // On any change (add, update, or remove)
  onChange: () => {
    markDirty();
    triggerAutosave();
  },
});

// Add some users
tree.$.users.addOne({ id: 'u1', name: 'Alice', email: 'alice@ex.com', role: 'user' });
// Console: "✅ Added user: Alice (u1)"
// onChange fires

tree.$.users.updateOne('u1', { name: 'Alice Smith', role: 'admin' });
// Console: "🔄 Updated user u1: { name: 'Alice Smith', role: 'admin' }"
// onChange fires

tree.$.users.removeOne('u1');
// Console: "🗑️ Removed user u1: Alice Smith"
// onChange fires

// Stop listening
unsub();

// ==================
// MULTIPLE HOOKS (Separation of Concerns)
// ==================

// Create separate hooks for different responsibilities

// 1. Logging Hook
const logUnsub = tree.$.users.tap({
  onAdd: (user) =>
    logger.info('User added', {
      userId: user.id,
      name: user.name,
    }),
  onUpdate: (id, changes) =>
    logger.info('User updated', {
      id,
      fields: Object.keys(changes),
    }),
  onRemove: (id, user) =>
    logger.info('User removed', {
      id,
      email: user.email,
    }),
});

// 2. Analytics Hook
const analyticsUnsub = tree.$.users.tap({
  onAdd: (user) => {
    analytics.track('user_created', {
      userId: user.id,
      role: user.role,
      timestamp: Date.now(),
    });
  },
  onUpdate: (id, changes) => {
    if (changes.role) {
      analytics.track('user_role_changed', {
        userId: id,
        newRole: changes.role,
      });
    }
  },
  onRemove: (id, user) => {
    analytics.track('user_deleted', {
      userId: id,
      wasAdmin: user.role === 'admin',
    });
  },
});

// 3. Auto-Persistence Hook (with try/catch)
const persistenceUnsub = tree.$.users.tap({
  onChange: () => {
    const users = tree.$.users.all()();
    try {
      localStorage.setItem('users-backup', JSON.stringify(users));
      console.log('💾 Auto-saved users to localStorage');
    } catch (error) {
      console.error('❌ Failed to save users:', error);
    }
  },
});

// 4. UI Notification Hook
const notificationUnsub = tree.$.users.tap({
  onAdd: (user) => toast.success(`Welcome ${user.name}!`),
  onUpdate: (id, changes) => {
    if (changes.role === 'admin') {
      toast.info(`User promoted to admin`);
    }
  },
  onRemove: (id, user) => toast.info(`${user.name} has been removed`),
});

// Clean up all hooks when component unmounts
function cleanup() {
  logUnsub();
  analyticsUnsub();
  persistenceUnsub();
  notificationUnsub();
}

// ==================
// CROSS-ENTITY RELATIONSHIPS (Cascade Deletes)
// ==================

interface Post {
  id: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: Date;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
}

const tree = signalTree({
  users: entityMap<User>(),
  posts: entityMap<Post>(),
  comments: entityMap<Comment>(),
}).with(withEntities());

// Cascade delete: Remove user's posts and comments when user is deleted
tree.$.users.tap({
  onRemove: (userId, user) => {
    console.log(`🗑️ Cascading delete for user: ${user.name}`);

    // Find and remove all posts by this user
    const userPosts = tree.$.posts.where((post) => post.authorId === userId)();
    userPosts.forEach((post) => {
      tree.$.posts.removeOne(post.id);
    });
    console.log(`  Removed ${userPosts.length} posts`);

    // Find and remove all comments by this user
    const userComments = tree.$.comments.where((c) => c.authorId === userId)();
    userComments.forEach((comment) => {
      tree.$.comments.removeOne(comment.id);
    });
    console.log(`  Removed ${userComments.length} comments`);
  },
});

// Track user activity: Update lastActive when user posts
tree.$.posts.tap({
  onAdd: (post) => {
    const author = tree.$.users.byId(post.authorId)?.();
    if (author) {
      console.log(`📝 ${author.name} created post: "${post.title}"`);
      tree.$.users.updateOne(post.authorId, {
        lastActive: new Date(),
      });
    }
  },
});

// Cascade delete comments when post is deleted
tree.$.posts.tap({
  onRemove: (postId, post) => {
    const postComments = tree.$.comments.where((c) => c.postId === postId)();
    postComments.forEach((comment) => {
      tree.$.comments.removeOne(comment.id);
    });
    console.log(`🗑️ Cascade deleted ${postComments.length} comments for "${post.title}"`);
  },
});

// ==================
// REAL-TIME BACKEND SYNC (with Debouncing)
// ==================

interface SyncConfig {
  endpoint: string;
  debounceMs: number;
}

function setupRealtimeSync<T>(entitySignal: any, entityName: string, config: SyncConfig) {
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdates: Map<string, Partial<T>> = new Map();

  return entitySignal.tap({
    // Sync new entities immediately
    onAdd: async (entity: T) => {
      try {
        const response = await fetch(`${config.endpoint}/${entityName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entity),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log('✅ Synced new entity to backend');
      } catch (error) {
        console.error('❌ Failed to sync entity:', error);
      }
    },

    // Debounce updates to avoid hammering backend
    onUpdate: (id: string, changes: Partial<T>) => {
      const existing = pendingUpdates.get(id) || {};
      pendingUpdates.set(id, { ...existing, ...changes });

      if (syncTimer) clearTimeout(syncTimer);

      syncTimer = setTimeout(async () => {
        const updates = Array.from(pendingUpdates.entries());
        pendingUpdates.clear();

        try {
          await Promise.all(
            updates.map(([entityId, entityChanges]) =>
              fetch(`${config.endpoint}/${entityName}/${entityId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entityChanges),
              })
            )
          );
          console.log(`✅ Synced ${updates.length} updates to backend`);
        } catch (error) {
          console.error('❌ Failed to sync updates:', error);
        }
      }, config.debounceMs);
    },

    // Sync deletions immediately
    onRemove: async (id: string) => {
      try {
        await fetch(`${config.endpoint}/${entityName}/${id}`, {
          method: 'DELETE',
        });
        console.log('✅ Synced deletion to backend');
      } catch (error) {
        console.error('❌ Failed to sync deletion:', error);
      }
    },
  });
}

// Usage
const syncUnsub = setupRealtimeSync(tree.$.users, 'users', { endpoint: 'https://api.example.com', debounceMs: 500 });
```

### Intercept & Validate (intercept)

```typescript
// ==================
// VALIDATION
// ==================

tree.$.users.intercept({
  onAdd: (user, ctx) => {
    // Validate required fields
    if (!user.id || !user.name) {
      ctx.block('User must have id and name');
    }

    // Validate email format
    if (!isValidEmail(user.email)) {
      ctx.block('Invalid email address');
    }

    // All validations passed
  },

  onUpdate: (id, changes, ctx) => {
    // Don't allow name changes to be empty
    if (changes.name !== undefined && !changes.name.trim()) {
      ctx.block('Name cannot be empty');
    }
  },

  onRemove: (id, user, ctx) => {
    // Don't allow removing admin users
    if (user.role === 'admin') {
      ctx.block('Cannot delete admin users');
    }
  },
});

// Now validation runs automatically
try {
  tree.$.users.addOne({ id: '', name: 'Invalid' });
  // Error: "User must have id and name"
} catch (err) {
  console.error(err.message);
}

// ==================
// TRANSFORMATION
// ==================

tree.$.users.intercept({
  onAdd: (user, ctx) => {
    // Auto-add timestamps
    ctx.transform({
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  onUpdate: (id, changes, ctx) => {
    // Always update the updatedAt timestamp
    ctx.transform({
      ...changes,
      updatedAt: new Date(),
    });
  },
});

// User is automatically enhanced
const userId = tree.$.users.addOne({ id: 'u1', name: 'Alice', email: '' });
const user = tree.$.users.byId(userId);
console.log(user?.().createdAt); // Date object (auto-added!)

// ==================
// AUTHORIZATION
// ==================

const currentUser = signal<User | null>(null);

tree.$.posts.intercept({
  onRemove: (postId, post, ctx) => {
    // Only allow authors to delete their own posts
    if (currentUser()?.id !== post.userId) {
      ctx.block('You can only delete your own posts');
    }
  },

  onUpdate: (postId, changes, ctx) => {
    const post = tree.$.posts.byId(postId);

    if (currentUser()?.id !== post?.().userId) {
      ctx.block('You can only edit your own posts');
    }

    // Prevent status tampering
    if (changes.status && changes.status !== 'published') {
      ctx.block('Invalid status change');
    }
  },
});

// ==================
// CHAINED INTERCEPTORS
// ==================

// Multiple interceptors run in order
tree.$.users.intercept({
  onAdd: (user, ctx) => {
    console.log('1. Interceptor 1: Validating...');
    if (!user.email) ctx.block('Email required');
  },
});

tree.$.users.intercept({
  onAdd: (user, ctx) => {
    console.log('2. Interceptor 2: Transforming...');
    if (!ctx.blocked) {
      ctx.transform({
        ...user,
        email: user.email.toLowerCase(),
      });
    }
  },
});

tree.$.users.intercept({
  onAdd: (user, ctx) => {
    console.log('3. Interceptor 3: Logging...');
    if (!ctx.blocked) {
      logger.info('Adding user', user);
    }
  },
});

tree.$.users.addOne({ id: 'u1', name: 'Alice', email: 'ALICE@EXAMPLE.COM' });
// Console:
// "1. Interceptor 1: Validating..."
// "2. Interceptor 2: Transforming..."
// "3. Interceptor 3: Logging..."
// Email is now lowercase

// ==================
// PREVENT UPDATES
// ==================

const readOnlyIds = signal<Set<string>>(new Set(['admin', 'system']));

tree.$.users.intercept({
  onUpdate: (id, changes, ctx) => {
    if (readOnlyIds().has(id)) {
      ctx.block(`User ${id} is read-only`);
    }
  },

  onRemove: (id, user, ctx) => {
    if (readOnlyIds().has(id)) {
      ctx.block(`Cannot delete system user ${id}`);
    }
  },
});
```

---

## Enhanced Features

### Batching (Fixed)

```typescript
import { signalTree, entityMap, withEntities, withBatching } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  posts: entityMap<Post>(),
})
  .with(withEntities())
  .with(withBatching());

// Before: Global state bug - mutations from multiple trees interfered
// After: Instance-scoped - each tree has isolated batching queue

// When you make rapid mutations, they're automatically batched:
tree.$.users.tap({
  onChange: () => console.log('Users changed'),
});

// All of these fire in a single batch (onChange called once)
tree.$.users.addOne({ id: 'u1', name: 'Alice' });
tree.$.users.addOne({ id: 'u2', name: 'Bob' });
tree.$.users.addOne({ id: 'u3', name: 'Charlie' });

// Before fix: onChange fires 3 times
// After fix: onChange fires 1 time (batched!)

// Multiple trees don't interfere
const tree1 = signalTree({ users: entityMap<User>() }).with(withEntities()).with(withBatching());
const tree2 = signalTree({ users: entityMap<User>() }).with(withEntities()).with(withBatching());

tree1.$.users.addOne({ id: 'u1', name: 'Tree1' });
tree2.$.users.addOne({ id: 'u2', name: 'Tree2' });
// Each tree's batch queue is independent
```

### Persistence (Fixed: 50ms Polling → Event-Driven)

```typescript
import { signalTree, withPersistence } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  settings: { theme: 'dark' },
}).with(
  withPersistence({
    key: 'myapp-state',
    storage: localStorage,
    debounceMs: 1000,

    // Only persist certain paths
    filter: (path) => {
      // Persist only entity data, not temporary UI state
      return path.startsWith('users') || path.startsWith('posts');
    },
  })
);

// Before fix:
// - setInterval every 50ms checking for changes (wasted CPU)
// - Never cleaned up (memory leak)
// - Persisted everything
//
// After fix:
// - Only saves when actual mutations occur
// - Automatically cleaned up on destroy()
// - Can filter which paths to save
// - Zero overhead when tree is idle

// Auto-saves after user changes
tree.$.users.addOne({ id: 'u1', name: 'Alice' });
// Waits 1000ms, then saves to localStorage

tree.$.users.updateOne('u1', { name: 'Alice Updated' });
// Debounce resets, waits 1000ms again, then saves

// Restore on page reload
const savedState = localStorage.getItem('myapp-state');
if (savedState) {
  const loaded = JSON.parse(savedState);
  tree(loaded);
}

// Explicit save/load
tree.save(); // Save immediately (no debounce)
tree.load(); // Load from storage
tree.clearPersisted(); // Clear localStorage
```

### TimeTravel (Fixed: Now Catches All Mutations)

```typescript
import { signalTree, entityMap, withTimeTravel } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  selectedUserId: '',
}).with(
  withTimeTravel({
    maxHistorySize: 50,
    useStructuralSharing: true, // Efficient memory usage
  })
);

// Before fix:
// - tree.$.users.addOne() NOT tracked (only tree() calls)
// - 80% of mutations missed!
//
// After fix:
// - ALL mutations tracked via PathNotifier
// - tree.$.users.addOne() tracked ✓
// - tree.$.users.updateOne() tracked ✓
// - tree.$.selectedUserId.set() tracked ✓

tree.$.users.addOne({ id: 'u1', name: 'Alice' }); // Snapshot 1
tree.$.users.addOne({ id: 'u2', name: 'Bob' }); // Snapshot 2
tree.$.users.updateOne('u1', { name: 'Alice v2' }); // Snapshot 3
tree.$.selectedUserId.set('u1'); // Snapshot 4

console.log(tree.canUndo()); // true
tree.undo();
// Back to Snapshot 3

console.log(tree.canRedo()); // true
tree.redo();
// Forward to Snapshot 4

// Get history
const history = tree.getHistory();
history.forEach((entry, index) => {
  console.log(`Snapshot ${index}:`, entry.action, entry.timestamp);
});
// Snapshot 0: INIT
// Snapshot 1: users.u1
// Snapshot 2: users.u2
// Snapshot 3: users.u1
// Snapshot 4: selectedUserId

// Jump to specific snapshot
tree.jumpTo(2);
// Back to state after 2 users were added

// Reset history
tree.resetHistory();
// Clear all snapshots, keep current state
```

### DevTools (Fixed: Now Complete)

```typescript
import { signalTree, entityMap, withDevTools } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  posts: entityMap<Post>(),
}).with(
  withDevTools({
    name: 'My SignalTree App',
    maxAge: 50, // Keep last 50 mutations
  })
);

// Before fix:
// - tree.$.users.addOne() NOT sent to DevTools (only tree() calls)
// - Incomplete mutation history
// - Useless for debugging
//
// After fix:
// - ALL mutations sent with full context (path, value, prev)
// - Open Redux DevTools extension and see every change
// - Time-travel debugging works properly

tree.$.users.addOne({ id: 'u1', name: 'Alice' });
// DevTools shows: [users.u1] { value: User, prev: undefined }

tree.$.users.updateOne('u1', { name: 'Alice v2' });
// DevTools shows: [users.u1] { value: User, prev: User }

tree.$.posts.addOne({ postId: 'p1', userId: 'u1', title: 'Hello' });
// DevTools shows: [posts.p1] { value: Post, prev: undefined }

// In Redux DevTools UI, you can:
// - See every mutation with exact path
// - See before/after values
// - Time-travel to any point
// - Dispatch actions to test behavior
```

### Logging (Uses PathNotifier)

```typescript
import { signalTree, entityMap, withEntities, withLogging } from '@signaltree/core';

const tree = signalTree({
  users: entityMap<User>(),
  settings: { theme: 'dark' },
})
  .with(withEntities())
  .with(
    withLogging({
      name: 'MyApp',

      // Filter which paths to log
      filter: (path) => !path.startsWith('ui'), // Skip UI updates

      // Custom logger
      onLog: (log) => {
        console.log(`[${log.timestamp}] ${log.path}:`, {
          prev: log.prev,
          value: log.value,
        });
      },

      // Or use default (console.group)
      collapsed: true, // Use console.groupCollapsed
    })
  )
);

// Every mutation is logged:
tree.$.users.addOne({ id: 'u1', name: 'Alice' });
// [2024-12-10T10:30:45Z] users.u1: { prev: undefined, value: User }

tree.$.users.updateOne('u1', { name: 'Alice v2' });
// [2024-12-10T10:30:46Z] users.u1: { prev: User, value: User }

tree.$.settings.theme.set('light');
// [2024-12-10T10:30:47Z] settings.theme: { prev: 'dark', value: 'light' }
```

---

## Real-World Examples

### Todo App with Entities

```typescript
import { signalTree, withEntities, withPersistence, withTimeTravel } from '@signaltree/core';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const todoTree = signalTree({
  // Entities
  todos: entityMap<Todo>(),

  // UI state
  filter: 'all', // 'all' | 'active' | 'completed'
  editingId: null as string | null,
})
  .with(withEntities())
  .with(
    withPersistence({
      key: 'todos-app',
      filter: (path) => path.startsWith('todos'), // Only persist todos, not UI
    })
  )
  .with(withTimeTravel());

// Setup validation
todoTree.$.todos.intercept({
  onAdd: (todo, ctx) => {
    if (!todo.text?.trim()) {
      ctx.block('Todo text cannot be empty');
    }

    // Auto-timestamp
    ctx.transform({
      ...todo,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  onUpdate: (id, changes, ctx) => {
    if (changes.text !== undefined && !changes.text.trim()) {
      ctx.block('Todo text cannot be empty');
    }

    ctx.transform({
      ...changes,
      updatedAt: new Date(),
    });
  },
});

// Setup tracking
todoTree.$.todos.tap({
  onAdd: (todo) => {
    console.log('📝 Added:', todo.text);
  },
  onUpdate: (id, changes) => {
    if (changes.completed) {
      console.log('✅ Completed:', todoTree.$.todos.byId(id)?.().text);
    }
  },
  onRemove: (id, todo) => {
    console.log('🗑️ Removed:', todo.text);
  },
});

// Usage
const addTodo = (text: string) => {
  const id = crypto.randomUUID();
  todoTree.$.todos.addOne({
    id,
    text,
    completed: false,
  });
};

const toggleTodo = (id: string) => {
  const todo = todoTree.$.todos.byId(id);
  if (todo) {
    todoTree.$.todos.updateOne(id, {
      completed: !todo().completed,
    });
  }
};

const deleteTodo = (id: string) => {
  todoTree.$.todos.removeOne(id);
};

// Reactive computed
const activeTodos = computed(() => {
  const todos = todoTree.$.todos.all()(); // Call to unwrap Signal<Todo[]>
  return todos.filter((t) => !t.completed);
});

// Component usage
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-todo-list',
  template: `
    <div>
      <input placeholder="Add a todo..." (keydown.enter)="addTodo($event)" />

      <div>
        @for (todo of todos(); track todo.id) {
        <div>
          <input type="checkbox" [checked]="todo.completed" (change)="toggleTodo(todo.id)" />
          <span [style.textDecoration]="todo.completed ? 'line-through' : 'none'">
            {{ todo.text }}
          </span>
          <button (click)="deleteTodo(todo.id)">Delete</button>
        </div>
        }
      </div>

      <div>Active: {{ activeTodos().length }}</div>

      <button (click)="todoTree.undo()" [disabled]="!todoTree.canUndo()">Undo</button>
      <button (click)="todoTree.redo()" [disabled]="!todoTree.canRedo()">Redo</button>
    </div>
  `,
})
export class TodoListComponent {
  todoTree = inject(TodoTreeService).tree;
  todos = this.todoTree.$.todos.all();
  activeTodos = computed(() => this.todos().filter((t) => !t.completed));

  addTodo(event: KeyboardEvent) {
    const input = event.target as HTMLInputElement;
    if (input.value.trim()) {
      const id = crypto.randomUUID();
      this.todoTree.$.todos.addOne({
        id,
        text: input.value,
        completed: false,
      });
      input.value = '';
    }
  }

  toggleTodo(id: string) {
    const todo = this.todoTree.$.todos.byId(id)?.();
    if (todo) {
      this.todoTree.$.todos.updateOne(id, {
        completed: !todo.completed,
      });
    }
  }

  deleteTodo(id: string) {
    this.todoTree.$.todos.removeOne(id);
  }
}
```

### User Management with Access Control

```typescript
import { signalTree, entityMap, withEntities } from '@signaltree/core';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

const userTree = signalTree({
  users: entityMap<User>(),
  currentUserId: null as string | null,
}).with(withEntities());

// Authorization interceptor
userTree.$.users.intercept({
  onAdd: (user, ctx) => {
    const current = userTree.$.currentUserId();
    const currentUser = current ? userTree.$.users.byId(current)?.() : null;

    // Only admins can add users
    if (currentUser?.role !== 'admin') {
      ctx.block('Only admins can add users');
    }
  },

  onUpdate: (id, changes, ctx) => {
    const current = userTree.$.currentUserId();
    const currentUser = current ? userTree.$.users.byId(current)?.() : null;

    // Users can only edit themselves
    if (id !== current && currentUser?.role !== 'admin') {
      ctx.block('You can only edit your own profile');
    }

    // Only admins can change roles
    if (changes.role && currentUser?.role !== 'admin') {
      ctx.block('Only admins can change user roles');
    }
  },

  onRemove: (id, user, ctx) => {
    const current = userTree.$.currentUserId();
    const currentUser = current ? userTree.$.users.byId(current)?.() : null;

    // Can't delete yourself
    if (id === current) {
      ctx.block('You cannot delete your own account');
    }

    // Only admins can delete
    if (currentUser?.role !== 'admin') {
      ctx.block('Only admins can delete users');
    }
  },
});

// Audit logging
userTree.$.users.tap({
  onAdd: (user) => {
    const current = userTree.$.users.byId(userTree.$.currentUserId());
    auditLog.write({
      action: 'user_created',
      userId: user.id,
      createdBy: current?.().name,
      timestamp: Date.now(),
    });
  },
  onUpdate: (id, changes) => {
    const current = userTree.$.users.byId(userTree.$.currentUserId());
    auditLog.write({
      action: 'user_updated',
      userId: id,
      changes,
      updatedBy: current?.().name,
      timestamp: Date.now(),
    });
  },
  onRemove: (id, user) => {
    const current = userTree.$.users.byId(userTree.$.currentUserId());
    auditLog.write({
      action: 'user_deleted',
      userId: id,
      deletedBy: current?.().name,
      userName: user.name,
      timestamp: Date.now(),
    });
  },
});

// Usage
function addAdmin() {
  userTree.$.currentUserId.set('admin-id'); // Login as admin

  const id = userTree.$.users.addOne({
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'user',
  });
  // ✅ Works - admin can add users

  userTree.$.currentUserId.set('u1'); // Login as Alice

  userTree.$.users.addOne({
    id: 'u2',
    name: 'Bob',
    email: 'bob@example.com',
    role: 'user',
  });
  // ❌ Error: "Only admins can add users"
}
```

---

## Migration from v4.x to v5.0

### Before (v4.x - Broken Middleware)

```typescript
// Use entity hooks (tap/intercept) instead of global middleware
// const loggerUnsub = tree.$.users.tap({ onAdd: (user) => console.log('User added:', user) });
// const analyticsUnsub = tree.$.users.tap({ onAdd: (user) => analytics.track('user_created', { userId: user.id }) });
```

### After (v5.0 - Scoped Entity Hooks)

```typescript
// Unsubscribe entity hooks
// const unsub = tree.$.users.tap({...});
// unsub();

// Multiple entity types work independently
tree.$.posts.tap({
  onAdd: (post) => analytics.track('post_created'),
});

tree.$.comments.tap({
  onAdd: (comment) => analytics.track('comment_created'),
});
```

---

**Summary:**

- ✅ Entity collections with type-safe CRUD
- ✅ Hooks that are scoped and returnable
- ✅ Fixed enhancers (batching, persistence, time-travel, devtools)
- ✅ No more global state or polling
- ✅ Clean, composable DX

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

// Old way (still works)
const tree = signalTree({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

// Read and update
console.log(tree.$.user.name());  // 'Alice'
tree.$.user.name.set('Bob');
tree.$.user.age.update(a => a + 1);
```

### Create a Tree with Entities

```typescript
import { signalTree, withEntities } from '@signaltree/core';

const tree = signalTree(
  {
    // Regular signal state
    filters: {
      searchTerm: '',
      sortBy: 'name',
    },
    
    // Entity collections (new!)
    users: entity<User>('id'),      // Map<id, User>
    posts: entity<Post>('postId'),  // Map<postId, Post>
    comments: entity<Comment>('id'), // Map<id, Comment>
  },
  { enhancers: [withEntities()] }  // Enable entity system
);

// Now you have both:
tree.$.filters.searchTerm();        // Regular signal access
tree.$.users;                        // EntitySignal<User, string>
tree.$.posts;                        // EntitySignal<Post, string>
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
const userId2 = tree.$.users.addOne(
  { name: 'Bob', email: 'bob@example.com' },
  { selectId: (user) => user.id || crypto.randomUUID() }
);

// Add multiple
const userIds = [
  { id: 'u2', name: 'Charlie', email: 'charlie@example.com' },
  { id: 'u3', name: 'Diana', email: 'diana@example.com' },
].map(user => tree.$.users.addOne(user));

// ==================
// READ (byId, all)
// ==================

const user1 = tree.$.users.byId('u1');
console.log(user1?.());  // { id: 'u1', name: 'Alice', ... }

// Get all users as reactive array
const allUsers = tree.$.users.all();
console.log(allUsers());  // [User, User, User]

// Count (also reactive)
const userCount = tree.$.users.count();
console.log(userCount());  // 3

// Get all IDs
const userIds = tree.$.users.ids();
console.log(userIds());  // ['u1', 'u2', 'u3']

// ==================
// UPDATE (updateOne)
// ==================

tree.$.users.updateOne('u1', {
  name: 'Alice Updated',
  email: 'alice.updated@example.com',
});
// Only updates specified fields, rest unchanged

// Update multiple
['u1', 'u2', 'u3'].forEach(id => {
  tree.$.users.updateOne(id, { updatedAt: new Date() });
});

// ==================
// DELETE (removeOne)
// ==================

tree.$.users.removeOne('u1');
// User 'u1' removed from collection

// Delete multiple
['u2', 'u3'].forEach(id => tree.$.users.removeOne(id));

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

// Throw on error
try {
  tree.$.users.updateOne('u999', { name: 'NoOne' });
} catch (err) {
  console.error('User not found:', err.message);
}

// Or handle with callback
tree.$.users.updateOne(
  'u999',
  { name: 'NoOne' },
  {
    onError: (err) => {
      console.warn('Update failed:', err.message);
      // Don't throw, just log
    },
  }
);

// Or both - onError runs first, prevents throw
tree.$.users.removeOne('u999', {
  onError: (err) => {
    showNotification('User not found');
  },
});
```

---

## Entity Hooks

### Observe Changes (tap)

```typescript
import { signalTree, withEntities } from '@signaltree/core';

const tree = signalTree({
  users: entity<User>('id'),
  posts: entity<Post>('postId'),
}, { enhancers: [withEntities()] });

// ==================
// SIMPLE OBSERVATION
// ==================

// Listen to any changes
const unsub = tree.$.users.tap({
  // When entity is added
  onAdd: (user, id) => {
    console.log(`Added user: ${user.name} (${id})`);
    updateUserCount();
  },

  // When entity is updated
  onUpdate: (id, changes, updatedEntity) => {
    console.log(`Updated user ${id}:`, changes);
    if (changes.name) {
      notifyNameChange(updatedEntity.name);
    }
  },

  // When entity is removed
  onRemove: (id, removedEntity) => {
    console.log(`Removed user ${id}: ${removedEntity.name}`);
    updateUserCount();
  },

  // On any change (add, update, or remove)
  onChange: () => {
    markDirty();  // Mark as unsaved
  },
});

// Add some users
tree.$.users.addOne({ id: 'u1', name: 'Alice' });
// Console: "Added user: Alice (u1)"
// onChange fires

tree.$.users.updateOne('u1', { name: 'Alice Updated' });
// Console: "Updated user u1: { name: 'Alice Updated' }"
// onChange fires

tree.$.users.removeOne('u1');
// Console: "Removed user u1: Alice Updated"
// onChange fires

// Stop listening
unsub();

// ==================
// MULTIPLE HOOKS
// ==================

// Different hooks for different concerns
const logUnsub = tree.$.users.tap({
  onAdd: (user) => logger.info('User added', user),
  onUpdate: (id, changes) => logger.info('User updated', { id, changes }),
  onRemove: (id) => logger.info('User removed', { id }),
});

const analyticsUnsub = tree.$.users.tap({
  onAdd: (user) => analytics.track('user_created', { userId: user.id }),
  onRemove: (user) => analytics.track('user_deleted', { userId: user.id }),
});

const persistenceUnsub = tree.$.users.tap({
  onChange: () => {
    // Save to localStorage whenever users change
    localStorage.setItem('users', JSON.stringify(tree.$.users.all()));
  },
});

// Clean up all
logUnsub();
analyticsUnsub();
persistenceUnsub();

// ==================
// CHAINED OBSERVERS
// ==================

// Automatically track changes across multiple entities
function setupUserTracking(tree) {
  tree.$.users.tap({
    onAdd: (user) => {
      console.log('New user, initializing...');
      tree.$.posts.tap({
        onAdd: (post) => {
          if (post.userId === user.id) {
            console.log(`${user.name} posted: "${post.title}"`);
          }
        },
      });
    },
  });
}
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
console.log(user?.().createdAt);  // Date object (auto-added!)

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
import { signalTree, withBatching } from '@signaltree/core';

const tree = signalTree(
  {
    users: entity<User>('id'),
    posts: entity<Post>('postId'),
  },
  {
    enhancers: [withBatching()],
  }
);

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
const tree1 = signalTree({ users: entity<User>('id') }, { enhancers: [withBatching()] });
const tree2 = signalTree({ users: entity<User>('id') }, { enhancers: [withBatching()] });

tree1.$.users.addOne({ id: 'u1', name: 'Tree1' });
tree2.$.users.addOne({ id: 'u2', name: 'Tree2' });
// Each tree's batch queue is independent
```

### Persistence (Fixed: 50ms Polling → Event-Driven)

```typescript
import { signalTree, withPersistence } from '@signaltree/core';

const tree = signalTree(
  {
    users: entity<User>('id'),
    settings: { theme: 'dark' },
  },
  {
    enhancers: [
      withPersistence({
        key: 'myapp-state',
        storage: localStorage,
        debounceMs: 1000,
        
        // Only persist certain paths
        filter: (path) => {
          // Persist only entity data, not temporary UI state
          return path.startsWith('users') || path.startsWith('posts');
        },
      }),
    ],
  }
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
tree.save();                    // Save immediately (no debounce)
tree.load();                    // Load from storage
tree.clearPersisted();          // Clear localStorage
```

### TimeTravel (Fixed: Now Catches All Mutations)

```typescript
import { signalTree, withTimeTravel } from '@signaltree/core';

const tree = signalTree(
  {
    users: entity<User>('id'),
    selectedUserId: '',
  },
  {
    enhancers: [
      withTimeTravel({
        maxHistorySize: 50,
        useStructuralSharing: true,  // Efficient memory usage
      }),
    ],
  }
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

tree.$.users.addOne({ id: 'u1', name: 'Alice' });     // Snapshot 1
tree.$.users.addOne({ id: 'u2', name: 'Bob' });       // Snapshot 2
tree.$.users.updateOne('u1', { name: 'Alice v2' });   // Snapshot 3
tree.$.selectedUserId.set('u1');                       // Snapshot 4

console.log(tree.canUndo());  // true
tree.undo();
// Back to Snapshot 3

console.log(tree.canRedo());  // true
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
import { signalTree, withDevTools } from '@signaltree/core';

const tree = signalTree(
  {
    users: entity<User>('id'),
    posts: entity<Post>('postId'),
  },
  {
    enhancers: [
      withDevTools({
        name: 'My SignalTree App',
        maxAge: 50,  // Keep last 50 mutations
      }),
    ],
  }
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
import { signalTree, withLogging } from '@signaltree/core';

const tree = signalTree(
  {
    users: entity<User>('id'),
    settings: { theme: 'dark' },
  },
  {
    enhancers: [
      withLogging({
        name: 'MyApp',
        
        // Filter which paths to log
        filter: (path) => !path.startsWith('ui'),  // Skip UI updates
        
        // Custom logger
        onLog: (log) => {
          console.log(`[${log.timestamp}] ${log.path}:`, {
            prev: log.prev,
            value: log.value,
          });
        },
        
        // Or use default (console.group)
        collapsed: true,  // Use console.groupCollapsed
      }),
    ],
  }
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

const todoTree = signalTree(
  {
    // Entities
    todos: entity<Todo>('id'),
    
    // UI state
    filter: 'all',  // 'all' | 'active' | 'completed'
    editingId: null as string | null,
  },
  {
    enhancers: [
      withEntities(),
      withPersistence({
        key: 'todos-app',
        filter: (path) => path.startsWith('todos'),  // Only persist todos, not UI
      }),
      withTimeTravel(),
    ],
  }
);

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
  const all = todoTree.$.todos.all();
  return all.filter(t => !t.completed);
});

// Component usage
export function TodoApp() {
  return (
    <div>
      <input
        placeholder="Add a todo..."
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            addTodo(e.target.value);
            e.target.value = '';
          }
        }}
      />

      <div>
        {todoTree.$.todos.all().map((todo) => (
          <div key={todo.id}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.text}
            </span>
            <button onClick={() => deleteTodo(todo.id)}>Delete</button>
          </div>
        ))}
      </div>

      <div>Active: {activeTodos().length}</div>

      <button onClick={() => todoTree.undo()} disabled={!todoTree.canUndo()}>
        Undo
      </button>
      <button onClick={() => todoTree.redo()} disabled={!todoTree.canRedo()}>
        Redo
      </button>
    </div>
  );
}
```

### User Management with Access Control

```typescript
import { signalTree, withEntities } from '@signaltree/core';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

const userTree = signalTree({
  users: entity<User>('id'),
  currentUserId: null as string | null,
}, { enhancers: [withEntities()] });

// Authorization interceptor
userTree.$.users.intercept({
  onAdd: (user, ctx) => {
    const current = userTree.currentUserId();
    const currentUser = current ? userTree.$.users.byId(current)?.() : null;
    
    // Only admins can add users
    if (currentUser?.role !== 'admin') {
      ctx.block('Only admins can add users');
    }
  },

  onUpdate: (id, changes, ctx) => {
    const current = userTree.currentUserId();
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
    const current = userTree.currentUserId();
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
    const current = userTree.$.users.byId(userTree.currentUserId());
    auditLog.write({
      action: 'user_created',
      userId: user.id,
      createdBy: current?.().name,
      timestamp: Date.now(),
    });
  },
  onUpdate: (id, changes) => {
    const current = userTree.$.users.byId(userTree.currentUserId());
    auditLog.write({
      action: 'user_updated',
      userId: id,
      changes,
      updatedBy: current?.().name,
      timestamp: Date.now(),
    });
  },
  onRemove: (id, user) => {
    const current = userTree.$.users.byId(userTree.currentUserId());
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
  userTree.currentUserId.set('admin-id');  // Login as admin
  
  const id = userTree.$.users.addOne({
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'user',
  });
  // ✅ Works - admin can add users
  
  userTree.currentUserId.set('u1');  // Login as Alice
  
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
// Global middleware (broken)
tree.addTap({
  id: 'logger',
  after: (action, payload, prevState, nextState) => {
    console.log(action, payload);  // action: string?
  },
});

tree.addTap({
  id: 'analytics',
  after: (action) => {
    analytics.track(action);  // What action?
  },
});

// Removing is hard
tree.removeTap('logger');
tree.removeTap('analytics');
```

### After (v5.0 - Scoped Entity Hooks)

```typescript
// Scoped entity hooks (fixed)
const loggerUnsub = tree.$.users.tap({
  onAdd: (user, id) => console.log('User added:', user),
  onUpdate: (id, changes) => console.log('User updated:', id, changes),
  onRemove: (id, user) => console.log('User removed:', id),
});

const analyticsUnsub = tree.$.users.tap({
  onAdd: (user) => analytics.track('user_created', { userId: user.id }),
  onUpdate: (id, changes) => analytics.track('user_updated', { userId: id }),
  onRemove: (user) => analytics.track('user_deleted', { userId: user.id }),
});

// Easy unsubscribe
loggerUnsub();
analyticsUnsub();

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

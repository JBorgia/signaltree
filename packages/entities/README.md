# @signaltree/entities

Advanced entity collection management for SignalTree featuring enhanced CRUD operations, entity finding, filtering, querying, and duplicate prevention.

## ✨ What is @signaltree/entities?

The entities package supercharges SignalTree with advanced entity management:

- **Enhanced CRUD operations** beyond basic core functionality
- **Advanced filtering and querying** with predicates and sorting
- **Duplicate prevention** and validation
- **Bulk operations** for performance
- **Optimized for managing** lists of objects with IDs

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/entities
```

## 📖 Basic Usage

```typescript
import { signalTree } from '@signaltree/core';
import { withEntities } from '@signaltree/entities';

const tree = signalTree({
  users: [] as User[],
  posts: [] as Post[],
}).pipe(withEntities());

const users = tree.asCrud<User>('users');

// Enhanced entity operations
users.add({ id: '1', name: 'John', email: 'john@example.com' });
users.addMany([user1, user2, user3]); // Bulk operations
users.updateMany([
  { id: '1', changes: { name: 'John Doe' } },
  { id: '2', changes: { email: 'new@email.com' } },
]);

// Advanced querying
const activeUsers = users.findBy((user) => user.active);
const sortedUsers = users.findBy((user) => user, { sortBy: 'name' });
const paginatedUsers = users.selectPaginated(1, 10);
```

## 🎯 Enhanced Features

### Advanced Filtering and Querying

```typescript
const todoTree = signalTree({
  todos: [] as Todo[],
}).pipe(withEntities());

const todos = todoTree.asCrud<Todo>('todos');

// Complex filtering
const activeTodos = todos.findBy((todo) => !todo.completed);
const highPriorityTodos = todos.findBy((todo) => todo.priority === 'high');
const searchResults = todos.findBy((todo) => todo.title.toLowerCase().includes(searchQuery.toLowerCase()));

// Sorting
const sortedByDate = todos.findBy((todo) => todo, {
  sortBy: 'createdAt',
  sortDirection: 'desc',
});

const sortedByPriority = todos.findBy((todo) => todo, {
  sortBy: (todo) => (todo.priority === 'high' ? 0 : todo.priority === 'medium' ? 1 : 2),
});

// Pagination
const page1 = todos.selectPaginated(1, 10); // Page 1, 10 items per page
const page2 = todos.selectPaginated(2, 10); // Page 2, 10 items per page
```

### Bulk Operations

```typescript
// Add multiple entities efficiently
users.addMany([
  { id: '1', name: 'Alice', role: 'admin' },
  { id: '2', name: 'Bob', role: 'user' },
  { id: '3', name: 'Carol', role: 'user' },
]);

// Update multiple entities
users.updateMany([
  { id: '1', changes: { lastLogin: new Date() } },
  { id: '2', changes: { lastLogin: new Date() } },
]);

// Remove multiple entities
users.removeMany(['1', '2', '3']);

// Upsert multiple (add or update)
users.upsertMany([
  { id: '1', name: 'Alice Updated', role: 'admin' },
  { id: '4', name: 'David', role: 'user' }, // New user
]);
```

### Duplicate Prevention

```typescript
// Automatic duplicate detection
try {
  users.add({ id: '1', name: 'John' });
  users.add({ id: '1', name: 'Jane' }); // Throws error
} catch (error) {
  console.error('Duplicate ID detected:', error.message);
}

// Safe upsert (add or update)
users.upsert({ id: '1', name: 'Updated John' }); // Updates existing

// Conditional add
const wasAdded = users.addIfNotExists({ id: '2', name: 'Jane' });
console.log(wasAdded); // true if added, false if already exists
```

### Advanced Selections

```typescript
// Select with computed properties
const usersWithComputedProps = users.selectAll((user) => ({
  ...user,
  displayName: `${user.firstName} ${user.lastName}`,
  isAdmin: user.role === 'admin',
}));

// Select IDs only
const userIds = users.selectIds();

// Select specific fields
const userNames = users.selectFields(['id', 'name']);

// Count with conditions
const adminCount = users.count((user) => user.role === 'admin');
const totalCount = users.selectTotal();
```

## 🔧 Enhanced Configuration

```typescript
const tree = signalTree({
  products: [] as Product[],
}).pipe(
  withEntities({
    enableDuplicateDetection: true,
    enableOptimisticUpdates: true,
    enableBulkOperations: true,
    defaultSortDirection: 'asc' as 'asc' | 'desc',
  })
);
```

## 📊 Real-World Examples

### User Management System

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  active: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

const userTree = signalTree({
  users: [] as User[],
  filters: {
    role: '' as string,
    active: true,
    search: '',
  },
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
  },
}).pipe(withEntities());

const users = userTree.asCrud<User>('users');

// Complex filtering based on current filters
const filteredUsers = computed(() => {
  const filters = userTree.$.filters();

  return users.findBy(
    (user) => {
      if (filters.role && user.role !== filters.role) return false;
      if (user.active !== filters.active) return false;
      if (filters.search && !user.name.toLowerCase().includes(filters.search.toLowerCase()) && !user.email.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    },
    {
      sortBy: 'name',
      sortDirection: 'asc',
    }
  )();
});

// Paginated view
const paginatedUsers = computed(() => {
  const pagination = userTree.$.pagination();
  const filtered = filteredUsers();

  return users.paginate(filtered, pagination.page, pagination.pageSize);
});

// Component usage
@Component({
  template: `
    <div class="user-controls">
      <input [value]="userTree.$.filters.search()" (input)="updateSearch($event.target.value)" placeholder="Search users..." />

      <select [value]="userTree.$.filters.role()" (change)="updateRoleFilter($event.target.value)">
        <option value="">All Roles</option>
        <option value="admin">Admin</option>
        <option value="user">User</option>
        <option value="moderator">Moderator</option>
      </select>
    </div>

    <div class="user-list">
      @for (user of paginatedUsers(); track user.id) {
      <user-card [user]="user" (edit)="editUser(user.id, $event)" (delete)="deleteUser(user.id)" />
      }
    </div>

    <pagination [currentPage]="userTree.$.pagination.page()" [totalItems]="filteredUsers().length" [pageSize]="userTree.$.pagination.pageSize()" (pageChange)="changePage($event)" />
  `,
})
class UserManagementComponent {
  userTree = userTree;
  users = users;
  filteredUsers = filteredUsers;
  paginatedUsers = paginatedUsers;

  updateSearch(search: string) {
    this.userTree.$.filters.search.set(search);
  }

  updateRoleFilter(role: string) {
    this.userTree.$.filters.role.set(role);
  }

  editUser(id: string, changes: Partial<User>) {
    this.users.update(id, changes);
  }

  deleteUser(id: string) {
    this.users.remove(id);
  }

  changePage(page: number) {
    this.userTree.$.pagination.page.set(page);
  }
}
```

### E-commerce Product Catalog

```typescript
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  rating: number;
  tags: string[];
}

const catalogTree = signalTree({
  products: [] as Product[],
  categories: [] as Category[],
  filters: {
    category: '',
    priceRange: { min: 0, max: 1000 },
    inStockOnly: false,
    minRating: 0,
  },
  sorting: {
    field: 'name' as keyof Product,
    direction: 'asc' as 'asc' | 'desc',
  },
}).pipe(withEntities());

const products = catalogTree.asCrud<Product>('products');

// Advanced product filtering
const filteredProducts = computed(() => {
  const filters = catalogTree.$.filters();
  const sorting = catalogTree.$.sorting();

  return products.findBy(
    (product) => {
      // Category filter
      if (filters.category && product.category !== filters.category) return false;

      // Price range filter
      if (product.price < filters.priceRange.min || product.price > filters.priceRange.max) return false;

      // Stock filter
      if (filters.inStockOnly && !product.inStock) return false;

      // Rating filter
      if (product.rating < filters.minRating) return false;

      return true;
    },
    {
      sortBy: sorting.field,
      sortDirection: sorting.direction,
    }
  )();
});

// Bulk operations for inventory management
const updateInventory = (updates: Array<{ id: string; inStock: boolean; quantity?: number }>) => {
  products.updateMany(
    updates.map((update) => ({
      id: update.id,
      changes: {
        inStock: update.inStock,
        ...(update.quantity !== undefined && { quantity: update.quantity }),
      },
    }))
  );
};

// Bulk price updates
const applyDiscount = (categoryId: string, discountPercent: number) => {
  const categoryProducts = products.findBy((p) => p.category === categoryId)();

  products.updateMany(
    categoryProducts.map((product) => ({
      id: product.id,
      changes: {
        price: Math.round(product.price * (1 - discountPercent / 100) * 100) / 100,
      },
    }))
  );
};
```

### Task Management with Relationships

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  projectId: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  tags: string[];
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface User {
  id: string;
  name: string;
  avatar: string;
}

const taskTree = signalTree({
  tasks: [] as Task[],
  projects: [] as Project[],
  users: [] as User[],
}).pipe(withEntities());

const tasks = taskTree.asCrud<Task>('tasks');
const projects = taskTree.asCrud<Project>('projects');
const users = taskTree.asCrud<User>('users');

// Complex queries with relationships
const getTasksWithDetails = computed(() => {
  const allTasks = tasks.selectAll()();
  const allProjects = projects.selectAll()();
  const allUsers = users.selectAll()();

  return allTasks.map((task) => ({
    ...task,
    project: allProjects.find((p) => p.id === task.projectId),
    assignee: allUsers.find((u) => u.id === task.assigneeId),
  }));
});

// Project-specific task queries
const getTasksByProject = (projectId: string) => tasks.findBy((task) => task.projectId === projectId);

const getTasksByUser = (userId: string) => tasks.findBy((task) => task.assigneeId === userId);

// Advanced filtering
const getOverdueTasks = () => tasks.findBy((task) => task.dueDate && task.dueDate < new Date() && task.status !== 'done');

const getHighPriorityTasks = () =>
  tasks.findBy((task) => task.priority === 'high', {
    sortBy: 'dueDate',
    sortDirection: 'asc',
  });
```

## 🎯 When to Use Entities

Perfect for:

- ✅ User management systems
- ✅ Product catalogs and inventories
- ✅ Task and project management
- ✅ Content management systems
- ✅ Social media feeds
- ✅ Any collection-based data

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { withEntities } from '@signaltree/entities';
import { withMemoization } from '@signaltree/memoization';
import { withAsync } from '@signaltree/async';

const tree = signalTree(state).pipe(
  withEntities(),
  withMemoization(), // Cache expensive queries
  withAsync() // Enhanced async operations
);
```

## 📈 Performance Benefits

- **Optimized bulk operations** for handling large datasets
- **Efficient filtering** with predicate-based queries
- **Smart duplicate detection** prevents data corruption
- **Memoization compatible** for caching expensive queries
- **Minimal overhead** - only ~2KB added to bundle

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Entity Examples](https://signaltree.io/examples/entities)

## 📄 License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

**Manage your collections** with powerful entity operations! 🚀

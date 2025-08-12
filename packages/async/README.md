# @signaltree/async

Advanced async state management for SignalTree featuring retry logic, timeouts, cancellation, debouncing, and enhanced loading/error states.

## ✨ What is @signaltree/async?

The async package extends SignalTree with comprehensive async capabilities:

- **Enhanced loading/error states** with automatic management
- **Retry logic** with exponential backoff
- **Operation timeouts** and cancellation
- **Debouncing** for rapid async calls
- **Comprehensive async utilities** beyond basic core actions

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/async
```

## 📖 Basic Usage

```typescript
import { signalTree } from '@signaltree/core';
import { withAsync } from '@signaltree/async';

const tree = signalTree({
  users: [] as User[],
  posts: [] as Post[],
}).pipe(withAsync());

// Enhanced async actions with auto-managed loading states
const loadUsers = tree.asyncAction(
  async () => {
    return await api.getUsers();
  },
  {
    loadingKey: 'loading.users', // Auto-managed loading state
    errorKey: 'errors.users', // Auto-managed error state
    onSuccess: (users, tree) => tree.$.users.set(users),
    retry: { attempts: 3, delay: 1000 },
  }
);
```

## 🎯 Key Features

### Auto-Managed Loading States

```typescript
const tree = signalTree({
  data: [] as DataItem[],
  loading: {
    users: false,
    posts: false,
    comments: false,
  },
  errors: {
    users: null as string | null,
    posts: null as string | null,
    comments: null as string | null,
  },
}).pipe(withAsync());

// Loading and error states managed automatically
const loadUsers = tree.asyncAction(async () => api.getUsers(), {
  loadingKey: 'loading.users',
  errorKey: 'errors.users',
  onSuccess: (users) => ({ users }),
});

// Usage in component
@Component({
  template: `
    @if (tree.$.loading.users()) {
    <spinner />
    } @else if (tree.$.errors.users()) {
    <error-message [error]="tree.$.errors.users()" />
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
  `,
})
class UsersComponent {
  tree = tree;

  ngOnInit() {
    loadUsers();
  }
}
```

### Retry Logic with Exponential Backoff

```typescript
const robustApiCall = tree.asyncAction(
  async () => {
    return await api.fetchCriticalData();
  },
  {
    retry: {
      attempts: 5,
      delay: 1000, // Start with 1 second
      backoff: 2, // Double each time (1s, 2s, 4s, 8s, 16s)
      maxDelay: 10000, // Cap at 10 seconds
      retryIf: (error) => error.status >= 500, // Only retry server errors
    },
    timeout: 30000, // 30 second timeout
  }
);
```

### Operation Cancellation

```typescript
const searchUsers = tree.asyncAction(
  async (query: string, { signal }) => {
    return await api.searchUsers(query, { signal });
  },
  {
    debounce: 300, // Wait 300ms before executing
    cancelPrevious: true, // Cancel previous calls
  }
);

// Usage
const handleSearch = (query: string) => {
  searchUsers(query); // Previous calls automatically cancelled
};
```

### Debounced Operations

```typescript
const saveDocument = tree.asyncAction(
  async (document: Document) => {
    return await api.saveDocument(document);
  },
  {
    debounce: 1000, // Wait 1 second of inactivity
    onStart: () => ({ saving: true }),
    onSuccess: (result) => ({ saving: false, lastSaved: Date.now() }),
    onError: (error) => ({ saving: false, saveError: error.message }),
  }
);

// Rapid calls are debounced
saveDocument(doc1); // Cancelled
saveDocument(doc2); // Cancelled
saveDocument(doc3); // This one executes after 1s delay
```

## 🔧 Enhanced Configuration Options

```typescript
interface EnhancedAsyncConfig<T, TResult> {
  // Loading state management
  loadingKey?: string; // Path for loading state
  errorKey?: string; // Path for error state

  // Retry configuration
  retry?: {
    attempts: number;
    delay: number;
    backoff?: number; // Multiplier for exponential backoff
    maxDelay?: number; // Maximum delay between attempts
    retryIf?: (error: any) => boolean;
  };

  // Timing
  timeout?: number; // Operation timeout in ms
  debounce?: number; // Debounce delay in ms

  // Cancellation
  cancelPrevious?: boolean; // Cancel previous calls

  // Lifecycle hooks
  onStart?: (state: T) => Partial<T>;
  onSuccess?: (result: TResult, tree: SignalTree<T>) => Partial<T>;
  onError?: (error: Error, state: T) => Partial<T>;
  onFinally?: (state: T) => Partial<T>;
  onCancel?: (state: T) => Partial<T>;
}
```

## 📊 Real-World Examples

### Data Loading with Comprehensive Error Handling

```typescript
const dataTree = signalTree({
  users: [] as User[],
  products: [] as Product[],
  loading: {
    users: false,
    products: false,
  },
  errors: {
    users: null as string | null,
    products: null as string | null,
  },
  lastUpdated: {
    users: null as Date | null,
    products: null as Date | null,
  },
}).pipe(withAsync());

const loadUsers = dataTree.asyncAction(
  async () => {
    const users = await api.getUsers();
    return users;
  },
  {
    loadingKey: 'loading.users',
    errorKey: 'errors.users',
    retry: {
      attempts: 3,
      delay: 1000,
      backoff: 1.5,
    },
    timeout: 10000,
    onSuccess: (users) => ({
      users,
      lastUpdated: { ...dataTree.unwrap().lastUpdated, users: new Date() },
    }),
    onError: (error) => ({
      users: [], // Clear on error
    }),
  }
);

const loadProducts = dataTree.asyncAction(
  async () => {
    return await api.getProducts();
  },
  {
    loadingKey: 'loading.products',
    errorKey: 'errors.products',
    retry: { attempts: 2, delay: 500 },
    onSuccess: (products) => ({
      products,
      lastUpdated: { ...dataTree.unwrap().lastUpdated, products: new Date() },
    }),
  }
);

// Load data in parallel
async function loadAllData() {
  await Promise.all([loadUsers(), loadProducts()]);
}
```

### Real-time Search with Debouncing

```typescript
const searchTree = signalTree({
  query: '',
  results: [] as SearchResult[],
  searching: false,
  searchError: null as string | null,
  totalResults: 0,
}).pipe(withAsync());

const performSearch = searchTree.asyncAction(
  async (query: string) => {
    if (!query.trim()) return { results: [], totalResults: 0 };

    const response = await api.search(query);
    return {
      results: response.results,
      totalResults: response.totalCount,
    };
  },
  {
    debounce: 300, // Wait for pause in typing
    cancelPrevious: true, // Cancel previous searches
    loadingKey: 'searching',
    errorKey: 'searchError',
    onStart: () => ({ results: [] }), // Clear previous results
    onSuccess: (data) => data,
    onCancel: () => ({ searching: false }),
  }
);

// Component usage
@Component({
  template: `
    <input [value]="searchTree.$.query()" (input)="handleSearch($event.target.value)" placeholder="Search..." />

    @if (searchTree.$.searching()) {
    <div>Searching...</div>
    } @if (searchTree.$.searchError()) {
    <div class="error">{{ searchTree.$.searchError() }}</div>
    }

    <div class="results">
      Total: {{ searchTree.$.totalResults() }}
      @for (result of searchTree.$.results(); track result.id) {
      <search-result [result]="result" />
      }
    </div>
  `,
})
class SearchComponent {
  searchTree = searchTree;

  handleSearch(query: string) {
    this.searchTree.$.query.set(query);
    performSearch(query);
  }
}
```

### Form Submission with Validation

```typescript
const formTree = signalTree({
  values: { name: '', email: '', message: '' },
  submitting: false,
  submitError: null as string | null,
  submitSuccess: false,
}).pipe(withAsync());

const submitForm = formTree.asyncAction(
  async (formData: FormData) => {
    // Client-side validation
    if (!formData.email.includes('@')) {
      throw new Error('Invalid email address');
    }

    if (formData.message.length < 10) {
      throw new Error('Message must be at least 10 characters');
    }

    return await api.submitContactForm(formData);
  },
  {
    loadingKey: 'submitting',
    errorKey: 'submitError',
    retry: {
      attempts: 2,
      delay: 1000,
      retryIf: (error) => error.status >= 500, // Only retry server errors
    },
    onStart: () => ({ submitSuccess: false }),
    onSuccess: () => ({
      submitSuccess: true,
      values: { name: '', email: '', message: '' }, // Reset form
    }),
    onError: () => ({ submitSuccess: false }),
  }
);
```

## 🛠️ Utility Functions

### Timeout Operations

```typescript
import { timeout } from '@signaltree/async';

// Add timeout to any promise
const timedOperation = timeout(
  api.slowOperation(),
  5000 // 5 second timeout
);
```

### Retry with Custom Logic

```typescript
import { retry } from '@signaltree/async';

const resilientOperation = retry(async () => await api.unreliableCall(), {
  attempts: 5,
  delay: 1000,
  backoff: 2,
  retryIf: (error) => error.code !== 'AUTH_ERROR',
});
```

### Operation Cancellation

```typescript
import { cancellable } from '@signaltree/async';

const [operation, cancel] = cancellable(async (signal) => {
  return await api.longRunningTask({ signal });
});

// Cancel after 10 seconds
setTimeout(cancel, 10000);
```

## 🎯 When to Use Async

Perfect for:

- ✅ API integrations with error handling
- ✅ Real-time search and filtering
- ✅ Form submissions with validation
- ✅ File uploads and downloads
- ✅ Background data synchronization
- ✅ Retry-critical operations
- ✅ Performance-sensitive async operations

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { withAsync } from '@signaltree/async';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';

const tree = signalTree(state).pipe(withBatching(), withMemoization(), withAsync());
```

## 📈 Performance Benefits

- **Debouncing** reduces unnecessary API calls
- **Cancellation** prevents race conditions
- **Retry logic** improves reliability
- **Timeout handling** prevents hanging operations
- **Minimal overhead** - only ~2KB added to bundle

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Async Examples](https://signaltree.io/examples/async)

## 📄 License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

**Master async operations** with powerful utilities and automatic state management! 🚀

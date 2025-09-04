# @signaltree/presets

Pre-configured SignalTree setups and common patterns for rapid development featuring popular combinations, best practices, and production-ready configurations.

**Bundle size: 0.84KB gzipped**

## What is @signaltree/presets?

The presets package provides ready-to-use SignalTree configurations:

- **Common combinations** of packages with optimal settings
- **Best practice configurations** for typical use cases
- **Production-ready setups** with performance optimizations
- **Starter templates** for different application types
- **Opinionated defaults** that work great out of the box

## Installation

```bash
npm install @signaltree/core @signaltree/presets
```

## Basic usage

```typescript
import { createStandardTree, createFullTree, createMinimalTree } from '@signaltree/presets';

// Standard preset: core + memoization + batching
const tree = createStandardTree({
  count: 0,
  users: [] as User[],
});

// Full-featured preset: all packages with optimal settings
const advancedTree = createFullTree({
  app: { theme: 'light' },
  data: { items: [] },
});

// Minimal preset: just core with basic optimizations
const simpleTree = createMinimalTree({
  toggle: false,
  message: '',
});
```

## Available presets

### Standard Preset

Perfect for most applications - includes core functionality with performance optimizations.

```typescript
import { createStandardTree } from '@signaltree/presets';

const tree = createStandardTree({
  user: { name: '', email: '' },
  settings: { theme: 'light', notifications: true },
  data: { posts: [], comments: [] },
});

// Includes:
// - @signaltree/core (base functionality)
// - @signaltree/memoization (intelligent caching)
// - @signaltree/batching (performance optimization)
// - Optimized for: general application state management
```

### Full-Featured Preset

Everything included - perfect for complex applications that need all capabilities.

```typescript
import { createFullTree } from '@signaltree/presets';

const tree = createFullTree(
  {
    auth: { user: null, token: null },
    ui: { loading: false, errors: [] },
    data: { entities: [], cache: {} },
  },
  {
    // Optional configuration override
    devtools: { enabled: true, name: 'My App' },
    timeTravel: { maxHistorySize: 100 },
    async: { retryAttempts: 3 },
  }
);

// Includes:
// - @signaltree/core
// - @signaltree/memoization
// - @signaltree/batching
// - @signaltree/async
// - @signaltree/entities
// - @signaltree/middleware
// - @signaltree/devtools (dev only)
// - @signaltree/time-travel (dev only)
```

### Minimal Preset

Lightweight option - just the essentials with minimal overhead.

```typescript
import { createMinimalTree } from '@signaltree/presets';

const tree = createMinimalTree({
  isOpen: false,
  currentTab: 0,
  items: [],
});

// Includes:
// - @signaltree/core only
// - Minimal configuration for best performance
// - Perfect for: simple state, components, widgets
```

### Async-Heavy Preset

Optimized for applications with lots of async operations.

```typescript
import { createAsyncTree } from '@signaltree/presets';

const tree = createAsyncTree({
  api: {
    users: { data: null, loading: false, error: null },
    posts: { data: null, loading: false, error: null },
  },
  cache: {},
});

// Includes:
// - @signaltree/core
// - @signaltree/async (enhanced async operations)
// - @signaltree/memoization (cache expensive operations)
// - @signaltree/batching (batch API calls)
// - Pre-configured for: API-heavy applications
```

### Entity Management Preset

Perfect for managing collections of data with CRUD operations.

```typescript
import { createEntityTree } from '@signaltree/presets';

const tree = createEntityTree({
  users: [] as User[],
  posts: [] as Post[],
  comments: [] as Comment[],
  tags: [] as Tag[],
});

// Includes:
// - @signaltree/core
// - @signaltree/entities (enhanced CRUD operations)
// - @signaltree/memoization (cache filtered results)
// - @signaltree/batching (bulk operations)
// - Pre-configured for: data management, admin panels
```

### Development Preset

Enhanced debugging and development experience.

```typescript
import { createDevTree } from '@signaltree/presets';

const tree = createDevTree(
  {
    app: initialState,
  },
  {
    appName: 'My Development App',
    enableTimeTravel: true,
    maxHistorySize: 200,
  }
);

// Includes (development only):
// - @signaltree/core
// - @signaltree/devtools (full debugging)
// - @signaltree/time-travel (undo/redo)
// - @signaltree/memoization
// - Development optimizations
// - Enhanced logging and monitoring
```

## Preset configuration

### Custom Configuration

```typescript
import { createStandardTree } from '@signaltree/presets';

const tree = createStandardTree(initialState, {
  // Override default configurations
  memoization: {
    maxCacheSize: 1000,
    defaultTTL: 60000,
  },
  batching: {
    batchSize: 50,
    flushInterval: 100,
  },
  // Add environment-specific settings
  environment: 'production', // 'development' | 'production' | 'testing'
  enableDevtools: false,
});
```

### Environment-Aware Presets

```typescript
import { createAdaptiveTree } from '@signaltree/presets';

// Automatically adapts configuration based on environment
const tree = createAdaptiveTree(initialState, {
  development: {
    // Full debugging in development
    packages: ['core', 'devtools', 'time-travel', 'memoization', 'batching'],
    devtools: { enabled: true, name: 'Dev App' },
    timeTravel: { maxHistorySize: 200 },
  },
  production: {
    // Optimized for production
    packages: ['core', 'memoization', 'batching'],
    memoization: { maxCacheSize: 5000 },
    batching: { aggressive: true },
  },
  testing: {
    // Minimal for fast tests
    packages: ['core'],
    enableDevtools: false,
  },
});
```

## Real-world examples

### E-commerce Application

```typescript
import { createEntityTree } from '@signaltree/presets';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

interface CartItem {
  productId: string;
  quantity: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  addresses: Address[];
}

const ecommerceTree = createEntityTree(
  {
    // Product catalog
    products: [] as Product[],
    categories: [] as Category[],

    // Shopping cart
    cart: {
      items: [] as CartItem[],
      total: 0,
      tax: 0,
      shipping: 0,
    },

    // User management
    users: [] as User[],
    currentUser: null as User | null,

    // UI state
    ui: {
      searchQuery: '',
      selectedCategory: '',
      sortBy: 'name' as keyof Product,
      currentPage: 1,
    },
  },
  {
    // Optimize for e-commerce patterns
    memoization: {
      // Cache expensive calculations
      cacheKeys: ['filteredProducts', 'cartTotal', 'shippingCost'],
    },
    entities: {
      // Enable bulk operations for inventory management
      enableBulkOperations: true,
      enableDuplicateDetection: true,
    },
  }
);

// Ready-to-use CRUD operations
const products = ecommerceTree.asCrud<Product>('products');
const users = ecommerceTree.asCrud<User>('users');

// Enhanced operations work out of the box
const searchResults = computed(() => {
  const query = ecommerceTree.$.ui.searchQuery();
  const category = ecommerceTree.$.ui.selectedCategory();

  return products.findBy((product) => {
    const matchesSearch = !query || product.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !category || product.category === category;
    return matchesSearch && matchesCategory;
  })();
});
```

### Dashboard Application

```typescript
import { createAsyncTree } from '@signaltree/presets';

const dashboardTree = createAsyncTree(
  {
    // Data sources
    analytics: {
      visitors: { data: null, loading: false, error: null },
      sales: { data: null, loading: false, error: null },
      performance: { data: null, loading: false, error: null },
    },

    // Real-time data
    notifications: [] as Notification[],
    liveMetrics: {
      activeUsers: 0,
      serverHealth: 'unknown',
    },

    // Dashboard configuration
    dashboard: {
      widgets: [] as Widget[],
      layout: 'grid' as 'grid' | 'list',
      refreshInterval: 30000,
    },

    // User preferences
    preferences: {
      theme: 'light' as 'light' | 'dark',
      autoRefresh: true,
      notifications: true,
    },
  },
  {
    // Optimized for real-time dashboards
    async: {
      retryAttempts: 3,
      retryDelay: 1000,
      enableOfflineSupport: true,
    },
    memoization: {
      // Cache dashboard calculations
      defaultTTL: 300000, // 5 minutes
      maxCacheSize: 2000,
    },
  }
);

// Async operations work seamlessly
const loadDashboardData = async () => {
  const asyncOps = dashboardTree._async;

  // Parallel data loading with automatic error handling
  await Promise.all([asyncOps.execute('analytics.visitors', () => fetchVisitorData()), asyncOps.execute('analytics.sales', () => fetchSalesData()), asyncOps.execute('analytics.performance', () => fetchPerformanceData())]);
};

// Auto-refresh setup
effect(() => {
  const { autoRefresh, refreshInterval } = dashboardTree.$.preferences();

  if (autoRefresh) {
    const interval = setInterval(loadDashboardData, refreshInterval);
    return () => clearInterval(interval);
  }
});
```

### Content Management System

```typescript
import { createFullTree } from '@signaltree/presets';

const cmsTree = createFullTree(
  {
    // Content entities
    content: {
      pages: [] as Page[],
      posts: [] as Post[],
      media: [] as MediaFile[],
      categories: [] as Category[],
    },

    // Editor state
    editor: {
      currentDocument: null as Document | null,
      isEditing: false,
      hasUnsavedChanges: false,
      cursor: { line: 0, column: 0 },
    },

    // User management
    auth: {
      currentUser: null as User | null,
      permissions: [] as Permission[],
    },

    // UI state
    ui: {
      activeTab: 'editor',
      sidebarOpen: true,
      theme: 'light',
    },
  },
  {
    // CMS-optimized configuration
    devtools: {
      enabled: true,
      name: 'CMS Editor',
    },
    timeTravel: {
      maxHistorySize: 500,
      // Auto-save on document changes
      snapshots: {
        autoCreateOnMilestones: true,
        milestoneDetector: (action) => action.path.includes('editor.currentDocument'),
      },
    },
    entities: {
      enableBulkOperations: true, // For content management
    },
  }
);

// Document management with version control
@Injectable()
class DocumentService {
  private timeTravel = cmsTree._timeTravel;

  saveDocument() {
    const doc = cmsTree.$.editor.currentDocument();
    if (doc) {
      // Create save point
      this.timeTravel.createSnapshot(`${doc.title} - ${new Date().toLocaleString()}`);
      cmsTree.$.editor.hasUnsavedChanges.set(false);
    }
  }

  revertToVersion(snapshotName: string) {
    this.timeTravel.restoreSnapshot(snapshotName);
    cmsTree.$.editor.hasUnsavedChanges.set(true);
  }

  getDocumentHistory() {
    return this.timeTravel.getSnapshots().filter((s) => s.name.includes(cmsTree.$.editor.currentDocument()?.title || ''));
  }
}
```

### React/Angular Integration

```typescript
// React Hook
import { createStandardTree } from '@signaltree/presets';
import { useSignalTree } from '@signaltree/react'; // Hypothetical React integration

function useAppState() {
  const tree = useMemo(
    () =>
      createStandardTree({
        todos: [] as Todo[],
        filter: 'all' as 'all' | 'active' | 'completed',
      }),
    []
  );

  return useSignalTree(tree);
}

// Angular Service
@Injectable()
class AppStateService {
  private tree = createFullTree(
    {
      user: null as User | null,
      navigation: { currentRoute: '', previousRoute: '' },
      ui: { loading: false, errors: [] },
    },
    {
      devtools: { enabled: !environment.production },
    }
  );

  // Expose specific parts of the tree
  readonly user$ = this.tree.$.user;
  readonly navigation$ = this.tree.$.navigation;
  readonly ui$ = this.tree.$.ui;

  // High-level operations
  setUser(user: User) {
    this.tree.$.user.set(user);
  }

  navigate(route: string) {
    this.tree.$.navigation.previousRoute.set(this.tree.$.navigation.currentRoute());
    this.tree.$.navigation.currentRoute.set(route);
  }
}
```

## Choosing the right preset

| Preset       | Best For                   | Bundle Size (gzipped) | Features           |
| ------------ | -------------------------- | --------------------- | ------------------ |
| **Minimal**  | Simple components, widgets | ~7.1KB                | Core only          |
| **Standard** | Most applications          | ~8.2KB                | Core + performance |
| **Async**    | API-heavy apps             | ~10.2KB               | Enhanced async     |
| **Entity**   | Data management            | ~6.9KB                | CRUD operations    |
| **Full**     | Complex applications       | ~25KB                 | All features       |
| **Dev**      | Development/debugging      | ~25.3KB               | All + debugging    |

## Composition and customization

```typescript
import { createPreset } from '@signaltree/presets';

// Create custom preset
const myCustomPreset = createPreset({
  packages: ['core', 'memoization', 'async'],
  defaultConfig: {
    memoization: { maxCacheSize: 1000 },
    async: { retryAttempts: 5 },
  },
  environmentOverrides: {
    development: {
      packages: ['core', 'memoization', 'async', 'devtools'],
    },
  },
});

// Use custom preset
const tree = myCustomPreset(initialState);
```

## Performance benefits

- **Optimized combinations**: Packages configured to work together efficiently
- **Environment awareness**: Different configurations for dev/prod
- **Best practices**: Pre-configured with proven patterns
- **Tree shaking**: Only includes what you need
- **Bundle optimization**: Minimized overhead for each preset

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Preset Examples](https://signaltree.io/examples/presets)

## License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

Get started quickly with battle-tested configurations.

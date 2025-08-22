# @signaltree/middleware

Middleware system for SignalTree that intercepts state changes with before/after hooks, logging, performance tracking, and validation middleware.

## ✨ What is @signaltree/middleware?

The middleware package provides powerful interception capabilities:

- **Before/after hooks** for state updates
- **Can prevent updates** by returning false
- **Built-in middleware** for logging, performance tracking, validation
- **Runtime middleware** addition/removal
- **Tap into state changes** for debugging and validation

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/middleware
```

## 📖 Basic Usage

```typescript
import { signalTree } from '@signaltree/core';
import { withMiddleware, createLoggingMiddleware } from '@signaltree/middleware';

const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark' },
}).pipe(withMiddleware([createLoggingMiddleware({ logLevel: 'info' })]));

// All state changes now logged automatically
tree.$.user.name.set('John'); // Logs: "State updated: user.name = John"
```

## 🧹 Factories Split & Bundle Hygiene

As of v1.1.9, heavy middleware implementations (logging, performance, persistence) are now available via a secondary entrypoint:

- **Factories path:** `@signaltree/middleware/factories`
- **Main entry:** Only includes lightweight dynamic wrappers; heavy logic is loaded on demand.
- **Dynamic wrappers:** Logging, performance, and persistence middleware creators are now dynamic wrappers that lazy-load their full implementations.
- **Bundle-size claims:** All packages now meet their gzipped size claims, including middleware.

**How to use advanced factories:**

```typescript
import { createLoggingMiddleware } from '@signaltree/middleware/factories';
```

For most use cases, the main entry is sufficient and keeps your bundle minimal.

---

## 🎯 Key Features

### Custom Middleware

```typescript
// Create custom middleware
const validationMiddleware = (context) => ({
  before: (path, newValue, currentState) => {
    console.log(`Before update: ${path} = ${newValue}`);

    // Prevent invalid updates
    if (path === 'user.email' && !newValue.includes('@')) {
      console.warn('Invalid email format');
      return false; // Prevents the update
    }

    return true; // Allow the update
  },

  after: (path, newValue, previousState, currentState) => {
    console.log(`After update: ${path} changed from ${previousState} to ${newValue}`);

    // Trigger side effects
    if (path.startsWith('user.')) {
      localStorage.setItem('lastUserUpdate', Date.now().toString());
    }
  },
});

const tree = signalTree(state).pipe(withMiddleware([validationMiddleware]));
```

### Built-in Middleware

```typescript
import { createLoggingMiddleware, createPerformanceMiddleware, createValidationMiddleware } from '@signaltree/middleware';

const tree = signalTree(state).pipe(
  withMiddleware([
    createLoggingMiddleware({
      logLevel: 'debug',
      includeTimestamp: true,
    }),
    createPerformanceMiddleware({
      warnThreshold: 16, // Warn if update takes >16ms
    }),
    createValidationMiddleware({
      rules: {
        'user.email': (value) => value.includes('@') || 'Invalid email',
        'user.age': (value) => value >= 0 || 'Age must be positive',
      },
    }),
  ])
);
```

### Runtime Middleware Management

```typescript
// Add middleware at runtime
tree.addMiddleware('audit', {
  before: (path, value) => {
    auditLog.record('BEFORE_UPDATE', { path, value, timestamp: Date.now() });
    return true;
  },
  after: (path, value) => {
    auditLog.record('AFTER_UPDATE', { path, value, timestamp: Date.now() });
  },
});

// Remove middleware
tree.removeMiddleware('audit');

// Replace middleware
tree.addMiddleware('logging', newLoggingMiddleware); // Replaces existing
```

## 🔧 Middleware API

```typescript
interface Middleware<T> {
  id?: string; // Optional ID for runtime management
  before?: (path: string, newValue: any, currentState: T, context: MiddlewareContext) => boolean | void; // Return false to prevent update

  after?: (path: string, newValue: any, previousState: T, currentState: T, context: MiddlewareContext) => void;
}
```

## 📊 Real-World Examples

### Audit Logging System

```typescript
import { createAuditMiddleware } from '@signaltree/middleware';

const auditMiddleware = createAuditMiddleware({
  endpoint: '/api/audit',
  includeUser: true,
  sensitiveFields: ['password', 'token'],
  batchSize: 10,
});

const tree = signalTree({
  user: { id: '', name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
}).pipe(withMiddleware([auditMiddleware]));

// All changes automatically audited
tree.$.user.name.set('John'); // Audited: { action: 'UPDATE', path: 'user.name', value: 'John', timestamp: ... }
```

### Permission-Based Updates

```typescript
const permissionMiddleware = {
  before: (path, value, state, context) => {
    const userRole = getCurrentUserRole();

    // Check permissions based on path
    if (path.startsWith('admin.') && userRole !== 'admin') {
      console.warn('Unauthorized: Admin access required');
      return false;
    }

    if (path.startsWith('user.') && !hasPermission('user.edit')) {
      console.warn('Unauthorized: User edit permission required');
      return false;
    }

    return true;
  },
};

const tree = signalTree(state).pipe(withMiddleware([permissionMiddleware]));

// Updates blocked if user lacks permissions
tree.$.admin.settings.set(newSettings); // Blocked if not admin
```

### Performance Monitoring

```typescript
const performanceMiddleware = {
  before: (path, value, state, context) => {
    context.startTime = performance.now();
    return true;
  },

  after: (path, value, prevState, currState, context) => {
    const duration = performance.now() - context.startTime;

    if (duration > 16) {
      console.warn(`Slow update detected: ${path} took ${duration.toFixed(2)}ms`);
    }

    // Send to analytics
    analytics.track('state_update', {
      path,
      duration,
      stateSize: JSON.stringify(currState).length,
    });
  },
};
```

### Data Synchronization

```typescript
const syncMiddleware = {
  after: async (path, value, prevState, currState) => {
    // Sync specific changes to server
    if (path.startsWith('user.profile.')) {
      try {
        await api.updateUserProfile(currState.user.profile);
        console.log('Profile synced to server');
      } catch (error) {
        console.error('Failed to sync profile:', error);
        // Could trigger a retry or rollback
      }
    }

    // Sync to localStorage
    if (path.startsWith('settings.')) {
      localStorage.setItem('userSettings', JSON.stringify(currState.settings));
    }
  },
};
```

## 🎮 Built-in Middleware Options

### Logging Middleware

```typescript
createLoggingMiddleware({
  logLevel: 'info' | 'debug' | 'warn' | 'error',
  includeTimestamp: true,
  includeState: false,
  formatMessage: (path, value) => `Updated ${path} = ${value}`,
  filter: (path) => !path.includes('temp'), // Skip temporary fields
});
```

### Performance Middleware

```typescript
createPerformanceMiddleware({
  warnThreshold: 16, // Warn if update takes >16ms
  errorThreshold: 100, // Error if update takes >100ms
  includeStackTrace: true, // Include stack trace for slow updates
  onSlowUpdate: (path, duration) => {
    // Custom handling for slow updates
  },
});
```

### Validation Middleware

```typescript
createValidationMiddleware({
  rules: {
    'user.email': [(value) => value.includes('@') || 'Must be valid email', (value) => value.length > 3 || 'Email too short'],
    'user.age': (value) => (value >= 0 && value <= 150) || 'Invalid age',
  },
  onValidationError: (path, value, errors) => {
    console.error(`Validation failed for ${path}:`, errors);
  },
});
```

## 🔍 Debugging with Middleware

```typescript
const debugMiddleware = {
  before: (path, value, state) => {
    console.group(`🔄 Updating ${path}`);
    console.log('New value:', value);
    console.log('Current state:', state);
    return true;
  },

  after: (path, value, prevState, currState) => {
    console.log('Previous state:', prevState);
    console.log('New state:', currState);
    console.groupEnd();
  },
};

// Only in development
const tree = signalTree(state).pipe(withMiddleware(process.env['NODE_ENV'] === 'development' ? [debugMiddleware] : []));
```

## 🎯 When to Use Middleware

Perfect for:

- ✅ Audit logging and compliance
- ✅ Permission and authorization checks
- ✅ Performance monitoring
- ✅ Data validation and sanitization
- ✅ State synchronization
- ✅ Debugging and development tools
- ✅ Analytics and telemetry

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { withMiddleware } from '@signaltree/middleware';
import { withBatching } from '@signaltree/batching';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree(state).pipe(withBatching(), withMiddleware([loggingMiddleware, auditMiddleware]), withDevTools());
```

## 📈 Performance Considerations

- **Minimal overhead** - only ~1KB added to bundle
- **Efficient execution** - middleware only runs when state changes
- **Conditional middleware** - can be disabled in production
- **Batching compatible** - works seamlessly with batched updates

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Middleware Examples](https://signaltree.io/examples/middleware)

## 📄 License

MIT License - see the [LICENSE](../../LICENSE) file for details.

---

**Intercept and enhance** your state changes with powerful middleware! 🚀

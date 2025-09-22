# @signaltree/middleware

Middleware system for SignalTree that intercepts state changes with before/after hooks, logging, performance tracking, and validation middleware.

## What is @signaltree/middleware?

The middleware package provides powerful interception capabilities:

- **Before/after hooks** for state updates with full control
- **Can prevent updates** by returning false from validation
- **Built-in middleware** for logging, performance tracking, validation
- **Runtime middleware** addition/removal for dynamic behavior
- **Tap into state changes** for debugging and validation
- Compact bundle: Complete middleware system in ~1.38KB gzipped
- Low overhead: Optimized for SignalTree's 0.061–0.109ms performance
- Production-ready: Enterprise-grade state interception and validation

## Installation

```bash
npm install @signaltree/core @signaltree/middleware
```

## Basic usage

```typescript
import { signalTree } from '@signaltree/core';
import { withMiddleware, createLoggingMiddleware } from '@signaltree/middleware';

const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark' },
}).with(withMiddleware([createLoggingMiddleware({ logLevel: 'info' })]));

// All state changes now logged automatically
tree.$.user.name.set('John'); // Logs: "State updated: user.name = John"
```

## Key features

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

const tree = signalTree(state).with(withMiddleware([validationMiddleware]));
```

### Built-in Middleware

```typescript
import { createLoggingMiddleware, createPerformanceMiddleware, createValidationMiddleware } from '@signaltree/middleware';

const tree = signalTree(state).with(
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
// Add a tap (middleware) at runtime
tree.addTap({
  id: 'audit',
  before: (path, value) => {
    auditLog.record('BEFORE_UPDATE', { path, value, timestamp: Date.now() });
    return true;
  },
  after: (path, value) => {
    auditLog.record('AFTER_UPDATE', { path, value, timestamp: Date.now() });
  },
});

// Remove a tap
tree.removeTap('audit');

// Replace a tap by re-adding with the same id
tree.addTap({ id: 'logging', ...newLoggingMiddleware }); // Replaces existing by id
```

## Middleware API

```typescript
interface Middleware<T> {
  id?: string; // Optional ID for runtime management
  before?: (path: string, newValue: any, currentState: T, context: MiddlewareContext) => boolean | void; // Return false to prevent update

  after?: (path: string, newValue: any, previousState: T, currentState: T, context: MiddlewareContext) => void;
}
```

## Real-world examples

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
}).with(withMiddleware([auditMiddleware]));

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

const tree = signalTree(state).with(withMiddleware([permissionMiddleware]));

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

## Built-in middleware options

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

## Debugging with middleware

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
const tree = signalTree(state).with(withMiddleware(process.env['NODE_ENV'] === 'development' ? [debugMiddleware] : []));
```

## When to use middleware

Perfect for:

- Audit logging and compliance
- Permission and authorization checks
- Performance monitoring
- Data validation and sanitization
- State synchronization
- Debugging and development tools
- Analytics and telemetry

## Composition with other packages

```typescript
import { signalTree } from '@signaltree/core';
import { withMiddleware } from '@signaltree/middleware';
import { withBatching } from '@signaltree/batching';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree(state).with(withBatching(), withMiddleware([loggingMiddleware, auditMiddleware]), withDevTools());
```

## Performance considerations

- **Minimal overhead** - only ~1KB added to bundle
- **Efficient execution** - middleware only runs when state changes
- **Conditional middleware** - can be disabled in production
- **Batching compatible** - works seamlessly with batched updates

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Middleware Examples](https://signaltree.io/examples/middleware)

## License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

Intercept and enhance state changes with powerful middleware.

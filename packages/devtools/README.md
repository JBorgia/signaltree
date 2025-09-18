# @signaltree/devtools

Powerful development and debugging tools for SignalTree featuring time-travel debugging, state visualization, performance monitoring, and comprehensive logging.

**Bundle size: 2.49KB gzipped**

## What is @signaltree/devtools?

The devtools package provides comprehensive development and debugging capabilities:

- **Time-travel debugging** with state history
- **Visual state inspection** and tree visualization
- **Performance monitoring** and profiling
- **Action logging** and replay
- **Dev/prod environment detection**
- **Browser DevTools integration**

## Installation

```bash
npm install @signaltree/core @signaltree/devtools
```

## Basic usage

```typescript
import { signalTree } from '@signaltree/core';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree({
  count: 0,
  user: { name: 'John', age: 30 },
}).with(
  withDevTools({
    name: 'MyApp',
    enabled: true, // automatically detects dev environment
  })
);

// All state changes are now tracked and debuggable
tree.$.count.set(1); // Logged: "count changed from 0 to 1"
tree.$.user.name.set('Jane'); // Logged: "user.name changed from 'John' to 'Jane'"
```

## Core features

### Time-travel debugging

```typescript
const tree = signalTree({
  todos: [] as Todo[],
  filter: 'all' as 'all' | 'completed' | 'pending',
}).with(
  withDevTools({
    name: 'TodoApp',
    maxHistorySize: 50,
  })
);

// All changes are automatically tracked
tree.$.todos.update((todos) => [...todos, newTodo]);
tree.$.filter.set('completed');
tree.$.todos.update((todos) => todos.filter((t) => t.id !== deletedId));

// Access debugging methods
const devtools = tree._devtools;

// Travel through state history
devtools.undo(); // Undo last action
devtools.redo(); // Redo undone action
devtools.jumpTo(5); // Jump to specific history point

// Inspect history
console.log(devtools.getHistory()); // Get all state snapshots
console.log(devtools.getCurrentIndex()); // Current position in history
console.log(devtools.canUndo()); // Can undo?
console.log(devtools.canRedo()); // Can redo?
```

### State visualization

```typescript
const tree = signalTree({
  app: {
    theme: 'dark',
    settings: {
      notifications: true,
      language: 'en',
    },
  },
  data: {
    users: [],
    posts: [],
  },
}).with(withDevTools());

const devtools = tree._devtools;

// Get formatted state tree
console.log(devtools.getStateTree());
// Output:
// ├── app
// │   ├── theme: "dark"
// │   └── settings
// │       ├── notifications: true
// │       └── language: "en"
// └── data
//     ├── users: []
//     └── posts: []

// Get state diff between snapshots
const diff = devtools.getStateDiff(3, 5);
console.log(diff);
// Shows what changed between history points 3 and 5
```

### Performance monitoring

```typescript
const tree = signalTree({
  largeArray: new Array(10000).fill(0),
  computedValues: {},
}).with(
  withDevTools({
    trackPerformance: true,
    performanceThreshold: 1, // Log operations taking >1ms (tune per app)
  })
);

const devtools = tree._devtools;

// Monitor performance
tree.$.largeArray.update((arr) => arr.map((x) => x + 1)); // Automatically timed

// Get performance metrics
const metrics = devtools.getPerformanceMetrics();
console.log(metrics);
// {
//   totalOperations: 15,
//   averageTime: 5.2,
//   slowestOperation: { time: 23, action: 'largeArray update', timestamp: ... },
//   operationsAboveThreshold: 2
// }

// Get detailed performance log
const perfLog = devtools.getPerformanceLog();
perfLog.forEach((entry) => {
  console.log(`${entry.action}: ${entry.duration}ms`);
});
```

### Action logging and replay

```typescript
const tree = signalTree({
  counter: 0,
  messages: [] as string[],
}).with(
  withDevTools({
    logActions: true,
    logLevel: 'detailed', // 'minimal' | 'standard' | 'detailed'
  })
);

// Actions are automatically logged with context
tree.$.counter.set(5);
// Log: [14:32:15] ACTION: counter.set(5) | Previous: 0 | New: 5

tree.$.messages.update((msgs) => [...msgs, 'Hello']);
// Log: [14:32:16] ACTION: messages.update | Previous: [] | New: ['Hello']

const devtools = tree._devtools;

// Export action sequence
const actions = devtools.exportActions();
console.log(actions);
// [
//   { type: 'set', path: 'counter', value: 5, timestamp: ... },
//   { type: 'update', path: 'messages', args: [...], timestamp: ... }
// ]

// Replay actions (useful for testing)
devtools.replayActions(actions);

// Clear action log
devtools.clearActionLog();
```

## Advanced configuration

```typescript
const tree = signalTree(state).with(
  withDevTools({
    // Basic settings
    name: 'MyApplication',
    enabled: process.env.NODE_ENV === 'development',

    // History settings
    maxHistorySize: 100, // Max snapshots to keep
    enableTimeTravel: true,

    // Logging settings
    logActions: true,
    logLevel: 'detailed', // 'minimal' | 'standard' | 'detailed'
    logFilter: (action) => !action.path.includes('_internal'),

    // Performance settings
    trackPerformance: true,
    performanceThreshold: 1, // ms (tune per environment and workloads)

    // Browser DevTools integration
    connectToReduxDevTools: true,
    devToolsOptions: {
      name: 'SignalTree App',
      maxAge: 50,
      trace: true,
    },

    // State serialization
    serialize: {
      // Custom serializer for complex objects
      user: (user) => ({ ...user, password: '[HIDDEN]' }),
      dates: (date) => date?.toISOString(),
    },

    // Action filtering
    actionFilter: (action) => {
      // Don't log frequent UI updates
      return !action.path.includes('ui.mouse');
    },
  })
);
```

## Browser DevTools integration

```typescript
// Automatic Redux DevTools Extension support
const tree = signalTree(state).with(
  withDevTools({
    connectToReduxDevTools: true,
    devToolsOptions: {
      name: 'My SignalTree App',
      maxAge: 50, // Keep last 50 actions
      trace: true, // Show stack traces
      traceLimit: 25,
    },
  })
);

// Now visible in Redux DevTools browser extension!
// - View state tree in real-time
// - See action history
// - Time-travel through state changes
// - Export/import state snapshots
```

## Examples

### Development dashboard

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isLoading: boolean;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
  data: {
    posts: Post[];
    comments: Comment[];
    cache: Record<string, any>;
  };
}

const appTree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isLoading: false,
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
  data: {
    posts: [],
    comments: [],
    cache: {},
  },
}).with(
  withDevtools({
    name: 'Social Media App',
    maxHistorySize: 200,
    logLevel: 'detailed',
    trackPerformance: true,

    // Filter out noisy UI actions
    actionFilter: (action) => !action.path.includes('ui.mouse') && !action.path.includes('ui.scroll'),

    // Hide sensitive data in logs
    serialize: {
      'auth.token': () => '[TOKEN]',
      'auth.user.password': () => '[HIDDEN]',
    },
  })
);

// Development component for debugging
@Component({
  template: `
    <div class="devtools-panel" *ngIf="isDev">
      <h3>🛠️ DevTools</h3>

      <div class="state-info">
        <h4>State History</h4>
        <p>Current: {{ currentIndex() }} / {{ historyLength() }}</p>
        <button (click)="undo()" [disabled]="!canUndo()">↶ Undo</button>
        <button (click)="redo()" [disabled]="!canRedo()">↷ Redo</button>
      </div>

      <div class="performance-info">
        <h4>Performance</h4>
        <p>Avg Operation Time: {{ avgTime() }}ms</p>
        <p>Slow Operations: {{ slowOps() }}</p>
      </div>

      <div class="state-tree">
        <h4>Current State</h4>
        <pre>{{ stateTree() }}</pre>
      </div>

      <div class="actions">
        <h4>Recent Actions</h4>
        <div class="action-list">
          @for (action of recentActions(); track action.id) {
          <div class="action-item">
            <span class="timestamp">{{ action.timestamp | date : 'HH:mm:ss' }}</span>
            <span class="path">{{ action.path }}</span>
            <span class="type">{{ action.type }}</span>
          </div>
          }
        </div>
      </div>
    </div>
  `,
})
class DevToolsComponent {
  isDev = !environment.production;
  devtools = appTree._devtools;

  currentIndex = computed(() => this.devtools.getCurrentIndex());
  historyLength = computed(() => this.devtools.getHistory().length);
  canUndo = computed(() => this.devtools.canUndo());
  canRedo = computed(() => this.devtools.canRedo());

  avgTime = computed(() => {
    const metrics = this.devtools.getPerformanceMetrics();
    return metrics.averageTime.toFixed(1);
  });

  slowOps = computed(() => {
    const metrics = this.devtools.getPerformanceMetrics();
    return metrics.operationsAboveThreshold;
  });

  stateTree = computed(() => this.devtools.getStateTree());

  recentActions = computed(() => {
    return this.devtools.getActionLog().slice(-10).reverse();
  });

  undo() {
    this.devtools.undo();
  }

  redo() {
    this.devtools.redo();
  }
}
```

### Testing and Debugging Utilities

```typescript
// Test utilities using devtools
export class SignalTreeTestUtils {
  static createTestTree<T>(initialState: T) {
    return signalTree(initialState).with(
      withDevTools({
        name: 'Test Tree',
        enabled: true,
        maxHistorySize: 1000,
      })
    );
  }

  static async replayUserSession(tree: any, sessionActions: any[]) {
    const devtools = tree._devtools;

    // Clear current state
    devtools.reset();

    // Replay actions with timing
    for (const action of sessionActions) {
      await new Promise((resolve) => setTimeout(resolve, action.delay || 0));
      devtools.replayAction(action);
    }
  }

  static captureStateChanges<T>(tree: any, callback: () => void): T[] {
    const devtools = tree._devtools;
    const initialIndex = devtools.getCurrentIndex();

    callback();

    const finalIndex = devtools.getCurrentIndex();
    const history = devtools.getHistory();

    return history.slice(initialIndex, finalIndex + 1);
  }

  static assertStateSequence(tree: any, expectedStates: any[]) {
    const devtools = tree._devtools;
    const history = devtools.getHistory();
    const recent = history.slice(-expectedStates.length);

    expect(recent).toEqual(expectedStates);
  }
}

// Usage in tests
describe('User workflow', () => {
  it('should handle complete user registration', async () => {
    const tree = SignalTreeTestUtils.createTestTree({
      user: null,
      registrationStep: 1,
      errors: [],
    });

    // Capture all state changes during workflow
    const stateChanges = SignalTreeTestUtils.captureStateChanges(tree, () => {
      // Simulate user registration steps
      tree.$.registrationStep.set(2);
      tree.$.user.set({ name: 'John', email: 'john@test.com' });
      tree.$.registrationStep.set(3);
    });

    expect(stateChanges).toHaveLength(3);
    expect(stateChanges[2].user).toEqual({ name: 'John', email: 'john@test.com' });
  });

  it('should replay production error scenario', async () => {
    const tree = SignalTreeTestUtils.createTestTree(initialState);

    // Replay actual user session that caused error
    await SignalTreeTestUtils.replayUserSession(tree, productionErrorActions);

    // Verify final state matches expected error state
    expect(tree.$.errors().length).toBeGreaterThan(0);
  });
});
```

### Production Error Tracking

```typescript
// Production error tracking with devtools
const tree = signalTree(state).with(
  withDevTools({
    name: 'Production App',
    enabled: true, // Even in production for error tracking
    logLevel: 'minimal',
    maxHistorySize: 20, // Keep minimal history

    // Only log errors and critical actions
    actionFilter: (action) => action.path.includes('error') || action.type === 'critical' || action.path.includes('auth'),

    // Custom error reporter
    onAction: (action) => {
      if (action.path.includes('error')) {
        // Send error context to monitoring service
        errorReportingService.captureException(new Error('State Error'), {
          extra: {
            action,
            stateSnapshot: tree._devtools.getCurrentState(),
            history: tree._devtools.getHistory().slice(-5),
          },
        });
      }
    },
  })
);
```

## When to use devtools

Perfect for:

- ✅ Development and debugging
- ✅ Testing complex state flows
- ✅ Performance optimization
- ✅ Production error tracking
- ✅ User session replay
- ✅ State audit trails

## Composition with other packages

```typescript
import { signalTree } from '@signaltree/core';
import { withDevTools } from '@signaltree/devtools';
import { withTimeTravel } from '@signaltree/time-travel';
// withAsync removed — async features now via middleware helpers

const tree = signalTree(state).with(
  // withAsync removed — use middleware helpers where needed
  withTimeTravel(), // Additional time-travel features
  withDevTools() // Full debugging capabilities
);
```

## Performance impact

- **Development**: Full featured debugging with minimal performance impact
- **Production**: Configurable to enable only error tracking
- **Bundle size**: ~2.49KB gzipped in development, strips to <1KB in production builds
- **Memory usage**: Configurable history size limits memory consumption

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [DevTools Examples](https://signaltree.io/examples/devtools)

## License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

Debug and optimize your SignalTree applications.

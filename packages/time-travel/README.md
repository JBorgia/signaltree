# @signaltree/time-travel

Advanced time-travel debugging and state history management for SignalTree with undo/redo, snapshots, state persistence, and timeline navigation.

## ✨ What is @signaltree/time-travel?

The time-travel package provides sophisticated state history management:

- **Undo/Redo operations** with configurable depth
- **State snapshots** and bookmarking
- **Timeline navigation** with branching support
- **State persistence** across sessions
- **Action replay** and debugging
- **History compression** for memory efficiency

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/time-travel
```

## 📖 Basic Usage

```typescript
import { signalTree } from '@signaltree/core';
import { withTimeTravel } from '@signaltree/time-travel';

const tree = signalTree({
  count: 0,
  text: '',
  todos: [] as Todo[],
}).pipe(
  withTimeTravel({
    maxHistorySize: 50,
  })
);

// Make changes - all automatically tracked
tree.$.count.set(1);
tree.$.text.set('Hello');
tree.$.todos.update((todos) => [...todos, newTodo]);

// Time travel controls
const timeTravel = tree._timeTravel;
timeTravel.undo(); // Back to text: 'Hello', count: 1
timeTravel.undo(); // Back to count: 1, text: ''
timeTravel.undo(); // Back to initial state

timeTravel.redo(); // Forward to count: 1
timeTravel.redo(); // Forward to text: 'Hello'
timeTravel.redo(); // Forward to final state
```

## 🎯 Core Features

### Undo/Redo Operations

```typescript
const tree = signalTree({
  editor: {
    content: '',
    cursor: 0,
    selection: null,
  },
}).pipe(
  withTimeTravel({
    maxHistorySize: 100,
    trackChanges: true,
  })
);

const timeTravel = tree._timeTravel;

// Make some changes
tree.$.editor.content.set('Hello');
tree.$.editor.content.set('Hello World');
tree.$.editor.cursor.set(11);

// Navigation
console.log(timeTravel.canUndo()); // true
console.log(timeTravel.canRedo()); // false

timeTravel.undo(); // cursor: 0
timeTravel.undo(); // content: 'Hello'
timeTravel.undo(); // content: ''

console.log(timeTravel.canRedo()); // true
timeTravel.redo(); // content: 'Hello'

// Jump to specific point
timeTravel.jumpTo(2); // Go to specific history index
timeTravel.jumpToEnd(); // Go to latest state
timeTravel.jumpToStart(); // Go to initial state
```

### State Snapshots and Bookmarks

```typescript
const tree = signalTree({
  document: {
    title: '',
    content: '',
    metadata: {},
  },
}).pipe(withTimeTravel());

const timeTravel = tree._timeTravel;

// Create named snapshots
tree.$.document.title.set('My Document');
tree.$.document.content.set('Introduction...');
const checkpoint1 = timeTravel.createSnapshot('intro-complete');

tree.$.document.content.set('Introduction...\n\nBody content...');
const checkpoint2 = timeTravel.createSnapshot('body-added');

tree.$.document.content.set('Full document with conclusion');
const checkpoint3 = timeTravel.createSnapshot('final-draft');

// Navigate to snapshots
timeTravel.restoreSnapshot('intro-complete');
console.log(tree.$.document.content()); // 'Introduction...'

timeTravel.restoreSnapshot('final-draft');
console.log(tree.$.document.content()); // 'Full document with conclusion'

// List all snapshots
const snapshots = timeTravel.getSnapshots();
snapshots.forEach((snapshot) => {
  console.log(`${snapshot.name}: ${snapshot.timestamp}`);
});

// Delete snapshots
timeTravel.deleteSnapshot('body-added');
```

### Timeline Navigation and Branching

```typescript
const tree = signalTree({
  canvas: {
    shapes: [] as Shape[],
    selectedId: null as string | null,
  },
}).pipe(
  withTimeTravel({
    enableBranching: true,
  })
);

const timeTravel = tree._timeTravel;

// Create main timeline
tree.$.canvas.shapes.update((shapes) => [...shapes, circle]);
tree.$.canvas.shapes.update((shapes) => [...shapes, rectangle]);
tree.$.canvas.selectedId.set(rectangle.id);

// Go back and create branch
timeTravel.jumpTo(1); // Back to just circle
tree.$.canvas.shapes.update((shapes) => [...shapes, triangle]); // Creates new branch
tree.$.canvas.selectedId.set(triangle.id);

// Navigate branches
const timeline = timeTravel.getTimeline();
console.log(timeline.branches.length); // 2 branches

// Switch between branches
timeTravel.switchToBranch(0); // Original branch (circle + rectangle)
timeTravel.switchToBranch(1); // New branch (circle + triangle)

// Merge branches
timeTravel.mergeBranches(0, 1, (state1, state2) => ({
  ...state1,
  canvas: {
    ...state1.canvas,
    shapes: [...state1.canvas.shapes, ...state2.canvas.shapes.slice(1)],
  },
}));
```

### State Persistence

```typescript
const tree = signalTree({
  preferences: {
    theme: 'light',
    language: 'en',
  },
  workingData: {
    projects: [],
    openFiles: [],
  },
}).pipe(
  withTimeTravel({
    persistence: {
      enabled: true,
      key: 'my-app-history',
      storage: localStorage, // or sessionStorage
      exclude: ['workingData.temp'], // Don't persist temporary data
      maxStorageSize: 1024 * 1024, // 1MB limit
    },
  })
);

const timeTravel = tree._timeTravel;

// History is automatically saved to localStorage
tree.$.preferences.theme.set('dark');

// On app restart, history is restored
timeTravel.loadPersistedHistory();

// Manual persistence operations
timeTravel.saveToStorage();
timeTravel.clearStoredHistory();

// Check persistence status
const persistenceInfo = timeTravel.getPersistenceInfo();
console.log(persistenceInfo);
// {
//   isEnabled: true,
//   storageKey: 'my-app-history',
//   currentSize: 15420,
//   maxSize: 1048576,
//   lastSaved: Date
// }
```

## 🔧 Advanced Configuration

```typescript
const tree = signalTree(state).pipe(
  withTimeTravel({
    // History settings
    maxHistorySize: 200,
    autoSaveInterval: 5000, // Auto-save every 5 seconds

    // Branching settings
    enableBranching: true,
    maxBranches: 10,
    branchNamingStrategy: 'timestamp', // 'timestamp' | 'sequential' | 'custom'

    // Performance settings
    compressionEnabled: true,
    compressionThreshold: 50, // Compress after 50 states

    // Persistence settings
    persistence: {
      enabled: true,
      key: 'app-time-travel',
      storage: localStorage,
      debounceMs: 1000, // Debounce saves
      exclude: ['ui.transient', 'cache.*'],
      maxStorageSize: 2 * 1024 * 1024, // 2MB
      serializer: {
        serialize: (state) => JSON.stringify(state),
        deserialize: (json) => JSON.parse(json),
      },
    },

    // Action filtering
    actionFilter: (action) => {
      // Don't track mouse movements or transient UI state
      return !action.path.includes('ui.mouse') && !action.path.includes('transient');
    },

    // Custom state diffing
    stateDiffer: (oldState, newState) => {
      // Custom logic for determining state changes
      return !isEqual(oldState, newState);
    },

    // Snapshot settings
    snapshots: {
      autoCreateOnMilestones: true,
      milestoneDetector: (action) => action.path.includes('save'),
      maxSnapshots: 20,
      namingStrategy: (action) => `auto-save-${Date.now()}`,
    },
  })
);
```

## 📊 Real-World Examples

### Document Editor with Version Control

```typescript
interface DocumentState {
  document: {
    id: string;
    title: string;
    content: string;
    lastSaved: Date | null;
  };
  editor: {
    cursor: number;
    selection: { start: number; end: number } | null;
    isDirty: boolean;
  };
  version: {
    major: number;
    minor: number;
    patch: number;
  };
}

const editorTree = signalTree<DocumentState>({
  document: {
    id: '',
    title: 'Untitled',
    content: '',
    lastSaved: null,
  },
  editor: {
    cursor: 0,
    selection: null,
    isDirty: false,
  },
  version: {
    major: 1,
    minor: 0,
    patch: 0,
  },
}).pipe(
  withTimeTravel({
    maxHistorySize: 500,
    enableBranching: true,
    persistence: {
      enabled: true,
      key: 'document-editor-history',
      storage: localStorage,
      exclude: ['editor.cursor', 'editor.selection'], // Don't persist transient editor state
    },
    snapshots: {
      autoCreateOnMilestones: true,
      milestoneDetector: (action) => action.path === 'document.lastSaved',
      namingStrategy: (action, state) => `v${state.version.major}.${state.version.minor}.${state.version.patch}`,
    },
  })
);

const timeTravel = editorTree._timeTravel;

// Service for document operations
@Injectable()
class DocumentService {
  constructor(private editorTree = editorTree) {}

  // Save document and create version snapshot
  saveDocument() {
    const currentState = this.editorTree.$();

    // Update save timestamp
    this.editorTree.$.document.lastSaved.set(new Date());
    this.editorTree.$.editor.isDirty.set(false);

    // Create version snapshot
    const version = `v${currentState.version.major}.${currentState.version.minor}.${currentState.version.patch}`;
    timeTravel.createSnapshot(version);

    // Increment patch version
    this.editorTree.$.version.patch.update((p) => p + 1);
  }

  // Create major version branch
  createMajorVersion() {
    const currentSnapshot = timeTravel.createSnapshot('pre-major-version');

    // Create new branch for major version
    const branchName = `v${this.editorTree.$.version.major() + 1}.0.0`;
    timeTravel.createBranch(branchName);

    // Update version in new branch
    this.editorTree.$.version.major.update((v) => v + 1);
    this.editorTree.$.version.minor.set(0);
    this.editorTree.$.version.patch.set(0);
  }

  // Revert to specific version
  revertToVersion(versionSnapshot: string) {
    timeTravel.restoreSnapshot(versionSnapshot);
    this.editorTree.$.editor.isDirty.set(true);
  }

  // Get version history
  getVersionHistory() {
    return timeTravel
      .getSnapshots()
      .filter((s) => s.name.startsWith('v'))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

// Component for version control UI
@Component({
  template: `
    <div class="version-control">
      <div class="current-version">
        <h3>Version: {{ currentVersion() }}</h3>
        <button (click)="save()" [disabled]="!isDirty()">💾 Save ({{ isDirty() ? 'unsaved changes' : 'saved' }})</button>
      </div>

      <div class="time-travel-controls">
        <button (click)="undo()" [disabled]="!canUndo()">↶ Undo</button>
        <button (click)="redo()" [disabled]="!canRedo()">↷ Redo</button>
        <span class="history-position">{{ currentIndex() }} / {{ historyLength() }}</span>
      </div>

      <div class="version-history">
        <h4>Version History</h4>
        @for (version of versionHistory(); track version.name) {
        <div class="version-item">
          <span class="version-name">{{ version.name }}</span>
          <span class="version-date">{{ version.timestamp | date }}</span>
          <button (click)="revertTo(version.name)">Revert</button>
        </div>
        }
      </div>

      <div class="branch-controls">
        <h4>Branches</h4>
        <button (click)="createMajorVersion()">Create Major Version Branch</button>
        @for (branch of branches(); track branch.name) {
        <div class="branch-item">
          <span [class.active]="branch.isActive">{{ branch.name }}</span>
          <button (click)="switchBranch(branch.name)">Switch</button>
        </div>
        }
      </div>
    </div>
  `,
})
class VersionControlComponent {
  constructor(private documentService: DocumentService) {}

  currentVersion = computed(() => {
    const v = editorTree.$.version();
    return `${v.major}.${v.minor}.${v.patch}`;
  });

  isDirty = computed(() => editorTree.$.editor.isDirty());
  canUndo = computed(() => timeTravel.canUndo());
  canRedo = computed(() => timeTravel.canRedo());
  currentIndex = computed(() => timeTravel.getCurrentIndex());
  historyLength = computed(() => timeTravel.getHistory().length);

  versionHistory = computed(() => this.documentService.getVersionHistory());
  branches = computed(() => timeTravel.getBranches());

  save() {
    this.documentService.saveDocument();
  }

  undo() {
    timeTravel.undo();
  }

  redo() {
    timeTravel.redo();
  }

  revertTo(version: string) {
    this.documentService.revertToVersion(version);
  }

  createMajorVersion() {
    this.documentService.createMajorVersion();
  }

  switchBranch(branchName: string) {
    timeTravel.switchToBranch(branchName);
  }
}
```

### Game State with Save/Load System

```typescript
interface GameState {
  player: {
    name: string;
    level: number;
    experience: number;
    health: number;
    inventory: Item[];
  };
  world: {
    currentLevel: number;
    unlockedLevels: number[];
    gameTime: number;
  };
  settings: {
    difficulty: 'easy' | 'normal' | 'hard';
    sound: boolean;
    graphics: 'low' | 'medium' | 'high';
  };
}

const gameTree = signalTree<GameState>(initialGameState).pipe(
  withTimeTravel({
    maxHistorySize: 1000,
    enableBranching: true,
    persistence: {
      enabled: true,
      key: 'game-save-data',
      storage: localStorage,
      exclude: ['settings.*'], // Settings handled separately
      maxStorageSize: 5 * 1024 * 1024, // 5MB for game saves
    },
    snapshots: {
      autoCreateOnMilestones: true,
      milestoneDetector: (action) =>
        action.path === 'world.currentLevel' || // Level progression
        action.path === 'player.level', // Character progression
      namingStrategy: (action, state) => {
        if (action.path === 'world.currentLevel') {
          return `Level ${state.world.currentLevel} Reached`;
        }
        if (action.path === 'player.level') {
          return `Character Level ${state.player.level}`;
        }
        return `Auto Save ${new Date().toLocaleString()}`;
      },
    },
  })
);

const timeTravel = gameTree._timeTravel;

// Game service with save/load functionality
@Injectable()
class GameService {
  // Create named save file
  createSaveFile(saveName: string) {
    const saveData = {
      snapshot: timeTravel.createSnapshot(saveName),
      timestamp: new Date(),
      playerLevel: gameTree.$.player.level(),
      worldLevel: gameTree.$.world.currentLevel(),
      playtime: gameTree.$.world.gameTime(),
    };

    // Store in dedicated save slot
    localStorage.setItem(`game-save-${saveName}`, JSON.stringify(saveData));
    return saveData;
  }

  // Load from save file
  loadSaveFile(saveName: string) {
    const saveData = localStorage.getItem(`game-save-${saveName}`);
    if (saveData) {
      const parsed = JSON.parse(saveData);
      timeTravel.restoreSnapshot(saveName);
      return true;
    }
    return false;
  }

  // Quick save (for checkpoint system)
  quickSave() {
    return this.createSaveFile(`quicksave-${Date.now()}`);
  }

  // Create save point before risky action
  createCheckpoint(checkpointName: string) {
    return timeTravel.createSnapshot(`checkpoint-${checkpointName}`);
  }

  // Revert to checkpoint (for "retry" functionality)
  revertToCheckpoint(checkpointName: string) {
    timeTravel.restoreSnapshot(`checkpoint-${checkpointName}`);
  }

  // Get all save files
  getAllSaveFiles() {
    const saves: any[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('game-save-')) {
        const saveData = JSON.parse(localStorage.getItem(key)!);
        saves.push({
          name: key.replace('game-save-', ''),
          ...saveData,
        });
      }
    }
    return saves.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Rewind recent actions (for "undo last action")
  undoLastAction() {
    timeTravel.undo();
  }

  // Create branch for "what if" scenarios
  createAlternatePath(pathName: string) {
    timeTravel.createBranch(pathName);
  }
}
```

### Testing with Time Travel

```typescript
// Test utilities using time-travel
export class TimeTravelTestUtils {
  static createTestTreeWithTimeTravel<T>(initialState: T) {
    return signalTree(initialState).pipe(
      withTimeTravel({
        maxHistorySize: 1000,
        enableBranching: true,
        persistence: { enabled: false }, // Disable persistence in tests
      })
    );
  }

  static captureActionSequence(tree: any, actions: () => void) {
    const timeTravel = tree._timeTravel;
    const initialIndex = timeTravel.getCurrentIndex();

    actions();

    const finalIndex = timeTravel.getCurrentIndex();
    return {
      initialState: timeTravel.getHistory()[initialIndex],
      finalState: timeTravel.getHistory()[finalIndex],
      actionCount: finalIndex - initialIndex,
    };
  }

  static testUndoRedoSequence(tree: any, actions: () => void) {
    const timeTravel = tree._timeTravel;
    const initialState = tree.$();

    // Perform actions
    actions();
    const finalState = tree.$();

    // Test undo to initial
    while (timeTravel.canUndo()) {
      timeTravel.undo();
    }
    expect(tree.$()).toEqual(initialState);

    // Test redo to final
    while (timeTravel.canRedo()) {
      timeTravel.redo();
    }
    expect(tree.$()).toEqual(finalState);
  }
}

// Example tests
describe('Shopping Cart with Time Travel', () => {
  it('should handle complete shopping workflow with undo/redo', () => {
    const tree = TimeTravelTestUtils.createTestTreeWithTimeTravel({
      cart: { items: [], total: 0 },
      user: { isLoggedIn: false },
    });

    TimeTravelTestUtils.testUndoRedoSequence(tree, () => {
      tree.$.user.isLoggedIn.set(true);
      tree.$.cart.items.update((items) => [...items, { id: '1', price: 10 }]);
      tree.$.cart.total.set(10);
      tree.$.cart.items.update((items) => [...items, { id: '2', price: 15 }]);
      tree.$.cart.total.set(25);
    });
  });

  it('should create snapshots at checkout milestones', () => {
    const tree = signalTree({
      cart: { items: [], step: 'shopping' },
      checkout: { address: null, payment: null },
    }).pipe(
      withTimeTravel({
        snapshots: {
          autoCreateOnMilestones: true,
          milestoneDetector: (action) => action.path === 'cart.step',
        },
      })
    );

    const timeTravel = tree._timeTravel;

    // Simulate checkout flow
    tree.$.cart.step.set('address');
    tree.$.checkout.address.set({ street: '123 Main St' });

    tree.$.cart.step.set('payment');
    tree.$.checkout.payment.set({ method: 'credit' });

    tree.$.cart.step.set('confirmation');

    // Should have snapshots for each step
    const snapshots = timeTravel.getSnapshots();
    expect(snapshots.length).toBe(3);

    // Test restoration
    timeTravel.restoreSnapshot(snapshots[0].name);
    expect(tree.$.cart.step()).toBe('address');
  });
});
```

## 🎯 When to Use Time Travel

Perfect for:

- ✅ Document editors and content creation tools
- ✅ Drawing and design applications
- ✅ Game state management with save/load
- ✅ Form builders with undo/redo
- ✅ Testing and debugging complex workflows
- ✅ Version control systems

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { withTimeTravel } from '@signaltree/time-travel';
import { withDevtools } from '@signaltree/devtools';
import { withAsync } from '@signaltree/async';

const tree = signalTree(state).pipe(
  withAsync(), // Enhanced async operations
  withTimeTravel(), // Time travel and history
  withDevtools() // Additional debugging features
);
```

## 📈 Performance Considerations

- **Memory usage**: Configurable history size prevents memory leaks
- **Storage efficiency**: Built-in compression for large histories
- **Persistence optimization**: Debounced saves and size limits
- **Bundle size**: ~1.5KB gzipped, tree-shakeable
- **Operation speed**: Optimized for fast undo/redo operations

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Time Travel Examples](https://signaltree.io/examples/time-travel)

## 📄 License

MIT License - see the [LICENSE](../../LICENSE) file for details.

---

**Master time and state** with powerful time-travel capabilities! ⏰

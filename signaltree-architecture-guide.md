# SignalTree Architecture Guide

A comprehensive guide to architecting applications with SignalTree, covering architectural options, decision frameworks, and implementation patterns.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Architecture Options](#architecture-options)
3. [Decision Matrix](#decision-matrix)
4. [Domain State Structure Options](#domain-state-structure-options)
5. [Common Patterns](#common-patterns)
6. [Common Misconceptions](#common-misconceptions)
7. [Evaluating Existing Implementations](#evaluating-existing-implementations)
8. [Summary: Recommended Default Architecture](#summary-recommended-default-architecture)

---

## Core Principles

SignalTree's value proposition centers on three pillars:

1. **Unified State Tree**: Single source of truth with dot notation access (`tree.$.domain.property()`)
2. **Invisible Infrastructure**: Users work directly with entities, not thinking about underlying systems
3. **Callable Signal Syntax**: Clean, intuitive API without boilerplate

Any architectural decision should preserve these principles.

---

## Architecture Options

### Option 1: Single Tree, Direct Access

Components inject and access the tree directly. No intermediary layers.

```typescript
// app-tree.ts
export const appTree = signalTree<AppState>({...}).with(entities<Plant>('plants'));

// component.ts
export class PlantsComponent {
  private tree = inject(APP_TREE);
  readonly plants = this.tree.$.plants.selectAll;

  add(plant: Plant) { this.tree.$.plants.add(plant); }
}
```

| Pros                | Cons                                  |
| ------------------- | ------------------------------------- |
| Minimal boilerplate | API calls scattered across components |
| Full type inference | No business logic encapsulation       |
| Zero indirection    |                                       |

**Best for:** Small apps, prototypes, teams comfortable with distributed logic

---

### Option 2: Single Tree + Orchestration Facades

Facades exist only to coordinate multi-step or cross-domain operations.

```typescript
// plants.facade.ts
@Injectable({ providedIn: 'root' })
export class PlantsFacade {
  private tree = inject(APP_TREE);
  private api = inject(PlantsApi);

  async loadWithSchedules(gardenId: string) {
    const [plants, schedules] = await Promise.all([...]);
    this.tree.batchUpdate(() => {
      this.tree.$.plants.entities.set(plants);
      this.tree.$.schedules.entities.set(schedules);
    });
  }
}

// component.ts - direct tree access for reads, facade for orchestration
export class PlantsComponent {
  private tree = inject(APP_TREE);
  private facade = inject(PlantsFacade);

  readonly plants = this.tree.$.plants.entities.selectAll;

  ngOnInit() { this.facade.loadWithSchedules(this.gardenId); }
  delete(id: string) { this.tree.$.plants.entities.remove(id); } // Direct for simple ops
}
```

| Pros                    | Cons                                        |
| ----------------------- | ------------------------------------------- |
| Clean separation        | Must decide per-operation where logic lives |
| Facades earn their keep |                                             |
| Simple ops stay simple  |                                             |

**Best for:** Medium-to-large apps with complex workflows

---

### Option 3: Single Tree + Attached Methods

Extend the tree object itself with domain methods. No separate facade classes.

```typescript
// app-tree.ts
const baseTree = signalTree<AppState>({...}).with(entities<Plant>('plants.entities'));

export const appTree = Object.assign(baseTree, {
  plants: {
    ...baseTree.$.plants,
    async loadWithSchedules(api: PlantsApi, gardenId: string) {
      const [plants, schedules] = await Promise.all([...]);
      baseTree.batchUpdate(() => {
        baseTree.$.plants.entities.set(plants);
        baseTree.$.schedules.entities.set(schedules);
      });
    }
  }
});

// component.ts
export class PlantsComponent {
  private tree = inject(APP_TREE);

  ngOnInit() { this.tree.plants.loadWithSchedules(this.api, this.gardenId); }
}
```

| Pros                         | Cons                                |
| ---------------------------- | ----------------------------------- |
| Single object to inject      | Tree object grows large             |
| Methods colocated with state | Harder to test methods in isolation |

**Best for:** Teams that want cohesion over separation

---

### Option 4: Single Tree + Feature Tokens

Each feature module gets a typed slice token, but all point to same tree.

```typescript
// plants-feature.ts
export const PLANTS_STATE = new InjectionToken<typeof appTree.$.plants>('PlantsState', {
  factory: () => inject(APP_TREE).$.plants,
});

// gardens-feature.ts
export const GARDENS_STATE = new InjectionToken<typeof appTree.$.gardens>('GardensState', {
  factory: () => inject(APP_TREE).$.gardens,
});

// component.ts
export class PlantsComponent {
  private plants = inject(PLANTS_STATE);
  readonly all = this.plants.entities.selectAll;
}
```

| Pros                                 | Cons                                               |
| ------------------------------------ | -------------------------------------------------- |
| Feature modules only see their slice | Extra tokens to maintain                           |
| Enforces boundaries                  | Cross-feature access requires additional injection |

**Best for:** Large apps with strict feature boundaries, multiple teams

---

### Option 5: Domain-Scoped Trees (Multiple Trees)

Separate tree instance per domain.

```typescript
// plants-tree.ts
export const plantsTree = signalTree<PlantsState>({...}).with(entities<Plant>('entities'));

// gardens-tree.ts
export const gardensTree = signalTree<GardensState>({...}).with(entities<Garden>('entities'));

// component.ts
export class DashboardComponent {
  private plants = inject(PLANTS_TREE);
  private gardens = inject(GARDENS_TREE);

  // Cross-domain? Manual coordination
  async transferPlant(plantId: string, gardenId: string) {
    await this.api.transfer(plantId, gardenId);
    this.plants.$.entities.update(plantId, { gardenId });
    this.gardens.$.entities.update(gardenId, { plantCount: count + 1 });
  }
}
```

| Pros                   | Cons                                |
| ---------------------- | ----------------------------------- |
| Domain isolation       | Cross-domain coordination is manual |
| Smaller tree instances | Loses unified dot notation          |
|                        | Must know which tree to inject      |

**Best for:** Truly independent domains with minimal cross-talk (rare)

---

### Option 6: Component-Scoped Trees

Each component creates its own tree instance for local state.

```typescript
@Component({...})
export class PlantEditorComponent {
  private localTree = signalTree({
    draft: null as Plant | null,
    validation: { errors: [] as string[], touched: false },
    saving: false
  });

  readonly draft = this.localTree.$.draft;
  readonly errors = this.localTree.$.validation.errors;

  save() {
    this.localTree.$.saving.set(true);
    // ...
  }
}
```

| Pros                         | Cons                                |
| ---------------------------- | ----------------------------------- |
| Fully isolated               | Can't share state                   |
| Automatic cleanup on destroy | Repeated patterns across components |
| No global state pollution    |                                     |

**Best for:** Complex forms, wizards, isolated interactive widgets

---

### Option 7: Hybrid Global + Local

Global tree for shared state, component signals or mini-trees for UI-only state.

```typescript
@Component({...})
export class PlantsListComponent {
  // Global shared state
  private tree = inject(APP_TREE);
  readonly plants = this.tree.$.plants.entities.selectAll;

  // Local UI state - never needs to be shared
  readonly showFilters = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly sortColumn = signal<'name' | 'date'>('name');

  toggleFilters() { this.showFilters.update(v => !v); }
}
```

| Pros                    | Cons                                |
| ----------------------- | ----------------------------------- |
| Right tool for each job | Two mental models (tree vs signals) |
| Global state stays lean |                                     |

**Best for:** Most apps—this is the recommended default

---

### Option 8: Composed Sub-Trees

Global tree composed from domain sub-trees. Single access point, modular definition.

```typescript
// domains/plants.tree.ts
export const plantsSlice = {
  entities: [] as Plant[],
  filters: { search: '', status: 'all' as PlantStatus },
  operations: {
    load: { status: 'idle' as OperationStatus, error: null as string | null },
  },
};

// domains/gardens.tree.ts
export const gardensSlice = {
  entities: [] as Garden[],
  selected: null as string | null,
};

// app-tree.ts
export const appTree = signalTree({
  plants: plantsSlice,
  gardens: gardensSlice,
  auth: { userId: null as string | null },
  ui: { theme: 'light' as Theme },
}).with(entities<Plant>('plants.entities'), entities<Garden>('gardens.entities'));
```

| Pros                                   | Cons                      |
| -------------------------------------- | ------------------------- |
| Modular definition                     | Nested paths in enhancers |
| Single runtime tree                    |                           |
| Domains can be developed independently |                           |

**Best for:** Large apps wanting modular code organization without fragmenting runtime

---

### Option 9: Service-Per-Entity

Each entity type gets a dedicated service wrapping tree access.

```typescript
@Injectable({ providedIn: 'root' })
export class PlantService {
  private tree = inject(APP_TREE);
  private api = inject(PlantsApi);

  readonly entities = this.tree.$.plants.entities;
  readonly all = this.entities.selectAll;
  readonly byId = (id: string) => this.entities.selectById(id);

  async load() {
    const plants = await this.api.getAll();
    this.entities.set(plants);
  }

  async create(plant: Omit<Plant, 'id'>) {
    const created = await this.api.create(plant);
    this.entities.add(created);
    return created;
  }
}
```

| Pros                   | Cons                               |
| ---------------------- | ---------------------------------- |
| Familiar pattern       | One more layer                     |
| Testable services      | Potential for pass-through methods |
| Encapsulated API logic |                                    |

**Best for:** Teams coming from NgRx/Akita wanting similar structure

---

### Option 10: CQRS-Style Separation

Explicit separation between read projections and write commands.

```typescript
// queries.ts - Read-only projections
export function plantQueries(tree: AppTree) {
  return {
    all: tree.$.plants.entities.selectAll,
    active: computed(() => tree.$.plants.entities.selectAll()().filter(p => p.active)),
    byGarden: (id: string) => computed(() =>
      tree.$.plants.entities.selectAll()().filter(p => p.gardenId === id)
    ),
    stats: computed(() => ({
      total: tree.$.plants.entities.selectAll()().length,
      needsWater: tree.$.plants.entities.selectAll()().filter(p => p.needsWater).length
    }))
  };
}

// commands.ts - Write operations
export function plantCommands(tree: AppTree, api: PlantsApi) {
  return {
    async load() { ... },
    async create(plant: NewPlant) { ... },
    async water(id: string) { ... },
    async transfer(id: string, gardenId: string) { ... }
  };
}
```

| Pros                              | Cons        |
| --------------------------------- | ----------- |
| Clear read/write separation       | More files  |
| Queries are pure computed         | Indirection |
| Commands encapsulate side effects |             |

**Best for:** Complex domains with many derived states and business operations

---

### Option 11: Micro-Frontend Style

Independent feature trees communicating via events or shared minimal contract.

```typescript
// Feature A
export const plantsMicrofrontend = {
  tree: signalTree<PlantsState>({...}),
  events: new Subject<PlantEvent>(),

  init() {
    globalEventBus.on('garden:deleted', (gardenId) => {
      this.tree.$.entities.removeBy(p => p.gardenId === gardenId);
    });
  }
};

// Feature B publishes
gardensTree.events.pipe(
  filter(e => e.type === 'deleted')
).subscribe(e => globalEventBus.emit('garden:deleted', e.gardenId));
```

| Pros                            | Cons                        |
| ------------------------------- | --------------------------- |
| True isolation                  | Complex coordination        |
| Independent deployment possible | Eventual consistency issues |
|                                 | Debugging harder            |

**Best for:** Actual micro-frontends with separate deployments

---

### Option 12: Redux-Like Actions

Explicit action objects with reducer-style handlers.

```typescript
// actions.ts
export type PlantAction = { type: 'plants/load'; payload: Plant[] } | { type: 'plants/add'; payload: Plant } | { type: 'plants/remove'; payload: string };

// reducer.ts
export function handlePlantAction(tree: AppTree, action: PlantAction) {
  switch (action.type) {
    case 'plants/load':
      tree.$.plants.entities.set(action.payload);
      break;
    case 'plants/add':
      tree.$.plants.entities.add(action.payload);
      break;
    case 'plants/remove':
      tree.$.plants.entities.remove(action.payload);
      break;
  }
}

// dispatch helper
export function dispatch(action: PlantAction) {
  handlePlantAction(appTree, action);
  devTools?.send(action);
}
```

| Pros                     | Cons                                          |
| ------------------------ | --------------------------------------------- |
| Familiar to Redux users  | Boilerplate                                   |
| Action log for debugging | Loses SignalTree's direct mutation simplicity |
| Easy DevTools            |                                               |

**Best for:** Teams wanting Redux patterns without Redux, heavy DevTools reliance

---

### Option 13: Repository + Unit of Work

Database-inspired pattern with explicit save/commit.

```typescript
@Injectable({ providedIn: 'root' })
export class PlantRepository {
  private tree = inject(APP_TREE);
  private pending = new Map<string, Partial<Plant>>();

  get(id: string) {
    return this.tree.$.plants.entities.selectById(id);
  }
  getAll() {
    return this.tree.$.plants.entities.selectAll;
  }

  stage(id: string, changes: Partial<Plant>) {
    this.pending.set(id, { ...this.pending.get(id), ...changes });
  }

  async commit() {
    const updates = Array.from(this.pending.entries());
    await this.api.bulkUpdate(updates);

    this.tree.batchUpdate(() => {
      for (const [id, changes] of updates) {
        this.tree.$.plants.entities.update(id, changes);
      }
    });

    this.pending.clear();
  }

  rollback() {
    this.pending.clear();
  }
}
```

| Pros                   | Cons                     |
| ---------------------- | ------------------------ |
| Batch changes          | Complexity               |
| Explicit commit points | Pending state management |
| Easy rollback          |                          |

**Best for:** Complex forms with draft/commit semantics, offline-first apps

---

### Option 14: RxJS Interop Layer

Bridge SignalTree with RxJS for complex async flows.

```typescript
// interop.ts
export function treeSlice$<T>(selector: () => T): Observable<T> {
  return toObservable(computed(selector));
}

// effects.ts
@Injectable({ providedIn: 'root' })
export class PlantEffects {
  private tree = inject(APP_TREE);

  readonly autoSave$ = treeSlice$(() => this.tree.$.plants.entities.selectAll()()).pipe(
    debounceTime(5000),
    switchMap((plants) => this.api.bulkSave(plants))
  );

  readonly loadOnGardenChange$ = treeSlice$(() => this.tree.$.gardens.selected()).pipe(
    filter(Boolean),
    distinctUntilChanged(),
    switchMap((gardenId) => this.api.getPlantsByGarden(gardenId)),
    tap((plants) => this.tree.$.plants.entities.set(plants))
  );
}
```

| Pros                              | Cons                                  |
| --------------------------------- | ------------------------------------- |
| Full RxJS power for complex async | Two reactive systems                  |
| Familiar to Angular devs          | Potential memory leaks if not managed |

**Best for:** Complex async requirements, real-time streams, teams expert in RxJS

---

### Option 15: Minimal SignalTree

Use SignalTree only where its features are needed. Vanilla signals elsewhere.

```typescript
// Only entities need SignalTree
export const entitiesTree = signalTree({
  plants: { entities: [] as Plant[] },
  gardens: { entities: [] as Garden[] },
}).with(entities<Plant>('plants.entities'), entities<Garden>('gardens.entities'));

// Everything else is vanilla signals
export const authState = {
  userId: signal<string | null>(null),
  token: signal<string | null>(null),
  isAuthenticated: computed(() => authState.token() !== null),
};

export const uiState = {
  theme: signal<'light' | 'dark'>('light'),
  sidebarOpen: signal(true),
};
```

| Pros                          | Cons                         |
| ----------------------------- | ---------------------------- |
| Use each tool where it shines | Multiple state containers    |
| Minimal overhead              | Inconsistent access patterns |

**Best for:** Gradual adoption, performance-critical apps wanting minimal abstraction

---

### Option 16: Feature Store Factory

Factory function producing configured stores per feature.

```typescript
// store.factory.ts
export function createFeatureStore<TEntity extends { id: string }>(
  name: string,
  api: CrudApi<TEntity>
) {
  const tree = signalTree({
    entities: [] as TEntity[],
    meta: {
      operations: {
        load: { status: 'idle' as OperationStatus, error: null as string | null },
        save: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  }).with(entities<TEntity>('entities'));

  return {
    // State
    entities: tree.$.entities,
    operations: tree.$.meta.operations,

    // Operations
    async load() {
      tree.$.meta.operations.load.status.set('pending');
      try {
        const data = await api.getAll();
        tree.$.entities.set(data);
        tree.$.meta.operations.load.status.set('success');
      } catch (e) {
        tree.$.meta.operations.load.set({ status: 'error', error: e.message });
      }
    },

    async create(entity: Omit<TEntity, 'id'>) { ... },
    async update(id: string, changes: Partial<TEntity>) { ... },
    async remove(id: string) { ... }
  };
}

// Usage
export const plantStore = createFeatureStore('plants', plantsApi);
export const gardenStore = createFeatureStore('gardens', gardensApi);
```

| Pros                 | Cons                            |
| -------------------- | ------------------------------- |
| Consistent patterns  | Multiple tree instances         |
| Reduced boilerplate  | Cross-store coordination manual |
| Easy to add features |                                 |

**Best for:** Apps with many similar CRUD domains

---

## Decision Matrix

| Scenario                      | Recommended Option                              |
| ----------------------------- | ----------------------------------------------- |
| Small app, single dev         | Option 1 (Direct Access) or Option 15 (Minimal) |
| Medium app, simple domains    | Option 7 (Hybrid Global + Local)                |
| Medium app, complex workflows | Option 2 (Orchestration Facades)                |
| Large app, multiple teams     | Option 4 (Feature Tokens) + Option 2            |
| Complex async, real-time      | Option 14 (RxJS Interop)                        |
| Offline-first, draft/commit   | Option 13 (Repository)                          |
| Many similar CRUD domains     | Option 16 (Feature Store Factory)               |
| Heavy debugging needs         | Option 12 (Redux-Like)                          |
| Micro-frontends               | Option 11                                       |
| Strict read/write separation  | Option 10 (CQRS)                                |

---

## Domain State Structure Options

There are three common approaches to organizing domain state. Choose based on your access patterns, team preferences, and application size.

---

### Option A: Flat (Entities Only)

Domain key contains only the entity array. No metadata in tree—handle loading/filtering in components or services.

```typescript
{
  plants: Plant[],
  gardens: Garden[],
  auth: { user: User | null, token: string | null },
  ui: { theme: 'light' | 'dark' }
}
```

**Access Patterns:**

```typescript
tree.$.plants.selectAll();
tree.$.plants.add(plant);
entities<Plant>('plants');
```

| Pros                       | Cons                                              |
| -------------------------- | ------------------------------------------------- |
| Simplest structure         | No place for operation/filter state               |
| Cleanest entity access     | Loading states live elsewhere (component signals) |
| `entities` path is minimal | Less cohesive domain representation               |
| Easy to understand         |                                                   |

**Best for:** Simple apps, prototypes, apps where loading/filter state lives in components

---

### Option B: Domain-Grouped with Meta

Entities and metadata grouped under domain, with metadata nested in a `meta` object.

```typescript
{
  plants: {
    entities: Plant[],
    meta: {
      operations: {
        load: { status: 'idle', error: null },
        save: { status: 'idle', error: null }
      },
      filters: { search: '', status: 'all' },
      sort: { field: 'name', direction: 'asc' },
      pagination: { page: 1, pageSize: 20, total: 0, hasMore: true }
    }
  },
  gardens: {
    entities: Garden[],
    meta: {
      operations: {
        load: { status: 'idle', error: null }
      },
      selected: null
    }
  }
}
```

**Access Patterns:**

```typescript
tree.$.plants.entities.selectAll();
tree.$.plants.meta.operations.load.status();
tree.$.plants.meta.filters.search.set('fern');
entities<Plant>('plants.entities');
```

| Pros                                            | Cons                |
| ----------------------------------------------- | ------------------- |
| Clear separation: entities vs metadata          | Extra nesting depth |
| Consistent `meta` convention across domains     | More verbose access |
| Easy to identify what's data vs what's UI state |                     |
| Feature slices are portable                     |                     |

**Best for:** Medium-to-large apps wanting clear entity/metadata separation, teams preferring explicit structure

---

### Option C: Domain-Grouped (Flat Siblings)

Entities and metadata as siblings under domain key—no `meta` wrapper.

```typescript
{
  plants: {
    entities: Plant[],
    operations: {
      load: { status: 'idle', error: null },
      save: { status: 'idle', error: null }
    },
    filters: { search: '', status: 'all' },
    sort: { field: 'name', direction: 'asc' },
    pagination: { page: 1, pageSize: 20, total: 0, hasMore: true }
  },
  gardens: {
    entities: Garden[],
    operations: {
      load: { status: 'idle', error: null }
    },
    selected: null
  }
}
```

**Access Patterns:**

```typescript
tree.$.plants.entities.selectAll();
tree.$.plants.operations.load.status();
tree.$.plants.filters.search.set('fern');
entities<Plant>('plants.entities');
```

| Pros                                   | Cons                                       |
| -------------------------------------- | ------------------------------------------ |
| Slightly less nesting than Option B    | Entities mixed with metadata at same level |
| Everything domain-related in one place | Less explicit separation                   |
| Natural batching of domain state       |                                            |
| Feature slices are portable            |                                            |

**Best for:** Large apps, teams comfortable with entities alongside metadata, modular codebases

---

### Choosing a Structure

| Factor                     | Flat (A) | With Meta (B) | Flat Siblings (C) |
| -------------------------- | -------- | ------------- | ----------------- |
| Simplicity                 | ★★★      | ★★            | ★★                |
| Entity access terseness    | ★★★      | ★★            | ★★                |
| Metadata organization      | N/A      | ★★★           | ★★                |
| Entity/metadata separation | N/A      | ★★★           | ★★                |
| Feature slice portability  | ★        | ★★★           | ★★★               |

**Recommendation:**

- Use **Flat (A)** for simple apps or when operation state lives in components
- Use **With Meta (B)** when you want explicit separation between data and UI state
- Use **Flat Siblings (C)** when you want everything grouped but don't need the extra `meta` nesting

---

### Full Example: Flat Structure

```typescript
interface AppState {
  plants: Plant[];
  gardens: Garden[];
  auth: {
    user: User | null;
    token: string | null;
    status: 'unknown' | 'authenticated' | 'unauthenticated';
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
  };
}
```

### Full Example: Domain-Grouped with Meta

```typescript
type OperationStatus = 'idle' | 'pending' | 'success' | 'error';

interface OperationState {
  status: OperationStatus;
  error: string | null;
}

interface AppState {
  plants: {
    entities: Plant[];
    meta: {
      operations: {
        load: OperationState;
        save: OperationState;
        delete: OperationState;
      };
      filters: {
        search: string;
        status: 'all' | 'active' | 'inactive';
        gardenId: string | null;
        species: string[];
      };
      sort: {
        field: keyof Plant;
        direction: 'asc' | 'desc';
      };
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      };
      selection: {
        mode: 'single' | 'multiple';
        selectedIds: Set<string>;
        lastSelectedId: string | null;
      };
    };
  };
  gardens: {
    entities: Garden[];
    meta: {
      operations: {
        load: OperationState;
      };
      selected: string | null;
    };
  };
  auth: {
    user: User | null;
    token: string | null;
    status: 'unknown' | 'authenticated' | 'unauthenticated';
    meta: {
      operations: {
        login: OperationState;
        refresh: OperationState;
      };
    };
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    modals: {
      plantEditor: { open: boolean; plantId: string | null };
      confirmation: { open: boolean; config: ConfirmationConfig | null };
    };
  };
}
```

### Full Example: Domain-Grouped Flat Siblings

```typescript
interface AppState {
  plants: {
    entities: Plant[];
    operations: {
      load: OperationState;
      save: OperationState;
      delete: OperationState;
    };
    filters: {
      search: string;
      status: 'all' | 'active' | 'inactive';
      gardenId: string | null;
      species: string[];
    };
    sort: {
      field: keyof Plant;
      direction: 'asc' | 'desc';
    };
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
    };
    selection: {
      mode: 'single' | 'multiple';
      selectedIds: Set<string>;
      lastSelectedId: string | null;
    };
  };
  gardens: {
    entities: Garden[];
    operations: {
      load: OperationState;
    };
    selected: string | null;
  };
  auth: {
    user: User | null;
    token: string | null;
    status: 'unknown' | 'authenticated' | 'unauthenticated';
    operations: {
      login: OperationState;
      refresh: OperationState;
    };
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    modals: {
      plantEditor: { open: boolean; plantId: string | null };
      confirmation: { open: boolean; config: ConfirmationConfig | null };
    };
  };
}
```

---

## Common Patterns

> **Note on Examples:** The patterns below use the **Domain-Grouped with Meta** structure (Option B) for consistency. Adapt access patterns to your chosen structure:
>
> | Structure         | Entity Access                        | Metadata Access                      |
> | ----------------- | ------------------------------------ | ------------------------------------ |
> | Flat (A)          | `tree.$.plants.selectAll()`          | N/A (use component signals)          |
> | With Meta (B)     | `tree.$.plants.entities.selectAll()` | `tree.$.plants.meta.operations.load` |
> | Flat Siblings (C) | `tree.$.plants.entities.selectAll()` | `tree.$.plants.operations.load`      |

### Pattern 1: Loading & Operation States

Track operation status at the domain level, grouped within meta.

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      operations: {
        load: { status: 'idle' as OperationStatus, error: null as string | null },
        save: { status: 'idle' as OperationStatus, error: null as string | null },
        delete: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  }
}
```

**Type Definition:**

```typescript
type OperationStatus = 'idle' | 'pending' | 'success' | 'error';

interface OperationState {
  status: OperationStatus;
  error: string | null;
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class PlantsFacade {
  private tree = inject(APP_TREE);
  private api = inject(PlantsApi);

  // Expose operation states
  readonly loadStatus = this.tree.$.plants.meta.operations.load.status;
  readonly loadError = this.tree.$.plants.meta.operations.load.error;
  readonly isLoading = computed(() => this.loadStatus() === 'pending');

  async loadPlants() {
    this.tree.$.plants.meta.operations.load.set({ status: 'pending', error: null });

    try {
      const plants = await this.api.getAll();
      this.tree.$.plants.entities.set(plants);
      this.tree.$.plants.meta.operations.load.set({ status: 'success', error: null });
    } catch (e) {
      this.tree.$.plants.meta.operations.load.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  async savePlant(plant: Plant) {
    this.tree.$.plants.meta.operations.save.set({ status: 'pending', error: null });

    try {
      const saved = await this.api.save(plant);
      this.tree.$.plants.entities.update(saved.id, saved);
      this.tree.$.plants.meta.operations.save.set({ status: 'success', error: null });
      return saved;
    } catch (e) {
      this.tree.$.plants.meta.operations.save.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Unknown error',
      });
      throw e;
    }
  }
}
```

**Component Usage:**

```typescript
@Component({
  template: `
    @if (isLoading()) {
    <app-spinner />
    } @else if (loadError()) {
    <app-error-message [message]="loadError()" (retry)="reload()" />
    } @else { @for (plant of plants(); track plant.id) {
    <app-plant-card [plant]="plant" />
    } }
  `,
})
export class PlantsListComponent {
  private tree = inject(APP_TREE);
  private facade = inject(PlantsFacade);

  readonly plants = this.tree.$.plants.entities.selectAll;
  readonly isLoading = computed(() => this.tree.$.plants.meta.operations.load.status() === 'pending');
  readonly loadError = this.tree.$.plants.meta.operations.load.error;

  ngOnInit() {
    this.facade.loadPlants();
  }
  reload() {
    this.facade.loadPlants();
  }
}
```

**Reusable Helper (Optional):**

```typescript
async function withOperation<T>(
  operationState: { set: (state: OperationState) => void },
  operation: () => Promise<T>
): Promise<T | null> {
  operationState.set({ status: 'pending', error: null });

  try {
    const result = await operation();
    operationState.set({ status: 'success', error: null });
    return result;
  } catch (e) {
    operationState.set({
      status: 'error',
      error: e instanceof Error ? e.message : 'Unknown error'
    });
    return null;
  }
}

// Usage
async loadPlants() {
  await withOperation(
    this.tree.$.plants.meta.operations.load,
    () => this.api.getAll().then(plants => {
      this.tree.$.plants.entities.set(plants);
      return plants;
    })
  );
}
```

---

### Pattern 2: Error Handling

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      operations: {
        load: { status: 'idle' as OperationStatus, error: null as string | null },
        save: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  },
  errors: {
    global: null as AppError | null,
    byKey: {} as Record<string, AppError>
  }
}
```

**Type Definitions:**

```typescript
interface AppError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}
```

**Centralized Error Service:**

```typescript
@Injectable({ providedIn: 'root' })
export class ErrorService {
  private tree = inject(APP_TREE);

  readonly globalError = this.tree.$.errors.global;

  setGlobalError(error: Error | string) {
    this.tree.$.errors.global.set({
      code: 'GLOBAL',
      message: typeof error === 'string' ? error : error.message,
      timestamp: Date.now(),
    });
  }

  setError(key: string, error: Error | string, context?: Record<string, unknown>) {
    this.tree.$.errors.byKey.set({
      ...this.tree.$.errors.byKey(),
      [key]: {
        code: key,
        message: typeof error === 'string' ? error : error.message,
        context,
        timestamp: Date.now(),
      },
    });
  }

  clearError(key: string) {
    const current = this.tree.$.errors.byKey();
    const { [key]: _, ...rest } = current;
    this.tree.$.errors.byKey.set(rest);
  }

  clearAll() {
    this.tree.$.errors.set({ global: null, byKey: {} });
  }

  getError(key: string): Signal<AppError | null> {
    return computed(() => this.tree.$.errors.byKey()[key] ?? null);
  }
}
```

**Component Usage:**

```typescript
@Component({
  template: `
    @if (globalError()) {
    <app-global-error-banner [error]="globalError()" (dismiss)="errorService.clearGlobalError()" />
    } @if (plantSaveError()) {
    <app-inline-error [message]="plantSaveError()!.message" />
    }
  `,
})
export class AppComponent {
  protected errorService = inject(ErrorService);
  readonly globalError = this.errorService.globalError;
  readonly plantSaveError = this.errorService.getError('plants.save');
}
```

---

### Pattern 3: Optimistic Updates with Rollback

> **⚠️ Important:** Optimistic rollback and user undo (Ctrl+Z) are different concerns. See [Common Misconceptions](#common-misconceptions) for details on why `timeTravel` should generally NOT be used for API failure rollback.

**Recommended: Snapshot-Based Rollback**

This is the correct pattern for optimistic updates. It captures state before mutation and restores on failure:

```typescript
async updatePlant(id: string, changes: Partial<Plant>) {
  // 1. Capture previous state BEFORE mutation
  const previous = this.tree.$.plants.entities.selectById(id)();

  // 2. Optimistic update (UI reflects change immediately)
  this.tree.$.plants.entities.update(id, changes);

  try {
    // 3. API call
    await this.api.updatePlant(id, changes);
  } catch (e) {
    // 4. Targeted rollback - ONLY this entity, doesn't affect undo history
    if (previous) {
      this.tree.$.plants.entities.update(id, previous);
    }
    throw e;
  }
}
```

**Why this works:**

- Scoped to the specific operation
- Works with concurrent requests (each has its own snapshot)
- Doesn't pollute user's Ctrl+Z undo history
- Semantically correct: rollback ≠ undo

**Batch Optimistic Update:**

```typescript
async bulkUpdate(updates: Array<{ id: string; changes: Partial<Plant> }>) {
  // Capture all previous states
  const previousStates = new Map(
    updates.map(({ id }) => [id, this.tree.$.plants.entities.selectById(id)()])
  );

  // Optimistic batch update
  this.tree.batchUpdate(() => {
    for (const { id, changes } of updates) {
      this.tree.$.plants.entities.update(id, changes);
    }
  });

  try {
    await this.api.bulkUpdate(updates);
  } catch (e) {
    // Rollback all
    this.tree.batchUpdate(() => {
      for (const [id, previous] of previousStates) {
        if (previous) {
          this.tree.$.plants.entities.update(id, previous);
        }
      }
    });
    throw e;
  }
}
```

**When Time Travel CAN Work for Rollback (Limited Cases):**

Time travel (`tree.undo()`) can work for rollback ONLY when:

1. The operation is the only thing happening (no concurrent requests)
2. No user actions occur between request start and failure
3. You don't mind polluting the undo history

```typescript
// ⚠️ Use with caution - only for simple, non-concurrent cases
async updatePlantSimple(id: string, changes: Partial<Plant>) {
  this.tree.$.plants.entities.update(id, changes);

  try {
    await this.api.updatePlant(id, changes);
  } catch (e) {
    this.tree.undo(); // Works IF nothing else changed in between
    throw e;
  }
}
```

**Why time travel usually fails for optimistic updates:**

| Scenario                                         | What Happens                          |
| ------------------------------------------------ | ------------------------------------- |
| User updates name, then species. Name API fails. | `undo()` reverts species, not name ❌ |
| Two concurrent requests, first fails.            | `undo()` reverts the wrong one ❌     |
| User makes unrelated change during request.      | `undo()` reverts user's change ❌     |

**Recommendation:** Default to snapshot-based rollback. Only use time travel for rollback in trivial cases where concurrency is impossible.

---

### Pattern 4: Cross-Domain Coordination

**Scenario:** Deleting a garden should remove all its plants.

```typescript
@Injectable({ providedIn: 'root' })
export class GardensFacade {
  private tree = inject(APP_TREE);
  private api = inject(GardensApi);

  async deleteGarden(gardenId: string) {
    this.tree.$.gardens.meta.operations.delete.set({ status: 'pending', error: null });

    try {
      // Batch for atomic update
      this.tree.batchUpdate(() => {
        // Remove garden
        this.tree.$.gardens.entities.remove(gardenId);

        // Remove associated plants
        const plantsToRemove = this.tree.$.plants.entities
          .selectAll()()
          .filter((p) => p.gardenId === gardenId)
          .map((p) => p.id);

        for (const plantId of plantsToRemove) {
          this.tree.$.plants.entities.remove(plantId);
        }

        // Clear selection if deleted garden was selected
        if (this.tree.$.gardens.meta.selected() === gardenId) {
          this.tree.$.gardens.meta.selected.set(null);
        }
      });

      // API call after local state is consistent
      await this.api.deleteGarden(gardenId);
      this.tree.$.gardens.meta.operations.delete.set({ status: 'success', error: null });
    } catch (e) {
      this.tree.$.gardens.meta.operations.delete.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Delete failed',
      });
      throw e;
    }
  }
}
```

**Cross-Domain Derived State:**

```typescript
readonly plantsWithGardenNames = computed(() => {
  const allPlants = this.tree.$.plants.entities.selectAll()();
  const gardens = this.tree.$.gardens.entities.selectAll()();
  const gardenMap = new Map(gardens.map(g => [g.id, g]));

  return allPlants.map(p => ({
    ...p,
    gardenName: gardenMap.get(p.gardenId)?.name ?? 'Unknown'
  }));
});
```

---

### Pattern 5: Form State

**Option A: Component-Scoped Tree for Complex Forms**

```typescript
@Component({...})
export class PlantEditorComponent {
  private formTree = signalTree({
    draft: null as Plant | null,
    original: null as Plant | null,
    touched: {} as Record<string, boolean>,
    errors: {} as Record<string, string[]>,
    meta: {
      operations: {
        submit: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  });

  readonly draft = this.formTree.$.draft;
  readonly isSubmitting = computed(() =>
    this.formTree.$.meta.operations.submit.status() === 'pending'
  );
  readonly isDirty = computed(() =>
    JSON.stringify(this.formTree.$.draft()) !==
    JSON.stringify(this.formTree.$.original())
  );
  readonly canSubmit = computed(() =>
    this.isDirty() &&
    Object.keys(this.formTree.$.errors()).length === 0 &&
    !this.isSubmitting()
  );

  initForm(plant: Plant) {
    this.formTree.batchUpdate(() => {
      this.formTree.$.draft.set({ ...plant });
      this.formTree.$.original.set({ ...plant });
      this.formTree.$.touched.set({});
      this.formTree.$.errors.set({});
    });
  }

  updateField<K extends keyof Plant>(field: K, value: Plant[K]) {
    this.formTree.$.draft[field].set(value);
    this.formTree.$.touched.set({
      ...this.formTree.$.touched(),
      [field]: true
    });
    this.validateField(field);
  }

  reset() {
    this.formTree.$.draft.set({ ...this.formTree.$.original() });
    this.formTree.$.touched.set({});
    this.formTree.$.errors.set({});
  }

  private validateField(field: keyof Plant) {
    const value = this.formTree.$.draft[field]();
    const errors: string[] = [];

    if (field === 'name' && (!value || String(value).trim() === '')) {
      errors.push('Name is required');
    }

    this.formTree.$.errors.set({
      ...this.formTree.$.errors(),
      [field]: errors
    });
  }
}
```

**Option B: Use ng-forms Integration**

```typescript
import { signalForm } from '@signaltree/ng-forms';

@Component({...})
export class PlantEditorComponent {
  readonly form = signalForm({
    name: ['', Validators.required],
    species: ['', Validators.required],
    waterFrequency: [7, [Validators.min(1), Validators.max(30)]]
  });

  readonly canSubmit = computed(() =>
    this.form.valid() && this.form.dirty()
  );
}
```

---

### Pattern 6: Derived State / Selectors

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      filters: { search: '', status: 'all', gardenId: null, species: [] },
      sort: { field: 'name', direction: 'asc' }
    }
  }
}
```

**Selectors:**

```typescript
export function createPlantSelectors(tree: AppTree) {
  const plants = tree.$.plants;

  return {
    // Simple selections
    all: plants.entities.selectAll,
    byId: (id: string) => plants.entities.selectById(id),

    // Filtered selections
    active: computed(() =>
      plants.entities.selectAll()().filter(p => p.active)
    ),

    byGarden: (gardenId: string) => computed(() =>
      plants.entities.selectAll()().filter(p => p.gardenId === gardenId)
    ),

    // Aggregations
    stats: computed(() => {
      const all = plants.entities.selectAll()();
      return {
        total: all.length,
        active: all.filter(p => p.active).length,
        needsWater: all.filter(p => p.needsWater).length,
        bySpecies: groupBy(all, 'species')
      };
    }),

    // Filtered + sorted (combines filters and sort state)
    filteredAndSorted: computed(() => {
      const entities = plants.entities.selectAll()();
      const filters = plants.meta.filters();
      const sort = plants.meta.sort();

      let result = entities;

      // Apply filters
      if (filters.search) {
        const term = filters.search.toLowerCase();
        result = result.filter(p =>
          p.name.toLowerCase().includes(term) ||
          p.species.toLowerCase().includes(term)
        );
      }

      if (filters.status !== 'all') {
        result = result.filter(p =>
          filters.status === 'active' ? p.active : !p.active
        );
      }

      if (filters.gardenId) {
        result = result.filter(p => p.gardenId === filters.gardenId);
      }

      if (filters.species.length > 0) {
        result = result.filter(p => filters.species.includes(p.species));
      }

      // Apply sort
      result = [...result].sort((a, b) => {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === 'asc' ? cmp : -cmp;
      });

      return result;
    })
  };
}

// Usage
@Component({...})
export class PlantsDashboardComponent {
  private tree = inject(APP_TREE);
  private selectors = createPlantSelectors(this.tree);

  readonly stats = this.selectors.stats;
  readonly filteredPlants = this.selectors.filteredAndSorted;

  readonly needsAttention = computed(() =>
    this.selectors.stats().needsWater > 0
  );
}
```

---

### Pattern 7: Filtering and Sorting

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      filters: {
        search: '',
        status: 'all' as 'all' | 'active' | 'inactive',
        gardenId: null as string | null,
        species: [] as string[]
      },
      sort: {
        field: 'name' as keyof Plant,
        direction: 'asc' as 'asc' | 'desc'
      }
    }
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class PlantsFilterService {
  private tree = inject(APP_TREE);

  readonly filters = this.tree.$.plants.meta.filters;
  readonly sort = this.tree.$.plants.meta.sort;

  readonly filteredAndSorted = computed(() => {
    const entities = this.tree.$.plants.entities.selectAll()();
    const filters = this.filters();
    const sort = this.sort();

    let result = entities;

    // Apply filters
    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(term) || p.species.toLowerCase().includes(term));
    }

    if (filters.status !== 'all') {
      result = result.filter((p) => (filters.status === 'active' ? p.active : !p.active));
    }

    if (filters.gardenId) {
      result = result.filter((p) => p.gardenId === filters.gardenId);
    }

    if (filters.species.length > 0) {
      result = result.filter((p) => filters.species.includes(p.species));
    }

    // Apply sort
    result = [...result].sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sort.direction === 'asc' ? cmp : -cmp;
    });

    return result;
  });

  setSearch(term: string) {
    this.tree.$.plants.meta.filters.search.set(term);
  }

  setStatusFilter(status: 'all' | 'active' | 'inactive') {
    this.tree.$.plants.meta.filters.status.set(status);
  }

  setGardenFilter(gardenId: string | null) {
    this.tree.$.plants.meta.filters.gardenId.set(gardenId);
  }

  toggleSpeciesFilter(species: string) {
    const current = this.tree.$.plants.meta.filters.species();
    if (current.includes(species)) {
      this.tree.$.plants.meta.filters.species.set(current.filter((s) => s !== species));
    } else {
      this.tree.$.plants.meta.filters.species.set([...current, species]);
    }
  }

  toggleSort(field: keyof Plant) {
    const current = this.sort();
    if (current.field === field) {
      this.tree.$.plants.meta.sort.direction.set(current.direction === 'asc' ? 'desc' : 'asc');
    } else {
      this.tree.$.plants.meta.sort.set({ field, direction: 'asc' });
    }
  }

  resetFilters() {
    this.tree.$.plants.meta.filters.set({
      search: '',
      status: 'all',
      gardenId: null,
      species: [],
    });
  }
}
```

**Component Usage:**

```typescript
@Component({
  template: `
    <input [value]="filterService.filters().search" (input)="filterService.setSearch($event.target.value)" placeholder="Search plants..." />

    <select (change)="filterService.setStatusFilter($event.target.value)">
      <option value="all">All</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>

    <button (click)="filterService.toggleSort('name')">Name {{ sortIndicator('name') }}</button>

    @for (plant of filterService.filteredAndSorted(); track plant.id) {
    <app-plant-card [plant]="plant" />
    }
  `,
})
export class PlantsListComponent {
  filterService = inject(PlantsFilterService);

  sortIndicator(field: keyof Plant): string {
    const sort = this.filterService.sort();
    if (sort.field !== field) return '';
    return sort.direction === 'asc' ? '↑' : '↓';
  }
}
```

---

### Pattern 8: Pagination

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        hasMore: true
      },
      operations: {
        loadPage: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class PlantsPaginationService {
  private tree = inject(APP_TREE);
  private api = inject(PlantsApi);

  readonly pagination = this.tree.$.plants.meta.pagination;
  readonly currentPage = this.pagination.page;
  readonly hasMore = this.pagination.hasMore;
  readonly isLoadingPage = computed(() => this.tree.$.plants.meta.operations.loadPage.status() === 'pending');

  // For traditional pagination (replace)
  readonly currentPagePlants = computed(() => {
    const { page, pageSize } = this.pagination();
    const all = this.tree.$.plants.entities.selectAll()();
    const start = (page - 1) * pageSize;
    return all.slice(start, start + pageSize);
  });

  // For infinite scroll (accumulate)
  readonly accumulatedPlants = computed(() => {
    const { page, pageSize } = this.pagination();
    const all = this.tree.$.plants.entities.selectAll()();
    return all.slice(0, page * pageSize);
  });

  async loadPage(page: number, mode: 'replace' | 'append' = 'replace') {
    const { pageSize } = this.pagination();

    this.tree.$.plants.meta.operations.loadPage.set({ status: 'pending', error: null });

    try {
      const result = await this.api.getPlants({ page, pageSize });

      this.tree.batchUpdate(() => {
        if (mode === 'replace' || page === 1) {
          this.tree.$.plants.entities.set(result.items);
        } else {
          // Append for infinite scroll
          for (const plant of result.items) {
            this.tree.$.plants.entities.add(plant);
          }
        }

        this.tree.$.plants.meta.pagination.set({
          page,
          pageSize,
          total: result.total,
          hasMore: result.items.length === pageSize,
        });
      });

      this.tree.$.plants.meta.operations.loadPage.set({ status: 'success', error: null });
    } catch (e) {
      this.tree.$.plants.meta.operations.loadPage.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Failed to load',
      });
    }
  }

  async loadNextPage() {
    const current = this.currentPage();
    await this.loadPage(current + 1, 'append');
  }

  async goToPage(page: number) {
    await this.loadPage(page, 'replace');
  }
}
```

**Infinite Scroll Component:**

```typescript
@Component({
  template: `
    @for (plant of paginationService.accumulatedPlants(); track plant.id) {
    <app-plant-card [plant]="plant" />
    } @if (paginationService.hasMore()) {
    <button (click)="paginationService.loadNextPage()" [disabled]="paginationService.isLoadingPage()">
      {{ paginationService.isLoadingPage() ? 'Loading...' : 'Load More' }}
    </button>
    }
  `,
})
export class PlantsInfiniteListComponent {
  paginationService = inject(PlantsPaginationService);

  ngOnInit() {
    this.paginationService.loadPage(1);
  }
}
```

---

### Pattern 9: Authentication State

**Tree Structure:**

```typescript
{
  auth: {
    user: null as User | null,
    token: null as string | null,
    refreshToken: null as string | null,
    expiresAt: null as number | null,
    status: 'unknown' as 'unknown' | 'authenticated' | 'unauthenticated',
    meta: {
      operations: {
        login: { status: 'idle' as OperationStatus, error: null as string | null },
        refresh: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private tree = inject(APP_TREE);
  private api = inject(AuthApi);

  readonly user = this.tree.$.auth.user;
  readonly status = this.tree.$.auth.status;
  readonly isAuthenticated = computed(() => this.status() === 'authenticated');
  readonly isLoggingIn = computed(() => this.tree.$.auth.meta.operations.login.status() === 'pending');
  readonly loginError = this.tree.$.auth.meta.operations.login.error;

  readonly isTokenExpiringSoon = computed(() => {
    const expiresAt = this.tree.$.auth.expiresAt();
    if (!expiresAt) return false;
    return expiresAt - Date.now() < 5 * 60 * 1000; // 5 minutes
  });

  async login(credentials: Credentials) {
    this.tree.$.auth.meta.operations.login.set({ status: 'pending', error: null });

    try {
      const result = await this.api.login(credentials);

      this.tree.$.auth.set({
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        status: 'authenticated',
        meta: {
          operations: {
            login: { status: 'success', error: null },
            refresh: { status: 'idle', error: null },
          },
        },
      });
    } catch (e) {
      this.tree.$.auth.meta.operations.login.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Login failed',
      });
    }
  }

  logout() {
    this.tree.$.auth.set({
      user: null,
      token: null,
      refreshToken: null,
      expiresAt: null,
      status: 'unauthenticated',
      meta: {
        operations: {
          login: { status: 'idle', error: null },
          refresh: { status: 'idle', error: null },
        },
      },
    });
  }

  async refreshIfNeeded() {
    if (!this.isTokenExpiringSoon()) return;

    const refreshToken = this.tree.$.auth.refreshToken();
    if (!refreshToken) {
      this.logout();
      return;
    }

    this.tree.$.auth.meta.operations.refresh.set({ status: 'pending', error: null });

    try {
      const result = await this.api.refresh(refreshToken);

      this.tree.batchUpdate(() => {
        this.tree.$.auth.token.set(result.token);
        this.tree.$.auth.expiresAt.set(Date.now() + result.expiresIn * 1000);
        this.tree.$.auth.meta.operations.refresh.set({ status: 'success', error: null });
      });
    } catch {
      this.logout();
    }
  }

  getAuthHeader(): string | null {
    const token = this.tree.$.auth.token();
    return token ? `Bearer ${token}` : null;
  }
}
```

**Auth Guard:**

```typescript
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
```

---

### Pattern 10: Real-Time Updates (WebSocket)

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      // ... other plant meta
    }
  },
  realtime: {
    status: 'disconnected' as 'connecting' | 'connected' | 'disconnected' | 'error',
    lastEvent: null as RealtimeEvent | null,
    error: null as string | null
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private tree = inject(APP_TREE);
  private socket$!: WebSocketSubject<RealtimeEvent>;
  private destroyRef = inject(DestroyRef);

  readonly status = this.tree.$.realtime.status;
  readonly isConnected = computed(() => this.status() === 'connected');

  connect() {
    this.tree.$.realtime.status.set('connecting');

    this.socket$ = webSocket<RealtimeEvent>({
      url: 'wss://api.example.com/ws',
      openObserver: {
        next: () => this.tree.$.realtime.status.set('connected'),
      },
      closeObserver: {
        next: () => this.tree.$.realtime.status.set('disconnected'),
      },
    });

    this.socket$.pipe(retry({ delay: 5000 }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => this.handleEvent(event),
      error: (err) => {
        this.tree.$.realtime.set({
          status: 'error',
          lastEvent: null,
          error: err.message,
        });
      },
    });
  }

  disconnect() {
    this.socket$?.complete();
    this.tree.$.realtime.status.set('disconnected');
  }

  private handleEvent(event: RealtimeEvent) {
    this.tree.$.realtime.lastEvent.set(event);

    switch (event.type) {
      case 'plant:created':
        this.tree.$.plants.entities.add(event.payload);
        break;

      case 'plant:updated':
        this.tree.$.plants.entities.update(event.payload.id, event.payload.changes);
        break;

      case 'plant:deleted':
        this.tree.$.plants.entities.remove(event.payload.id);
        break;

      case 'bulk:sync':
        this.tree.batchUpdate(() => {
          this.tree.$.plants.entities.set(event.payload.plants);
          this.tree.$.gardens.entities.set(event.payload.gardens);
        });
        break;
    }
  }
}
```

---

### Pattern 11: Modal / Dialog State

**Tree Structure:**

```typescript
{
  ui: {
    modals: {
      confirmation: {
        open: false,
        config: null as ConfirmationConfig | null
      },
      plantEditor: {
        open: false,
        plantId: null as string | null,
        mode: 'create' as 'create' | 'edit'
      }
    }
  }
}
```

**Type Definitions:**

```typescript
interface ConfirmationConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}
```

**Modal Service:**

```typescript
@Injectable({ providedIn: 'root' })
export class ModalService {
  private tree = inject(APP_TREE);

  // Plant Editor Modal
  readonly plantEditorModal = this.tree.$.ui.modals.plantEditor;

  openPlantEditor(plantId: string | null = null) {
    this.tree.$.ui.modals.plantEditor.set({
      open: true,
      plantId,
      mode: plantId ? 'edit' : 'create',
    });
  }

  closePlantEditor() {
    this.tree.$.ui.modals.plantEditor.set({
      open: false,
      plantId: null,
      mode: 'create',
    });
  }

  // Confirmation Modal
  readonly confirmationModal = this.tree.$.ui.modals.confirmation;
  private confirmationResolve?: (result: boolean) => void;

  async confirm(config: Omit<ConfirmationConfig, 'onConfirm' | 'onCancel'>): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmationResolve = resolve;
      this.tree.$.ui.modals.confirmation.set({
        open: true,
        config: {
          ...config,
          onConfirm: () => {
            resolve(true);
            this.closeConfirmation();
          },
          onCancel: () => {
            resolve(false);
            this.closeConfirmation();
          },
        },
      });
    });
  }

  private closeConfirmation() {
    this.tree.$.ui.modals.confirmation.set({ open: false, config: null });
    this.confirmationResolve = undefined;
  }
}
```

**Component Usage:**

```typescript
@Component({
  template: `
    <button (click)="openEditor()">Add Plant</button>
    <button (click)="editPlant(selectedPlantId)">Edit</button>
    <button (click)="deletePlant(selectedPlantId)">Delete</button>

    @if (modalService.plantEditorModal().open) {
    <app-plant-editor-modal [plantId]="modalService.plantEditorModal().plantId" [mode]="modalService.plantEditorModal().mode" (close)="modalService.closePlantEditor()" />
    } @if (modalService.confirmationModal().open) {
    <app-confirmation-modal [config]="modalService.confirmationModal().config!" />
    }
  `,
})
export class PlantsComponent {
  modalService = inject(ModalService);
  private tree = inject(APP_TREE);

  selectedPlantId = 'plant-1';

  openEditor() {
    this.modalService.openPlantEditor();
  }

  editPlant(id: string) {
    this.modalService.openPlantEditor(id);
  }

  async deletePlant(id: string) {
    const confirmed = await this.modalService.confirm({
      title: 'Delete Plant',
      message: 'Are you sure you want to delete this plant? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      this.tree.$.plants.entities.remove(id);
    }
  }
}
```

**Alternative: Component-Local Modal State**

For modals that don't need to be controlled globally:

```typescript
@Component({...})
export class PlantsListComponent {
  readonly showDeleteConfirm = signal(false);
  readonly plantToDelete = signal<string | null>(null);

  confirmDelete(plantId: string) {
    this.plantToDelete.set(plantId);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.plantToDelete.set(null);
  }

  executeDelete() {
    const id = this.plantToDelete();
    if (id) {
      this.tree.$.plants.entities.remove(id);
    }
    this.cancelDelete();
  }
}
```

---

### Pattern 12: Feature Flags

**Tree Structure:**

```typescript
{
  featureFlags: {
    loaded: false,
    flags: {} as Record<string, boolean>,
    meta: {
      operations: {
        load: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  private tree = inject(APP_TREE);
  private api = inject(FeatureFlagApi);

  readonly loaded = this.tree.$.featureFlags.loaded;
  readonly isLoading = computed(() => this.tree.$.featureFlags.meta.operations.load.status() === 'pending');

  async load() {
    this.tree.$.featureFlags.meta.operations.load.set({ status: 'pending', error: null });

    try {
      const flags = await this.api.getFeatureFlags();
      this.tree.$.featureFlags.set({
        loaded: true,
        flags,
        meta: {
          operations: {
            load: { status: 'success', error: null },
          },
        },
      });
    } catch (e) {
      this.tree.$.featureFlags.meta.operations.load.set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Failed to load flags',
      });
    }
  }

  isEnabled(flag: string): Signal<boolean> {
    return computed(() => this.tree.$.featureFlags.flags()[flag] ?? false);
  }

  // Commonly used flags as named signals
  readonly newPlantEditor = this.isEnabled('new-plant-editor');
  readonly darkMode = this.isEnabled('dark-mode');
  readonly betaFeatures = this.isEnabled('beta-features');
}
```

**Component Usage:**

```typescript
@Component({
  template: `
    @if (featureFlags.newPlantEditor()) {
    <app-new-plant-editor />
    } @else {
    <app-legacy-plant-editor />
    } @if (featureFlags.betaFeatures()) {
    <app-beta-banner />
    }
  `,
})
export class PlantEditorWrapperComponent {
  featureFlags = inject(FeatureFlagService);
}
```

**App Initializer:**

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: (featureFlags: FeatureFlagService) => () => featureFlags.load(),
      deps: [FeatureFlagService],
      multi: true,
    },
  ],
};
```

---

### Pattern 13: Selection State

**Tree Structure:**

```typescript
{
  plants: {
    entities: [] as Plant[],
    meta: {
      selection: {
        mode: 'single' as 'single' | 'multiple',
        selectedIds: new Set<string>(),
        lastSelectedId: null as string | null
      }
    }
  }
}
```

**Implementation:**

```typescript
@Injectable({ providedIn: 'root' })
export class PlantSelectionService {
  private tree = inject(APP_TREE);

  readonly selection = this.tree.$.plants.meta.selection;
  readonly selectedIds = computed(() => this.selection().selectedIds);
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly hasSelection = computed(() => this.selectedCount() > 0);

  readonly selectedPlants = computed(() => {
    const ids = this.selectedIds();
    return this.tree.$.plants.entities
      .selectAll()()
      .filter((p) => ids.has(p.id));
  });

  select(id: string) {
    const mode = this.selection().mode;

    if (mode === 'single') {
      this.tree.$.plants.meta.selection.set({
        ...this.selection(),
        selectedIds: new Set([id]),
        lastSelectedId: id,
      });
    } else {
      const current = this.selectedIds();
      const updated = new Set(current);
      updated.add(id);
      this.tree.$.plants.meta.selection.set({
        ...this.selection(),
        selectedIds: updated,
        lastSelectedId: id,
      });
    }
  }

  deselect(id: string) {
    const current = this.selectedIds();
    const updated = new Set(current);
    updated.delete(id);
    this.tree.$.plants.meta.selection.selectedIds.set(updated);
  }

  toggle(id: string) {
    if (this.selectedIds().has(id)) {
      this.deselect(id);
    } else {
      this.select(id);
    }
  }

  selectAll() {
    const allIds = this.tree.$.plants.entities
      .selectAll()()
      .map((p) => p.id);
    this.tree.$.plants.meta.selection.selectedIds.set(new Set(allIds));
  }

  clearSelection() {
    this.tree.$.plants.meta.selection.selectedIds.set(new Set());
  }

  setMode(mode: 'single' | 'multiple') {
    this.tree.$.plants.meta.selection.mode.set(mode);
    if (mode === 'single' && this.selectedCount() > 1) {
      // Keep only the last selected
      const lastId = this.selection().lastSelectedId;
      this.tree.$.plants.meta.selection.selectedIds.set(lastId ? new Set([lastId]) : new Set());
    }
  }

  isSelected(id: string): Signal<boolean> {
    return computed(() => this.selectedIds().has(id));
  }
}
```

---

### Pattern 14: Undo/Redo with Time Travel

**Using the Time Travel Enhancer:**

```typescript
const tree = signalTree<AppState>({...})
  .with(timeTravel({ maxHistory: 50 }));

// In component or service
@Injectable({ providedIn: 'root' })
export class UndoService {
  private tree = inject(APP_TREE);

  readonly canUndo = this.tree.canUndo;
  readonly canRedo = this.tree.canRedo;
  readonly historyLength = computed(() => this.tree.getHistory().length);

  undo() {
    if (this.canUndo()) {
      this.tree.undo();
    }
  }

  redo() {
    if (this.canRedo()) {
      this.tree.redo();
    }
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts() {
    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(
        filter(e => (e.ctrlKey || e.metaKey) && e.key === 'z'),
        takeUntilDestroyed()
      )
      .subscribe(e => {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      });
  }
}
```

---

## Common Misconceptions

### Misconception 1: Time Travel = Optimistic Rollback

**The Wrong Assumption:**

```typescript
// "I can use withTimeTravel for API failure rollback"
async updatePlant(id: string, changes: Partial<Plant>) {
  this.tree.$.plants.entities.update(id, changes);
  try {
    await this.api.updatePlant(id, changes);
  } catch (e) {
    this.tree.undo(); // ❌ This is NOT what time travel is for
    throw e;
  }
}
```

**Why This Is Wrong:**

Time travel (`withTimeTravel`) and optimistic rollback solve fundamentally different problems:

| Aspect          | Time Travel (User Undo)                  | Optimistic Rollback                     |
| --------------- | ---------------------------------------- | --------------------------------------- |
| **Purpose**     | User presses Ctrl+Z to undo their action | API failed, revert a specific mutation  |
| **Trigger**     | User intent                              | System failure                          |
| **Scope**       | Global, sequential history stack         | Targeted, per-operation                 |
| **History**     | Maintains undo stack for user            | Should NOT affect undo stack            |
| **Concurrency** | N/A (user actions are sequential)        | Must handle multiple in-flight requests |

**The Problem with Using Time Travel for Rollback:**

```
Timeline:
1. User updates plant name → optimistic update (history: [nameChange])
2. User updates plant species → another change (history: [nameChange, speciesChange])
3. API call for name fails → need to rollback name

tree.undo() → Reverts speciesChange ❌ (wrong thing!)
```

**Correct Approach:**

Use time travel for user-facing undo/redo. Use snapshot-based rollback for API failures:

```typescript
// User undo (Ctrl+Z) - USE time travel
setupKeyboardShortcuts() {
  fromEvent<KeyboardEvent>(document, 'keydown')
    .pipe(filter(e => (e.ctrlKey || e.metaKey) && e.key === 'z'))
    .subscribe(e => {
      e.shiftKey ? this.tree.redo() : this.tree.undo();
    });
}

// API rollback - USE snapshot pattern
async updatePlant(id: string, changes: Partial<Plant>) {
  const previous = this.tree.$.plants.entities.selectById(id)();
  this.tree.$.plants.entities.update(id, changes);
  try {
    await this.api.updatePlant(id, changes);
  } catch (e) {
    if (previous) this.tree.$.plants.entities.update(id, previous);
    throw e;
  }
}
```

---

### Misconception 2: More Enhancers = Over-Engineering

**The Wrong Assumption:**

```typescript
// "Using multiple enhancers is over-engineering"
const tree = signalTree(state).with(entities()).with(batching()).with(timeTravel()).with(devTools()).with(memoization()); // ❌ "Too many enhancers!"
```

**Why This Is Wrong:**

Enhancers are designed to compose. Using multiple enhancers that each serve a purpose is not over-engineering—it's using the library correctly.

| Enhancer        | Purpose                | Over-engineering?                     |
| --------------- | ---------------------- | ------------------------------------- |
| `entities()`    | Entity CRUD operations | No—if you have entities               |
| `batching()`    | Batch multiple updates | No—reduces re-renders                 |
| `timeTravel()`  | User undo/redo         | No—if you need undo                   |
| `devTools()`    | Debugging in dev mode  | No—tree-shakes in prod                |
| `memoization()` | Cache computed values  | No—if you have expensive computations |

**What IS Over-Engineering:**

The problem is abstraction layers, not enhancers:

```typescript
// ❌ OVER-ENGINEERING: Unnecessary layers between component and tree
Component
  → TrackedChangesManager (wraps time travel)
    → CustomEntityStore (wraps entities)
      → BaseFacade (wraps tree access)
        → Tree with enhancers

// ✅ CORRECT: Enhancers are fine, layers are not
Component
  → Facade (for orchestration only)
    → Tree with enhancers
```

---

### Misconception 3: Large State Trees Are Problematic

**The Wrong Assumption:**

```typescript
// "20+ state slices means the tree is too big"
const state = {
  users: {...},
  plants: {...},
  gardens: {...},
  schedules: {...},
  notifications: {...},
  settings: {...},
  // ... 15 more domains
}; // ❌ "This tree is too large!"
```

**Why This Is Wrong:**

A unified tree with many domains is the entire point of SignalTree. The question isn't "how many slices" but "is the logic in the right place."

| Metric                                   | Problem?                                      |
| ---------------------------------------- | --------------------------------------------- |
| 20 domain slices                         | ✅ Fine—that's just how many domains you have |
| 1000 lines of state structure            | ✅ Fine—state structure should be explicit    |
| 500 lines of business logic in tree file | ❌ Problem—move to facades                    |
| 7 abstraction layers                     | ❌ Problem—reduce layers                      |

**What Actually Matters:**

```typescript
// Tree file SHOULD contain:
// ✅ State structure
// ✅ Enhancer composition
// ✅ Type exports

// Tree file should NOT contain:
// ❌ Business logic
// ❌ API calls
// ❌ Validation rules
// ❌ Complex computed derivations (put in selectors/facades)
```

---

### Misconception 4: Features = Over-Engineering

**The Wrong Assumption:**

```
"Remove performance monitoring - unnecessary complexity"
"Remove real-time sync - premature optimization"
```

**Why This Is Wrong:**

This conflates architectural complexity (bad) with feature complexity (sometimes necessary):

| Type                         | Example                    | Action                       |
| ---------------------------- | -------------------------- | ---------------------------- |
| **Architectural complexity** | 7 layers of abstraction    | Simplify—remove layers       |
| **Feature complexity**       | Real-time sync, monitoring | Evaluate—may be requirements |

**Before Labeling Something "Over-Engineering," Ask:**

1. **Is it a product requirement?**

   - Real-time sync → Does the product need live updates?
   - Performance monitoring → Is this used in production dashboards?

2. **Is it actually used?**

   - If used → Keep (maybe relocate)
   - If unused → Remove (it's dead code, not over-engineering)

3. **Is it in the right place?**
   - Business logic in tree file → Move to facades
   - Infrastructure in tree file → Extract to separate module

**The Correct Framing:**

| Instead of...             | Ask...                                                   |
| ------------------------- | -------------------------------------------------------- |
| "Remove this feature"     | "Is this feature required? If so, where should it live?" |
| "This is over-engineered" | "What specifically is adding unnecessary complexity?"    |
| "Simplify by removing"    | "Simplify by relocating to the right layer"              |

---

### Misconception 5: File Reorganization = Simplification

**The Wrong Assumption:**

```
// "Let's simplify by splitting into files"
app-tree/
├── app.tree.ts (was 1000 lines)
├── domains/
│   ├── plants.slice.ts (200 lines)
│   ├── gardens.slice.ts (200 lines)
│   └── ... (600 more lines across files)
```

**Why This Is Wrong:**

Moving code to different files doesn't reduce complexity—it just spreads it around. Total complexity is unchanged.

| Action                         | Reduces Complexity?               |
| ------------------------------ | --------------------------------- |
| Split 1 file into 10 files     | ❌ No—same total code             |
| Remove dead code               | ✅ Yes                            |
| Remove duplicate functionality | ✅ Yes                            |
| Move logic to correct layer    | ✅ Yes (clarifies responsibility) |
| Delete unnecessary abstraction | ✅ Yes                            |

**The Correct Approach:**

1. **First**: Identify what's actually unnecessary
2. **Then**: Remove or relocate with clear reasoning
3. **Finally**: Reorganize what remains (if it helps clarity)

Don't reorganize first—you'll just spread complexity across more files and make it harder to identify what to remove.

---

## Evaluating Existing Implementations

When evaluating a SignalTree implementation for potential simplification, follow this structured approach.

### Step 1: Audit Each Layer

Before removing anything, document what each abstraction layer actually does:

```markdown
## Layer: [Name]

- **What methods/functionality does it expose?**
- **Which components/services consume it?**
- **What would break if removed?**
- **Does it duplicate built-in SignalTree functionality?**
- **Does it add legitimate value beyond SignalTree?**
```

**Example Audit:**

```markdown
## Layer: TrackedChangesManager

- **Exposes**: undo(), redo(), canUndo$, canRedo$, trackChanges()
- **Consumers**: PlantEditorComponent, BulkEditModal
- **If removed**: Undo/redo keyboard shortcuts stop working
  -- **Duplicates**: Partially duplicates timeTravel
- **Adds value**: Integrates with form dirty state

## Verdict: PARTIAL KEEP

- Remove undo/redo (use timeTravel directly)
- Keep form dirty state integration (move to facade)
```

---

### Step 2: Categorize Before Removing

For each piece of code, categorize it:

| Category                               | Action                        | Example                                      |
| -------------------------------------- | ----------------------------- | -------------------------------------------- |
| **Dead code**                          | Remove                        | Unused methods, unreachable branches         |
| **Duplicate functionality**            | Remove the duplicate          | Custom undo that wraps `timeTravel`          |
| **Misplaced logic**                    | Move to correct layer         | Business rules in tree file → move to facade |
| **Wrong abstraction**                  | Replace with simpler approach | Inheritance hierarchy → composition          |
| **Legitimate feature, wrong location** | Extract to appropriate module | Monitoring code in tree → extract to service |
| **Legitimate feature, right location** | Keep                          | Core domain logic in facade                  |

---

### Step 3: Trace Data Flows

For each major operation, trace the full path:

```
User clicks "Save Plant"
  → Component.onSave()
    → [What gets called?]
      → [What gets called?]
        → [Where does tree mutation happen?]
          → [Where does API call happen?]
```

**Red Flags:**

- More than 3 layers between component and tree
- Same data transformed multiple times
- Multiple places that could trigger the same mutation
- Unclear ownership of side effects

**Example Trace:**

```
❌ PROBLEMATIC:
SaveButton.onClick()
  → PlantsFacade.save()
    → TrackedChangesManager.trackChange()
      → PlantStore.update()
        → BaseEntityStore.update()
          → Tree.$.plants.entities.update()

✅ SIMPLIFIED:
SaveButton.onClick()
  → PlantsFacade.save()  // Orchestration + API call
    → Tree.$.plants.entities.update()  // Direct tree access
```

---

### Step 4: Identify True Responsibilities

For each layer that remains, it should have exactly one responsibility:

| Layer           | Responsibility                           | Should NOT Do                                 |
| --------------- | ---------------------------------------- | --------------------------------------------- |
| **Component**   | UI rendering, user event handling        | Business logic, API calls                     |
| **Facade**      | Orchestration, cross-domain coordination | Direct DOM manipulation, store implementation |
| **Tree**        | State storage, enhancer composition      | Business logic, API calls                     |
| **API Service** | HTTP calls, response mapping             | State management, caching                     |

**Questions to Ask:**

- Does this layer have more than one responsibility?
- Could this responsibility live in an existing layer?
- Is this layer just passing through to another layer?

---

### Step 5: Measure Before and After

Don't use made-up metrics like "60-70% simpler." Measure real things:

| Metric                        | How to Measure                      | Why It Matters                |
| ----------------------------- | ----------------------------------- | ----------------------------- |
| **Lines of code**             | `wc -l` before/after                | Crude but objective           |
| **Abstraction depth**         | Count layers in a trace             | Fewer = simpler to understand |
| **Files touched per feature** | How many files to add a new entity? | Fewer = easier maintenance    |
| **Cyclomatic complexity**     | Static analysis tools               | Lower = easier to test        |
| **Time to trace a bug**       | Stopwatch a debugging session       | Shorter = better DX           |

**Example Measurement:**

```markdown
## Before Refactor

- Total LOC: 4,200
- Layers (component → tree): 6
- Files to add new entity type: 8
- Time to trace "save" flow: 15 minutes

## After Refactor

- Total LOC: 2,100 (-50%)
- Layers (component → tree): 3 (-50%)
- Files to add new entity type: 3 (-62%)
- Time to trace "save" flow: 3 minutes (-80%)
```

---

### Step 6: Migration Checklist

Use this checklist when simplifying an implementation:

```markdown
## Pre-Migration

- [ ] Audited all abstraction layers
- [ ] Categorized each piece (remove/move/keep)
- [ ] Documented what each layer actually does
- [ ] Measured baseline metrics
- [ ] Identified all consumers of each layer

## Migration

- [ ] Removed dead code first (safest)
- [ ] Removed duplicate functionality
- [ ] Moved misplaced logic to correct layers
- [ ] Replaced wrong abstractions with simpler approaches
- [ ] Updated all consumers

## Post-Migration

- [ ] All tests pass
- [ ] No runtime errors
- [ ] Features still work (especially: undo/redo, optimistic updates, real-time)
- [ ] Build succeeds
- [ ] Type-check passes
- [ ] Measured post-migration metrics
- [ ] Documented architectural decisions
```

---

### Anti-Pattern: The Blanket Removal

**Don't do this:**

```markdown
Plan:

1. Remove TrackedChangesManager ❌
2. Remove TrackedEntityStoreBase ❌
3. Remove all facades ❌
4. Remove performance monitoring ❌
5. Remove real-time sync ❌
```

**Why it fails:**

- No analysis of what these provide
- No consideration of what breaks
- No migration path for consumers
- Assumes all abstraction is bad

**Do this instead:**

```markdown
Plan:

1. Audit TrackedChangesManager

- Finding: Wraps timeTravel + adds form integration
- Action: Remove wrapper, keep form integration in facade

2. Audit TrackedEntityStoreBase
   - Finding: Adds validation + relationship handling
   - Action: Move validation to facades, evaluate relationship handling
3. Audit facades
   - Finding: PlantsFacade has orchestration, GardensFacade is pass-through
   - Action: Keep PlantsFacade, remove GardensFacade
4. Audit performance monitoring
   - Finding: Used in production dashboards
   - Action: Keep, extract to separate module
5. Audit real-time sync
   - Finding: Product requirement for collaborative editing
   - Action: Keep, extract to separate module
```

---

## Summary: Recommended Default Architecture

For most Angular applications using SignalTree:

```
┌─────────────────────────────────────────────────────────────┐
│                        Components                           │
│  • Inject APP_TREE directly for reads                       │
│  • Inject facades for orchestrated operations               │
│  • Use local signals for UI-only state                      │
└─────────────────────────────────┬───────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────┐
│                    Facades (selective)                      │
│  • Multi-step workflows                                     │
│  • Cross-domain coordination                                │
│  • Business rule validation                                 │
│  • Complex API orchestration                                │
└─────────────────────────────────┬───────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────┐
│                   Single Global Tree                        │
│  • All shared state                                         │
│  • Entities with withEntities()                             │
│  • Enhancers as needed                                      │
│  • Organized by domain (tree.$.plants, tree.$.gardens)      │
└─────────────────────────────────┬───────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────┐
│                      API Services                           │
│  • HTTP calls only                                          │
│  • No state management                                      │
│  • Return typed data                                        │
└─────────────────────────────────────────────────────────────┘
```

### What to Keep vs. Remove

| Layer                 | Verdict              | Reasoning                                          |
| --------------------- | -------------------- | -------------------------------------------------- |
| Global App Tree       | **Keep**             | Core value prop—unified state, dot notation access |
| Domain Facades        | **Keep selectively** | Only if they contain orchestration/business logic  |
| Domain Services (API) | **Keep**             | Clean separation of HTTP concerns                  |
| Loading Helpers       | **Remove**           | Use domain-scoped operations state                 |
| Service Managers      | **Remove**           | Fold into facades or tree methods                  |
| Type Definitions      | **Simplify**         | Reduce aliases, let inference work                 |

### Decision Guide: Where Does Logic Live?

| Operation Type           | Location               | Example                                          |
| ------------------------ | ---------------------- | ------------------------------------------------ |
| Read state               | Component via `tree.$` | `tree.$.plants.entities.selectAll()`             |
| Simple mutation          | Component via `tree.$` | `tree.$.plants.entities.add(plant)`              |
| API call (single domain) | Facade or component    | `await api.save(); tree.$.plants.entities.add()` |
| API call (multi-domain)  | **Facade**             | Load plants + schedules together                 |
| Business rule validation | **Facade**             | Ownership checks before transfer                 |
| Cross-domain mutation    | **Facade**             | Update plants AND gardens AND schedules          |
| UI-only state            | Component signal       | `showModal = signal(false)`                      |

This gives you unified dot notation access, minimal abstraction layers, and facades only where they provide real value.

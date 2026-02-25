# SignalTree Architecture Guide

**Reactive JSON.** JSON branches, reactive leaves.

> No actions. No reducers. No selectors.

A comprehensive guide to architecting applications with SignalTree, covering architectural options, decision frameworks, and implementation patterns.

---

## Core Ethos

SignalTree treats application state as **reactive JSON**. The branches are your JSON paths (`$.user.profile`), and the leaves are reactive signals you read and write.

You don't model state as actions, reducers, selectors, or classes — you model it as **data**.

### Ethos Pillars

| Principle                        | What It Means                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **State is Data First**          | The state shape looks like JSON — nested objects and primitives. What you see is what the state _is_.          |
| **Dot-Notation Interface**       | `state.user.profile.name()` — fully type-safe, deeply inferred, IDE-discoverable. No string keys or selectors. |
| **Invisible Reactivity**         | Signals exist, but don't dominate the mental model. You think in data paths, not subscriptions.                |
| **Lazy by Design**               | Signals created only where accessed. Types do heavy lifting at compile time. Minimal runtime footprint.        |
| **Composable, Not Prescriptive** | No enforced patterns. Compose trees like JSON documents. Scales from small features to large domains.          |

---

## Recommended Architecture (TL;DR)

If you only read one section, read this.

**Default recommendation (matches SignalTree’s ethos and implementation):**

- **One global runtime tree** for application/shared state.
- **Compose domain slices as plain objects** under that root (Category C2).
- **Expose typed feature slices** (`tree.$.feature`) via InjectionTokens/services (Category C1) to enforce boundaries.
- Keep **UI-only state local** with Angular `signal()` / `computed()` (hybrid pattern).
- For “lazy” features, keep the **slice object present** and initialize **leaf values** to `undefined` until you hydrate them (avoid `slice: undefined as Slice | undefined` if you need nested access).
- Apply cross-cutting enhancers **once at the root** (especially `devTools()`, time travel, persistence/serialization).

This yields the best DX: a single dot-notation state universe, one DevTools instance, and predictable path-based tooling.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Principles](#core-principles)
3. [Architecture Options](#architecture-options)
4. [Decision Matrix](#decision-matrix)
5. [Domain State Structure Options](#domain-state-structure-options)
6. [Common Patterns](#common-patterns)
7. [Where Do Selectors Live?](#where-do-selectors-live)
8. [Common Misconceptions](#common-misconceptions)
9. [Evaluating Existing Implementations](#evaluating-existing-implementations)
10. [Summary: Recommended Default Architecture](#summary-recommended-default-architecture)

---

## Getting Started

### Basic Setup (Angular)

#### 1. Define Your Tree

```typescript
// app-tree.ts
import { signalTree, entityMap, status, stored } from '@signaltree/core';

export function createAppTree() {
  return signalTree({
    // entityMap - auto-processed marker for entity collections
    users: entityMap<User, string>(),
    posts: entityMap<Post, string>(),

    // status() - auto loading state tracking
    usersStatus: status(),

    // stored() - auto localStorage persistence
    ui: {
      theme: stored('app-theme', 'light' as 'light' | 'dark'),
      sidebarOpen: true as boolean,
    },
  });
  // Note: v7+ auto-processes markers; `.with(entities())` was deprecated in v6 and removed in v7 (do not call it)
}

// Type inference - single source of truth
export type AppTree = ReturnType<typeof createAppTree>;
```

#### 2. Create Typed Token

```typescript
// app-tree.ts (continued)
import { InjectionToken } from '@angular/core';

export const APP_TREE = new InjectionToken<AppTree>('APP_TREE');
```

#### 3. Provide at App Bootstrap

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { APP_TREE, createAppTree } from './store/app-tree';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_TREE,
      useFactory: () => createAppTree(),
    },
  ],
};
```

#### 4. Use in Components

```typescript
// users.component.ts
@Component({...})
export class UsersComponent {
  private readonly tree = inject(APP_TREE);

  readonly users = this.tree.$.users.all;
  readonly theme = this.tree.$.ui.theme;

  addUser(user: User) {
    this.tree.$.users.addOne(user);
  }

  toggleTheme() {
    this.tree.$.ui.theme.update(t => t === 'light' ? 'dark' : 'light');
  }
}
```

#### 5. Testing

```typescript
// users.component.spec.ts
describe('UsersComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_TREE,
          useFactory: () => {
            const tree = createAppTree();
            tree.$.users.setAll([mockUser]);
            return tree;
          },
        },
      ],
    });
  });
});
```

#### 6. Reusable Test Helper (Optional)

```typescript
// testing/provide-mock-app-tree.ts
export function provideMockAppTree(setup?: (tree: AppTree) => void): Provider[] {
  return [
    {
      provide: APP_TREE,
      useFactory: () => {
        const tree = createAppTree();
        setup?.(tree);
        return tree;
      },
    },
  ];
}

// Usage in tests
providers: [
  provideMockAppTree((tree) => {
    tree.$.users.setAll([mockUser]);
  }),
];
```

---

## Core Principles

SignalTree's value proposition centers on three pillars:

1. **Unified State Tree**: Single source of truth with dot notation access (`tree.$.domain.property()`)
2. **Invisible Infrastructure**: Users work directly with entities, not thinking about underlying systems
3. **Callable Signal Syntax**: Clean, intuitive API without boilerplate

Any architectural decision should preserve these principles.

---

## Architecture Options

### Category A: Direct Access (Recommended Default)

Components inject the tree directly. Optional facades for orchestration.

#### A1: Pure Direct Access

Components inject and access the tree directly. No intermediary layers.

```typescript
// app-tree.ts
export const appTree = signalTree<AppState>({
  ...,
  plants: entityMap<Plant>(),
});

// component.ts
export class PlantsComponent {
  private tree = inject(APP_TREE);
  readonly plants = this.tree.$.plants.all;

  add(plant: Plant) { this.tree.$.plants.addOne(plant); }
}
```

| Pros                | Cons                                  |
| ------------------- | ------------------------------------- |
| Minimal boilerplate | API calls scattered across components |
| Full type inference | No business logic encapsulation       |
| Zero indirection    |                                       |

**Best for:** Small apps, prototypes, teams comfortable with distributed logic

---

#### A2: With Orchestration Facades

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
      this.tree.$.plants.entities.setAll(plants);
      this.tree.$.schedules.entities.setAll(schedules);
    });
  }
}

// component.ts - direct tree access for reads, facade for orchestration
export class PlantsComponent {
  private tree = inject(APP_TREE);
  private facade = inject(PlantsFacade);

  readonly plants = this.tree.$.plants.entities.all;

  ngOnInit() { this.facade.loadWithSchedules(this.gardenId); }
  delete(id: string) { this.tree.$.plants.entities.removeOne(id); } // Direct for simple ops
}
```

| Pros                    | Cons                                        |
| ----------------------- | ------------------------------------------- |
| Clean separation        | Must decide per-operation where logic lives |
| Facades earn their keep |                                             |
| Simple ops stay simple  |                                             |

**Best for:** Medium-to-large apps with complex workflows

---

#### A3: With Shared Selectors

Selector service for cross-domain computed values used app-wide.

```typescript
// app-selectors.service.ts
@Injectable({ providedIn: 'root' })
export class AppSelectors {
  private readonly tree = inject(APP_TREE);

  readonly selectedTruck = computed(() => {
    const id = this.tree.$.selected.truckId();
    return id ? this.tree.$.trucks.byId(id)?.() ?? null : null;
  });

  readonly selectableTrucks = computed(() => {
    const haulerId = this.tree.$.selected.haulerId();
    return haulerId ? this.tree.$.haulers.byId(haulerId)?.()?.trucks ?? [] : [];
  });
}

// component.ts
export class TruckListComponent {
  private selectors = inject(AppSelectors);
  readonly trucks = this.selectors.selectableTrucks;
}
```

| Pros                            | Cons                              |
| ------------------------------- | --------------------------------- |
| Reusable cross-domain computed  | Another service to inject         |
| Single source for complex logic | Can grow unbounded if not careful |

**Best for:** Apps with complex derived state used in 4+ places

---

### Category B: Service-Wrapped

Each domain has a service wrapping tree access.

#### B1: Service-Per-Entity

Each entity type gets a dedicated service wrapping tree access.

```typescript
@Injectable({ providedIn: 'root' })
export class PlantService {
  private tree = inject(APP_TREE);
  private api = inject(PlantsApi);

  readonly entities = this.tree.$.plants.entities;
  readonly all = this.entities.all;
  readonly byId = (id: string) => this.entities.byId(id);

  async load() {
    const plants = await this.api.getAll();
    this.entities.setAll(plants);
  }

  async create(plant: Omit<Plant, 'id'>) {
    const created = await this.api.create(plant);
    this.entities.addOne(created);
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

#### B2: Attached Methods

Extend the tree object itself with domain methods. No separate facade classes.

```typescript
// app-tree.ts
const baseTree = signalTree<AppState>({
  ...,
  // where plants.entities is entityMap<Plant>()
});

export const appTree = Object.assign(baseTree, {
  plants: {
    ...baseTree.$.plants,
    async loadWithSchedules(api: PlantsApi, gardenId: string) {
      const [plants, schedules] = await Promise.all([...]);
      baseTree.batchUpdate(() => {
        baseTree.$.plants.entities.setAll(plants);
        baseTree.$.schedules.entities.setAll(schedules);
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

### Category C: Feature-Scoped

Boundaries between features with typed slice access.

#### C1: Feature Tokens

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
  readonly all = this.plants.entities.all;
}
```

| Pros                                 | Cons                                               |
| ------------------------------------ | -------------------------------------------------- |
| Feature modules only see their slice | Extra tokens to maintain                           |
| Enforces boundaries                  | Cross-feature access requires additional injection |

**Best for:** Large apps with strict feature boundaries, multiple teams

---

#### C2: Composed Sub-Trees

Global tree composed from domain sub-trees. Single access point, modular definition.

```typescript
// domains/plants.tree.ts
export const plantsSlice = {
  entities: entityMap<Plant>(),
  filters: { search: '', status: 'all' as PlantStatus },
  operations: {
    load: { status: 'idle' as OperationStatus, error: null as string | null },
  },
};

// domains/gardens.tree.ts
export const gardensSlice = {
  entities: entityMap<Garden>(),
  selected: null as string | null,
};

// app-tree.ts
export const appTree = signalTree({
  plants: plantsSlice,
  gardens: gardensSlice,
  auth: { userId: null as string | null },
  ui: { theme: 'light' as Theme },
});

**Lazy feature hydration (recommended pattern)**

When you want a feature to be “present in types” but hydrated later (e.g. on navigation), model the feature as an **object slice** and put `undefined` only at the *leaves*.

- ✅ Keeps dot-notation typing (`tree.$.reports.filters.query` exists)
- ✅ Allows lazy runtime cost (signals are still created on access)
- ❌ Avoid `feature: undefined as FeatureState | undefined` if you need nested access — that makes `feature` a leaf signal, not a branch.

  ```typescript
type ReportsState = {
  data: Report[] | undefined;
  filters: { query: string; status: 'all' | 'open' | 'closed' };
};

export const reportsSlice = {
  data: undefined as Report[] | undefined,
  filters: {
    query: '',
    status: 'all' as const,
  },
} satisfies ReportsState;

export const appTree = signalTree({
  reports: reportsSlice,
  // ...other slices
});

// Later (e.g. on route enter)
appTree.$.reports.data.set(await api.loadReports());
```
```

| Pros                                   | Cons                      |
| -------------------------------------- | ------------------------- |
| Modular definition                     | Nested paths in enhancers |
| Single runtime tree                    |                           |
| Domains can be developed independently |                           |

**Best for:** Large apps wanting modular code organization without fragmenting runtime

---

### Category D: Multiple Trees

Separate tree instances for isolation.

**Important note about DevTools and path-based enhancers**

SignalTree’s DevTools / time-travel / persistence ecosystem is built around a **global PathNotifier** (see `getPathNotifier()` in core). If you create multiple independent trees and enable `devTools()` on more than one of them:

- You will get **multiple Redux DevTools connections** (one per tree).
- You may see **noisy / confusing DevTools actions** across trees because each `devTools()` enhancer listens to the same global notifier.

If you want a single unified DevTools view, prefer **one global runtime tree** (Category C) and inject typed slices (`tree.$.feature`) into feature code.

**Alternative: Aggregated DevTools Instance**

If you require multiple trees but want a unified usage in Redux DevTools, you can use the `aggregatedReduxInstance` option. This groups multiple independent SignalTree instances under a single DevTools connection, displaying them as separate branches.

```typescript
const sharedDevToolsConfig = {
  id: 'app-instance-id',     // Unique ID for the connection
  name: 'My App'             // Title in the extension dropdown
};

const authTree = signalTree({ user: null }).with(
  devTools({
    treeName: 'Auth',       // Will appear as state.Auth
    aggregatedReduxInstance: sharedDevToolsConfig
  })
);

const productsTree = signalTree({ list: [] }).with(
  devTools({
    treeName: 'Products',   // Will appear as state.Products
    aggregatedReduxInstance: sharedDevToolsConfig
  })
);
```

#### D1: Domain-Scoped Trees

Separate tree instance per domain.

```typescript
// plants-tree.ts
export const plantsTree = signalTree({
  entities: entityMap<Plant>(),
});

// gardens-tree.ts
export const gardensTree = signalTree({
  entities: entityMap<Garden>(),
});

// component.ts
export class DashboardComponent {
  private plants = inject(PLANTS_TREE);
  private gardens = inject(GARDENS_TREE);

  // Cross-domain? Manual coordination
  async transferPlant(plantId: string, gardenId: string) {
    await this.api.transfer(plantId, gardenId);
    this.plants.$.entities.updateOne(plantId, { gardenId });
    this.gardens.$.entities.updateOne(gardenId, { plantCount: count + 1 });
  }
}
```

| Pros                   | Cons                                |
| ---------------------- | ----------------------------------- |
| Domain isolation       | Cross-domain coordination is manual |
| Smaller tree instances | Loses unified dot notation          |
|                        | Separate Redux DevTools connections |
|                        | Must know which tree to inject      |

**Best for:** Truly independent domains with minimal cross-talk (rare)

---

#### D2: Component-Scoped Trees

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

#### D3: Minimal SignalTree

Use SignalTree only where its features are needed. Vanilla signals elsewhere.

```typescript
// Only entities need SignalTree
export const entitiesTree = signalTree({
  plants: { entities: entityMap<Plant>() },
  gardens: { entities: entityMap<Garden>() },
});

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

### Category E: Advanced Patterns

For specific requirements.

#### E1: CQRS-Style Separation

Explicit separation between read projections and write commands.

```typescript
// queries.ts - Read-only projections
export function plantQueries(tree: AppTree) {
  return {
    all: tree.$.plants.entities.all,
    active: computed(() => tree.$.plants.entities.all().filter(p => p.active)),
    byGarden: (id: string) => computed(() =>
      tree.$.plants.entities.all().filter(p => p.gardenId === id)
    ),
  };
}

// commands.ts - Write operations
export function plantCommands(tree: AppTree, api: PlantsApi) {
  return {
    async load() { ... },
    async create(plant: NewPlant) { ... },
    async water(id: string) { ... },
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

#### E2: Redux-Like Actions

Explicit action objects with reducer-style handlers.

```typescript
// actions.ts
export type PlantAction = { type: 'plants/load'; payload: Plant[] } | { type: 'plants/add'; payload: Plant } | { type: 'plants/remove'; payload: string };

// reducer.ts
export function handlePlantAction(tree: AppTree, action: PlantAction) {
  switch (action.type) {
    case 'plants/load':
      tree.$.plants.entities.setAll(action.payload);
      break;
    case 'plants/add':
      tree.$.plants.entities.addOne(action.payload);
      break;
    case 'plants/remove':
      tree.$.plants.entities.removeOne(action.payload);
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

#### E3: Repository + Unit of Work

Database-inspired pattern with explicit save/commit.

```typescript
@Injectable({ providedIn: 'root' })
export class PlantRepository {
  private tree = inject(APP_TREE);
  private pending = new Map<string, Partial<Plant>>();

  get(id: string) {
    return computed(() => this.tree.$.plants.entities.byId(id)?.());
  }
  getAll() {
    return this.tree.$.plants.entities.all;
  }

  stage(id: string, changes: Partial<Plant>) {
    this.pending.set(id, { ...this.pending.get(id), ...changes });
  }

  async commit() {
    const updates = Array.from(this.pending.entries());
    await this.api.bulkUpdate(updates);

    this.tree.batchUpdate(() => {
      for (const [id, changes] of updates) {
        this.tree.$.plants.entities.updateOne(id, changes);
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

#### E4: RxJS Interop Layer

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

  readonly autoSave$ = treeSlice$(() => this.tree.$.plants.entities.all()).pipe(
    debounceTime(5000),
    switchMap((plants) => this.api.bulkSave(plants))
  );

  readonly loadOnGardenChange$ = treeSlice$(() => this.tree.$.gardens.selected()).pipe(
    filter(Boolean),
    distinctUntilChanged(),
    switchMap((gardenId) => this.api.getPlantsByGarden(gardenId)),
    tap((plants) => this.tree.$.plants.entities.setAll(plants))
  );
}
```

| Pros                              | Cons                                  |
| --------------------------------- | ------------------------------------- |
| Full RxJS power for complex async | Two reactive systems                  |
| Familiar to Angular devs          | Potential memory leaks if not managed |

**Best for:** Complex async requirements, real-time streams, teams expert in RxJS

---

### Additional Patterns

#### Hybrid Global + Local

Global tree for shared state, component signals or mini-trees for UI-only state.

```typescript
@Component({...})
export class PlantsListComponent {
  // Global shared state
  private tree = inject(APP_TREE);
  readonly plants = this.tree.$.plants.entities.all;

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

#### Micro-Frontend Style

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
```

**Best for:** Actual micro-frontends with separate deployments

---

#### Feature Store Factory

Factory function producing configured stores per feature.

```typescript
export function createFeatureStore<TEntity extends { id: string }>(
  name: string,
  api: CrudApi<TEntity>
) {
  const tree = signalTree({
    entities: entityMap<TEntity>(),
    meta: {
      operations: {
        load: { status: 'idle' as OperationStatus, error: null as string | null },
        save: { status: 'idle' as OperationStatus, error: null as string | null }
      }
    }
  });

  return {
    entities: tree.$.entities,
    operations: tree.$.meta.operations,
    async load() { ... },
    async create(entity: Omit<TEntity, 'id'>) { ... },
  };
}

// Usage
export const plantStore = createFeatureStore('plants', plantsApi);
export const gardenStore = createFeatureStore('gardens', gardensApi);
```

**Best for:** Apps with many similar CRUD domains

---

## Decision Matrix

| Scenario                      | Recommended Option               |
| ----------------------------- | -------------------------------- |
| Small app, single dev         | A1 (Pure Direct) or D3 (Minimal) |
| Medium app, simple domains    | A1 + Hybrid Global/Local         |
| Medium app, complex workflows | A2 (With Orchestration Facades)  |
| Large app, multiple teams     | C1 (Feature Tokens) + A2         |
| Complex async, real-time      | E4 (RxJS Interop)                |
| Offline-first, draft/commit   | E3 (Repository)                  |
| Many similar CRUD domains     | Feature Store Factory            |
| Heavy debugging needs         | E2 (Redux-Like)                  |
| Micro-frontends               | Micro-Frontend Style             |
| Strict read/write separation  | E1 (CQRS)                        |

---

## Domain State Structure Options

There are three common approaches to organizing domain state. Choose based on your access patterns, team preferences, and application size.

---

### Option A: Flat (Entities Only)

Domain key contains only the entity array. No metadata in tree—handle loading/filtering in components or services.

```typescript
{
  plants: entityMap<Plant>(),
  gardens: entityMap<Garden>(),
  auth: { user: User | null, token: string | null },
  ui: { theme: 'light' | 'dark' }
}
```

**Access Patterns:**

```typescript
tree.$.plants.all();
tree.$.plants.addOne(plant);
entityMap<Plant>();
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
    entities: entityMap<Garden>(),
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
tree.$.plants.entities.all();
tree.$.plants.meta.operations.load.status();
tree.$.plants.meta.filters.search.set('fern');
entityMap<Plant>();
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
    entities: entityMap<Plant>(),
    operations: {
      load: { status: 'idle' as OperationStatus, error: null as string | null },
      save: { status: 'idle' as OperationStatus, error: null as string | null }
    },
    filters: { search: '', status: 'all' },
    sort: { field: 'name', direction: 'asc' },
    pagination: { page: 1, pageSize: 20, total: 0, hasMore: true }
  },
  gardens: {
    entities: entityMap<Garden>(),
    operations: {
      load: { status: 'idle' as OperationStatus, error: null as string | null }
    },
    selected: null
  }
}
```

**Access Patterns:**

```typescript
tree.$.plants.entities.all();
tree.$.plants.operations.load.status();
tree.$.plants.filters.search.set('fern');
entityMap<Plant>();
```

| Pros                                   | Cons                                       |
| -------------------------------------- | ------------------------------------------ |
| Slightly less nesting than Option B    | Entities mixed with metadata at same level |
| Everything domain-related in one place | Less explicit separation                   |
| Natural batching of domain state       |                                            |
| Feature slices are portable            |                                            |

**Best for:** Large apps, teams comfortable with entities alongside metadata, modular codebases

---

### Loading State: Two Valid Approaches

When using `entityMap` directly at the domain level, you have two options for loading state:

#### Approach A: Using `status()` Marker (Recommended for v7+)

The `status()` marker provides automatic loading state with derived convenience signals.

```typescript
import { status } from '@signaltree/core';

{
  plants: {
    entities: entityMap<Plant, number>(),
    status: status()  // Auto-creates state, error, isLoading, etc.
  },
}

// Access
tree.$.plants.status.state()       // LoadingState enum
tree.$.plants.status.error()       // Error | null
tree.$.plants.status.isLoading()   // boolean
tree.$.plants.status.isLoaded()    // boolean
tree.$.plants.status.isError()     // boolean

// Mutations
tree.$.plants.status.setLoading()
tree.$.plants.status.setLoaded()
tree.$.plants.status.setError(error)
tree.$.plants.status.reset()

// With custom error type:
status: status<NotifyErrorModel>()  // error() returns NotifyErrorModel | null
```

**Pros:** Less boilerplate, auto-derived signals, type-safe error handling.

#### Approach B: Manual Loading State (Legacy)

For backwards compatibility or custom loading state shapes.

```typescript
{
  plants: {
    entities: entityMap<Plant, number>(),
    loading: {
      state: 'idle' as LoadingState,
      error: null as string | null,
    },
  },
}

// Access
tree.$.plants.loading.state()
tree.$.plants.loading.error()
```

**Pros:** Full control over state shape, backwards compatible.

#### Approach C: Domain-Level Sibling (Flat structures)

Loading state as sibling to entity collection.

```typescript
{
  plants: entityMap<Plant, number>(),
  plantsStatus: status(),  // or manual loading state
}

// Access
tree.$.plantsStatus.isLoading()
```

**Pros:** Flatter structure, simpler when using `entityMap` directly.

#### Which to Choose?

| Scenario                                                  | Recommendation                |
| --------------------------------------------------------- | ----------------------------- |
| New v7+ projects                                          | Approach A (`status()`)       |
| Domain has multiple pieces (entities, filters, selection) | Approach A                    |
| Custom error types needed                                 | Approach A with `status<E>()` |
| Domain is just an entity collection                       | Approach C                    |
| Legacy code migration                                     | Approach B                    |

**v7 Recommendation:** Use `status()` marker for new code. It reduces boilerplate and provides type-safe derived signals.

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
> | Structure         | Entity Access                  | Metadata Access                      |
> | ----------------- | ------------------------------ | ------------------------------------ |
> | Flat (A)          | `tree.$.plants.all()`          | N/A (use component signals)          |
> | With Meta (B)     | `tree.$.plants.entities.all()` | `tree.$.plants.meta.operations.load` |
> | Flat Siblings (C) | `tree.$.plants.entities.all()` | `tree.$.plants.operations.load`      |

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
      this.tree.$.plants.entities.setAll(plants);
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
      this.tree.$.plants.entities.updateOne(saved.id, saved);
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

  readonly plants = this.tree.$.plants.entities.all;
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
      this.tree.$.plants.entities.setAll(plants);
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

---

### Pattern 3: Optimistic Updates with Rollback

> **⚠️ Important:** Optimistic rollback and user undo (Ctrl+Z) are different concerns. See [Common Misconceptions](#common-misconceptions) for details on why `timeTravel` should generally NOT be used for API failure rollback.

**Recommended: Snapshot-Based Rollback**

This is the correct pattern for optimistic updates. It captures state before mutation and restores on failure:

```typescript
async updatePlant(id: string, changes: Partial<Plant>) {
  // 1. Capture previous state BEFORE mutation
  const previous = this.tree.$.plants.entities.byId(id)?.();

  // 2. Optimistic update (UI reflects change immediately)
  this.tree.$.plants.entities.updateOne(id, changes);

  try {
    // 3. API call
    await this.api.updatePlant(id, changes);
  } catch (e) {
    // 4. Targeted rollback - ONLY this entity, doesn't affect undo history
    if (previous) {
      this.tree.$.plants.entities.updateOne(id, previous);
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
    updates.map(({ id }) => [id, this.tree.$.plants.entities.byId(id)?.()])
  );

  // Optimistic batch update
  this.tree.batchUpdate(() => {
    for (const { id, changes } of updates) {
      this.tree.$.plants.entities.updateOne(id, changes);
    }
  });

  try {
    await this.api.bulkUpdate(updates);
  } catch (e) {
    // Rollback all
    this.tree.batchUpdate(() => {
      for (const [id, previous] of previousStates) {
        if (previous) {
          this.tree.$.plants.entities.updateOne(id, previous);
        }
      }
    });
    throw e;
  }
}
```

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
        this.tree.$.gardens.entities.removeOne(gardenId);

        // Remove associated plants
        const plantsToRemove = this.tree.$.plants.entities
          .all()
          .filter((p) => p.gardenId === gardenId)
          .map((p) => p.id);

        for (const plantId of plantsToRemove) {
          this.tree.$.plants.entities.removeOne(plantId);
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
  const allPlants = this.tree.$.plants.entities.all();
  const gardens = this.tree.$.gardens.entities.all();
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
    all: plants.entities.all,
    byId: (id: string) => plants.entities.byId(id),

    // Filtered selections
    active: computed(() =>
      plants.entities.all().filter(p => p.active)
    ),

    byGarden: (gardenId: string) => computed(() =>
      plants.entities.all().filter(p => p.gardenId === gardenId)
    ),

    // Aggregations
    stats: computed(() => {
      const all = plants.entities.all();
      return {
        total: all.length,
        active: all.filter(p => p.active).length,
        needsWater: all.filter(p => p.needsWater).length,
        bySpecies: groupBy(all, 'species')
      };
    }),

    // Filtered + sorted (combines filters and sort state)
    filteredAndSorted: computed(() => {
      const entities = plants.entities.all();
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
    const entities = this.tree.$.plants.entities.all();
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

  async loadPage(page: number, mode: 'replace' | 'append' = 'replace') {
    const { pageSize } = this.pagination();

    this.tree.$.plants.meta.operations.loadPage.set({ status: 'pending', error: null });

    try {
      const result = await this.api.getPlants({ page, pageSize });

      this.tree.batchUpdate(() => {
        if (mode === 'replace' || page === 1) {
          this.tree.$.plants.entities.setAll(result.items);
        } else {
          for (const plant of result.items) {
            this.tree.$.plants.entities.addOne(plant);
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
    await this.loadPage(this.currentPage() + 1, 'append');
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
      openObserver: { next: () => this.tree.$.realtime.status.set('connected') },
      closeObserver: { next: () => this.tree.$.realtime.status.set('disconnected') },
    });

    this.socket$.pipe(retry({ delay: 5000 }), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => this.handleEvent(event),
      error: (err) => {
        this.tree.$.realtime.set({ status: 'error', lastEvent: null, error: err.message });
      },
    });
  }

  private handleEvent(event: RealtimeEvent) {
    this.tree.$.realtime.lastEvent.set(event);

    switch (event.type) {
      case 'plant:created':
        this.tree.$.plants.entities.addOne(event.payload);
        break;
      case 'plant:updated':
        this.tree.$.plants.entities.updateOne(event.payload.id, event.payload.changes);
        break;
      case 'plant:deleted':
        this.tree.$.plants.entities.removeOne(event.payload.id);
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

**Modal Service:**

```typescript
@Injectable({ providedIn: 'root' })
export class ModalService {
  private tree = inject(APP_TREE);

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

  async confirm(config: Omit<ConfirmationConfig, 'onConfirm' | 'onCancel'>): Promise<boolean> {
    return new Promise((resolve) => {
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

  async load() {
    this.tree.$.featureFlags.meta.operations.load.set({ status: 'pending', error: null });

    try {
      const flags = await this.api.getFeatureFlags();
      this.tree.$.featureFlags.set({
        loaded: true,
        flags,
        meta: { operations: { load: { status: 'success', error: null } } },
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

  readonly newPlantEditor = this.isEnabled('new-plant-editor');
  readonly darkMode = this.isEnabled('dark-mode');
}
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
    return this.tree.$.plants.entities.all().filter((p) => ids.has(p.id));
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
      const updated = new Set(this.selectedIds());
      updated.add(id);
      this.tree.$.plants.meta.selection.set({
        ...this.selection(),
        selectedIds: updated,
        lastSelectedId: id,
      });
    }
  }

  toggle(id: string) {
    if (this.selectedIds().has(id)) {
      const updated = new Set(this.selectedIds());
      updated.delete(id);
      this.tree.$.plants.meta.selection.selectedIds.set(updated);
    } else {
      this.select(id);
    }
  }

  clearSelection() {
    this.tree.$.plants.meta.selection.selectedIds.set(new Set());
  }
}
```

---

### Pattern 14: Undo/Redo with Time Travel

**Using the Time Travel Enhancer:**

```typescript
const tree = signalTree<AppState>({...})
  .with(timeTravel({ maxHistory: 50 }));

@Injectable({ providedIn: 'root' })
export class UndoService {
  private tree = inject(APP_TREE);

  readonly canUndo = this.tree.canUndo;
  readonly canRedo = this.tree.canRedo;

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

## Where Do Selectors Live?

Selectors (computed values derived from state) can live in three places. Choose based on reuse.

### Option 1: Component-Local (Default)

For selectors used in one component only.

```typescript
@Component({...})
export class PlantListComponent {
  private readonly tree = inject(APP_TREE);

  // Local selector - only used here
  readonly activePlants = computed(() =>
    this.tree.$.plants.all().filter(p => p.active)
  );

  readonly plantsByGarden = computed(() => {
    const gardenId = this.selectedGardenId();
    return this.tree.$.plants.all().filter(p => p.gardenId === gardenId);
  });
}
```

**Use when:** Selector is specific to one component's needs.

---

### Option 2: Selector Factory (Recommended for Reuse)

For selectors used in 2-3 places. Tree-shakeable.

```typescript
// plant.selectors.ts
export function createPlantSelectors(tree: AppTree) {
  return {
    active: computed(() => tree.$.plants.all().filter(p => p.active)),

    byGarden: (gardenId: string) => computed(() =>
      tree.$.plants.all().filter(p => p.gardenId === gardenId)
    ),

    stats: computed(() => {
      const all = tree.$.plants.all();
      return {
        total: all.length,
        active: all.filter(p => p.active).length,
        needsWater: all.filter(p => p.needsWater).length,
        bySpecies: groupBy(all, 'species')
      };
    }),

    // Filtered + sorted (combines filters and sort state)
    filteredAndSorted: computed(() => {
      const entities = tree.$.plants.all();
      const filters = tree.$.plants.meta.filters();
      const sort = tree.$.plants.meta.sort();

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

**Use when:** Same selector logic needed in multiple components.

---

### Option 3: Injectable Service (For DI Needs)

For selectors that need dependency injection or are used app-wide.

```typescript
// app-selectors.service.ts
@Injectable({ providedIn: 'root' })
export class AppSelectors {
  private readonly tree = inject(APP_TREE);

  // Cross-domain selectors used everywhere
  readonly selectedTruck = computed(() => {
    const id = this.tree.$.selected.truckId();
    return id ? this.tree.$.trucks.byId(id)?.() ?? null : null;
  });

  readonly isExternal = computed(() => this.tree.$.driver.current()?.isExternal ?? true);

  readonly selectableTrucks = computed(() => {
    if (!this.isExternal()) return this.tree.$.trucks.all();
    const haulerId = this.tree.$.selected.haulerId();
    return haulerId ? this.tree.$.haulers.byId(haulerId)?.()?.trucks ?? [] : [];
  });
}
```

**Use when:** Selectors are used in 4+ places OR need DI.

---

### Decision Guide

| Selector Usage | Location           | Example                             |
| -------------- | ------------------ | ----------------------------------- |
| 1 component    | Component-local    | `readonly filtered = computed(...)` |
| 2-3 components | Factory function   | `createPlantSelectors(tree)`        |
| 4+ components  | Injectable service | `AppSelectors`                      |
| Needs DI       | Injectable service | Selectors using other services      |

---

## Common Misconceptions

### Misconception 1: Time Travel = Optimistic Rollback

**The Wrong Assumption:**

```typescript
// "I can use timeTravel for API failure rollback"
async updatePlant(id: string, changes: Partial<Plant>) {
  this.tree.$.plants.entities.updateOne(id, changes);
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
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    });
}

// API rollback - USE snapshot pattern
async updatePlant(id: string, changes: Partial<Plant>) {
  const previous = this.tree.$.plants.entities.byId(id)?.();
  this.tree.$.plants.entities.updateOne(id, changes);
  try {
    await this.api.updatePlant(id, changes);
  } catch (e) {
    if (previous) this.tree.$.plants.entities.updateOne(id, previous);
    throw e;
  }
}
```

---

### Misconception 2: More Enhancers = Over-Engineering

**The Wrong Assumption:**

```typescript
// "Using multiple enhancers is over-engineering"
const tree = signalTree(state).with(batching()).with(timeTravel()).with(devTools()).with(memoization()); // ❌ "Too many enhancers!"
// Note: v7+ auto-processes markers (entityMap, status, stored), no explicit enhancer needed
```

**Why This Is Wrong:**

Enhancers are designed to compose. Using multiple enhancers that each serve a purpose is not over-engineering—it's using the library correctly.

| Enhancer        | Purpose                | Over-engineering?                     |
| --------------- | ---------------------- | ------------------------------------- |
| `entityMap()`   | Entity collections     | No—auto-processed marker in v7+       |
| `status()`      | Loading/error state    | No—auto-processed marker in v7+       |
| `stored()`      | Persist to storage     | No—auto-processed marker in v7+       |
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
2. **Is it actually used?**
3. **Is it in the right place?**

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
      → [Where does tree mutation happen?]
        → [Where does API call happen?]
```

**Red Flags:**

- More than 3 layers between component and tree
- Same data transformed multiple times
- Multiple places that could trigger the same mutation
- Unclear ownership of side effects

---

### Step 4: Identify True Responsibilities

For each layer that remains, it should have exactly one responsibility:

| Layer       | Responsibility                           | Should NOT Do                                 |
| ----------- | ---------------------------------------- | --------------------------------------------- |
| **Component**   | UI rendering, user event handling        | Business logic, API calls                     |
| **Facade**      | Orchestration, cross-domain coordination | Direct DOM manipulation, store implementation |
| **Tree**    | State storage, enhancer composition      | Business logic, API calls                     |
| **API Service** | HTTP calls, response mapping             | State management, caching                     |

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

---

### Step 6: Migration Checklist

Use this checklist when simplifying an implementation. The goal is repeatable, measurable, and low-risk migration.

#### Pre-migration

- [ ] Audit each abstraction layer: who consumes it, what it exposes, and whether it duplicates built-in SignalTree features.
- [ ] Measure baseline metrics:
    - Lines of code: `git ls-files | xargs wc -l`
    - Delta on removal: `git diff --numstat origin/main...HEAD -- frontend`
    - Baseline bundle composition: `pnpm nx build <app> --statsJson` (save `dist/.../stats.json`)
    - Test coverage and runtime smoke tests
- [ ] Create a small, reversible plan (small commits, feature-flag if needed)

#### Migration steps (order of safety)

1. Remove dead code and unused helpers.
2. Replace duplicate functionality with built-in primitives (`entityMap`, `devTools`, `batching`, `persistence`, etc.).
3. Move misplaced logic to facades/ops (keep tree purely for state + enhancers).
4. Replace `withX` patterns with `ops` services, `AppComputed` services, or direct tree usage as appropriate.
5. Add tests (unit + integration) for each change before removing the old code.
6. Keep each change small and measured (one feature at a time).

#### Mapping (NgRx → SignalTree) quick reference

| NgRx construct                   | SignalTree equivalent               | Notes/examples                                                                                |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `withEntityCrud`, `withEntities` | `entityMap()`                       | Use `.set`, `.delete`, `.byId()` and `.all()` (see `libs/store`)                              |
| `withComputed`                   | centralized `AppComputed`           | Put cross-domain derived signals in one place (`libs/store/src/lib/computed/app-computed.ts`) |
| `withMethods` / store methods    | `ops` services (return observables) | e.g. `ticket-ops.ts` — keep side-effects injectable and testable                              |
| `withTrackedChanges`             | `tracked-changes-manager` service   | Centralize undo/redo handling rather than per-store plumbing                                  |
| `withReduxDevtools`              | `devTools()` enhancer               | Built-in to SignalTree, enable in dev only                                                    |
| `memoization()`                  | Cache computed values              | No—if you have expensive computations                                                          |

#### Testing recipes (practical examples)

- Reusable mock tree:

```ts
// libs/store/src/lib/testing/provide-mock-app-tree.ts
export function provideMockAppTree(setup?: (tree: AppTree) => void) {
  return [
    {
      provide: APP_TREE,
      useFactory: () => {
        const t = createAppTree();
        setup?.(t);
        return t;
      },
    },
  ];
}
```

- Stubbing external connectors (DatabusHub stub used in `apps/demo` tests):

```ts
// In failing test suites, add a lightweight stub
const provideMockDatabusHub = () => ({ provide: 'DATABUS_HUB_TEST', useValue: {} });

TestBed.configureTestingModule({ providers: [provideMockAppTree(), provideMockDatabusHub()] });
```

- Testing an `ops` service:

```ts
it('loadActiveTicket sets tree state', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideMockAppTree((tree) => {
        tree.$.tickets.isLoading.set(false);
      }),
      TicketOps,
      { provide: TicketApi, useValue: mockApi },
    ],
  });
  const ops = TestBed.inject(TicketOps);
  await ops.loadActiveTicket$(123).toPromise();
  expect(TestBed.inject(APP_TREE).$.tickets.active()).toBeTruthy();
});
```

#### Bundle-size CI gating (example)

- Create `scripts/check-bundle-size.js` that reads `dist/*/stats.json` and verifies the gzipped size for targeted inputs (e.g., `libs/store` + `@signaltree/core`) does not exceed agreed thresholds.

- Example snippet (pseudo):

```js
const stats = require('./dist/apps/demo/stats.json');
const sumBytes = Object.entries(stats.inputs)
  .filter(([k]) => k.startsWith('libs/store') || k.includes('@signaltree/core'))
  .reduce((s, [, v]) => s + (v.bytes || 0), 0);
if (sumBytes > THRESHOLD) process.exit(2);
```

- Add CI job to run `pnpm nx build demo --statsJson` and then `node scripts/check-bundle-size.js` and fail PRs that increase the state-management footprint beyond the approved budget.

#### Batching & performance (guidance)

- Use `batch()`/`batching()` to coalesce many synchronous updates into one render pass. Prefer it for multi-entity updates (e.g., initial sync, large imports).
- Avoid over-batching in user-facing interactions where visible intermediate states are helpful. If combining async operations, use short, explicit batches to keep UI responsive.
- Use the synchronous batching plan for worst-case debugging and when you need deterministic profiling: see `SIGNALTREE_SYNCHRONOUS_BATCHING_PLAN.md` in the repo.

#### Ops & tracked-changes patterns

- Prefer small, single-responsibility `ops` services that accept IDs/params and return Observables for side-effects and API interactions.
- Keep undo/redo and tracked-changes centralized in the tracked-changes manager; tests should verify undo/redo round-trips.

#### Post-migration checklist

- [ ] All tests pass (unit & integration)
- [ ] Build and production smoke tests pass
- [ ] Measured post-migration metrics (lines, bundle, runtime perf) and documented
- [ ] Update architecture docs with the migration notes and link to demo recipes
- [ ] Draft release notes highlighting the migration, regressions tested, and rollback steps

---

---

## Summary: Recommended Default Architecture

For most Angular applications using SignalTree, we recommend a **modular architecture** with derived tiers and domain operations:

### Folder Structure

```
store/
├── app-store.ts                    # Thin facade - composes ops namespace
├── tree/
│   ├── index.ts                    # Re-exports
│   ├── app-tree.ts                 # Tree assembly (imports domains)
│   ├── app-tree.provider.ts        # DI setup
│   │
│   ├── state/                      # Initial state definitions
│   │   ├── index.ts
│   │   ├── tickets.state.ts
│   │   ├── users.state.ts
│   │   └── shared.state.ts         # loadingSlice(), etc.
│   │
│   └── derived/                    # Derived tier definitions
│       ├── index.ts
│       ├── tier-1.derived.ts       # Entity resolution
│       ├── tier-2.derived.ts       # Complex logic
│       ├── tier-3.derived.ts       # Workflow
│       ├── tier-4.derived.ts       # Workflow navigation
│       └── tier-5.derived.ts       # UI aggregates
│
└── ops/                            # Async operations by domain
    ├── index.ts
    ├── ticket.ops.ts
    ├── user.ops.ts
    └── auth.ops.ts
```

### The One Paradigm Rule

**All state access uses `store.$.path.to.thing()`** - no aliases, no duplicate accessors.
**All operations use `store.ops.domain.method()`** - domain ops handle mutations and async.

```typescript
// ✅ Correct - single access patterns
const user = this._store.$.users.current();
const isLoading = this._store.$.users.loading.state();
this._store.ops.users.loadUsers$().subscribe();
this._store.ops.users.setCurrentUser(user);

// ❌ Wrong - aliases that duplicate tree paths
readonly currentUser = this.$.users.current;  // Don't create aliases in AppStore

// ❌ Wrong - old pattern without ops namespace
this._store.users.loadUsers$().subscribe();  // Use store.ops.users instead
```

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Components                           │
│  • Access state via store.$.domain.property()               │
│  • Call operations via store.ops.domain.method()            │
│  • Use local signals for UI-only state                      │
└─────────────────────────────────┬───────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────┐
│                    AppStore (Thin Facade)                   │
│  • Exposes tree.$ for state access                          │
│  • Composes domain ops via ops namespace                    │
│  • Cross-domain orchestration methods only (rare)           │
└─────────────────────────────────┬───────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Domain Ops    │    │   Domain Ops    │    │   Domain Ops    │
│  (ticket.ops)   │    │   (user.ops)    │    │   (auth.ops)    │
│  • Mutations    │    │  • Mutations    │    │  • Mutations    │
│  • Async ops    │    │  • Async ops    │    │  • Async ops    │
│  • Loading mgmt │    │  • Loading mgmt │    │  • Loading mgmt │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                   Signal Tree (app-tree.ts)                 │
│  • Base state from state/*.state.ts                         │
│  • Enhancers: devTools, batching, memoization, timeTravel   │
│  • Derived tiers: tier-1 → tier-2 → tier-3 → tier-4 → tier-5│
└─────────────────────────────────────────────────────────────┘
```

### Derived Tier Rules

**Critical Rule**: Computed signals in a tier can only reference:

- Base state signals
- Computed signals from **previous** tiers

```typescript
// ✅ Tier 4 can use Tier 3's $.workflow.statusDisplayMap()
.derived($ => ({
  workflow: {
    currentForDisplay: computed(() => {
      const displayMap = $.workflow.statusDisplayMap(); // From Tier 3
      return { ...status, label: displayMap[status.status]?.label };
    })
  }
}))

// ❌ WRONG - Cannot reference same-tier computed
.derived($ => ({
  workflow: {
    statusDisplayMap: computed(() => { /* ... */ }),
    currentForDisplay: computed(() => {
      // ERROR: statusDisplayMap doesn't exist yet in this tier!
      const displayMap = $.workflow.statusDisplayMap();
    })
  }
}))
```

**Solution**: If computed B depends on computed A, move A to an earlier tier.

### External Derived Utilities

When derived functions are defined in **separate files** (recommended for modular architecture), TypeScript cannot infer parameter types from the call site. SignalTree provides utilities to handle this:

#### `derivedFrom<TTree>()`

A curried helper function that provides type context for derived functions in external files:

```typescript
// derived/tier-1.derived.ts
import { derivedFrom } from '@signaltree/core';
import type { AppTreeBase } from '../app-tree';

/**
 * Derived Tier 1: Entity Resolution
 *
 * Resolves IDs to actual entities. Transforms raw ID references
 * into computed signals that return full entity objects.
 *
 * NOTE: Use derivedFrom<TTree>() when defining derived functions in
 * external files. This provides type context for the $ parameter.
 * Inline functions (within .derived() call) don't need this helper.
 */
export const tier1Derived = derivedFrom<AppTreeBase>()(($) => ({
  users: {
    current: computed(() => {
      const userId = $.selected.userId();
      return userId != null ? $.users.byId(userId)?.() ?? null : null;
    }),
  },
  tickets: {
    active: computed(() => {
      const activeId = $.tickets.activeId();
      return activeId != null ? $.tickets.entities.byId(activeId)?.() ?? null : null;
    }),
  },
}));
```

#### Domain Ops (`ops/ticket.ops.ts`)

```typescript
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { LoadingState, Nullable, TicketDto } from '@models';
import { TicketService } from '@services';
import { APP_TREE } from '../tree/app-tree';

@Injectable({ providedIn: 'root' })
export class TicketOps {
  private readonly _ticketApi = inject(TicketService);
  private readonly _$ = inject(APP_TREE).$;

  // Mutations
  setActiveTicket(ticket: Nullable<TicketDto>): void {
    if (ticket) {
      this._$.tickets.entities.upsertOne(ticket, { selectId: (t: TicketDto) => t.id });
      this._$.tickets.activeId.set(ticket.id);
    } else {
      this._$.tickets.activeId.set(null);
    }
  }

  // Async Operations
  loadActiveTicket$(): Observable<void> {
    this._setLoading();
    return this._ticketApi.getActiveTicket$().pipe(
      tap((ticket) => this.setActiveTicket(ticket ?? null)),
      tap(() => this._setLoaded()),
      map(() => void 0),
      catchError((err) => {
        this._setError(err, 'loadActiveTicket$');
        return of(void 0);
      })
    );
  }

  // Private Helpers
  private _setLoading(): void {
    this._$.tickets.loading.state.set(LoadingState.Loading);
    this._$.tickets.loading.error.set(null);
  }

  private _setLoaded(): void {
    this._$.tickets.loading.state.set(LoadingState.Loaded);
  }

  private _setError(err: unknown, context: string): void {
    this._$.tickets.loading.state.set(LoadingState.Error);
    this._$.tickets.loading.error.set({ message: String(err), context });
  }
}
```

#### AppStore (`app-store.ts`)

```typescript
import { inject, Injectable } from '@angular/core';
import { APP_TREE, AppTree } from './tree/app-tree';
import { TicketOps } from './ops/ticket.ops';
import { UserOps } from './ops/user.ops';
import { AuthOps } from './ops/auth.ops';

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree: AppTree = inject(APP_TREE);
  readonly $ = this.tree.$;

  // Domain operations via ops namespace
  readonly ops = {
    tickets: inject(TicketOps),
    users: inject(UserOps),
    auth: inject(AuthOps),
  };

  // Cross-domain orchestration only (rare)
  clearSelections(): void {
    this.$.selected.userId.set(null);
    this.$.selected.ticketId.set(null);
  }
}
```

#### Component Usage

```typescript
@Component({ ... })
export class TicketListComponent {
  private store = inject(AppStore);

  // State access - always via $
  readonly tickets = this.store.$.tickets.all;
  readonly isLoading = this.store.$.tickets.loading.state;
  readonly activeTicket = this.store.$.tickets.active;

  // Operations - via ops.domain
  loadTickets() {
    this.store.ops.tickets.loadTickets$().subscribe();
  }

  selectTicket(ticket: TicketDto) {
    this.store.ops.tickets.setActiveTicket(ticket);
  }
}
```

### Summary Table

| Layer       | Responsibility       | Location                         |
| ----------- | -------------------- | -------------------------------- |
| **State**   | Initial state shape  | `tree/state/*.state.ts`          |
| **Derived** | Computed signals     | `tree/derived/tier-*.derived.ts` |
| **Tree**    | Assembly + enhancers | `tree/app-tree.ts`               |
| **Ops**     | Mutations + async    | `ops/*.ops.ts`                   |
| **Store**   | Thin facade          | `app-store.ts`                   |

### What to Keep vs. Remove

| Layer                 | Verdict         | Reasoning                                          |
| --------------------- | --------------- | -------------------------------------------------- |
| Global App Tree       | **Keep**        | Core value prop—unified state, dot notation access |
| Domain Ops            | **Keep**        | Encapsulate mutations and async operations         |
| Domain Services (API) | **Keep**        | Clean separation of HTTP concerns                  |
| AppStore Facade       | **Keep (thin)** | Composes ops, minimal orchestration only           |
| Loading Helpers       | **Remove**      | Use domain-scoped operations state in ops          |
| Service Managers      | **Remove**      | Fold into ops files                                |
| Type Definitions      | **Simplify**    | Reduce aliases, let inference work                 |

### Decision Guide: Where Does Logic Live?

| Operation Type           | Location                | Example                                     |
| ------------------------ | ----------------------- | ------------------------------------------- |
| Read state               | Component via `store.$` | `store.$.tickets.active()`                  |
| Simple mutation          | Domain ops              | `store.ops.tickets.setActiveTicket(ticket)` |
| API call (single domain) | Domain ops              | `store.ops.tickets.loadActiveTicket$()`     |
| API call (multi-domain)  | Cross-domain in store   | `store.loadDashboard$()` (rare)             |
| Business rule validation | Domain ops              | Ownership checks in ops method              |
| Cross-domain mutation    | Store method            | `store.clearSelections()`                   |
| UI-only state            | Component signal        | `showModal = signal(false)`                 |

This gives you unified dot notation access, minimal abstraction layers, and clear separation between state access (`store.$`) and operations (`store.ops`).

import { computed, effect, InjectionToken, Signal } from '@angular/core';
import { entityMap, EntitySignal, signalTree, withDevTools, withEntities } from '@signaltree/core';
import { catchError, delay, EMPTY, map, Observable, of, tap } from 'rxjs';

// ============================================================================
// Types
// ============================================================================

export interface UserDto {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
}

export enum LoadingState {
  NotLoaded = 'not-loaded',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

/** State shape using SignalTree entity markers */
export interface UserTreeState {
  users: ReturnType<typeof entityMap<UserDto, number>>;
  selected: {
    userId: number | null;
  };
  loading: {
    state: LoadingState;
    error: string | null;
  };
  filter: {
    searchTerm: string;
    roleFilter: string | null;
    showInactive: boolean;
  };
}

// ============================================================================
// Public Interface (Read-Only Contract)
// ============================================================================

/**
 * UserTree public API interface.
 *
 * Declares Signal<T> (read-only) for state signals while the implementation
 * returns WritableSignal<T>. TypeScript enforces the read-only contract at
 * compile time while keeping the implementation simple.
 */
export interface UserTree {
  // Entity collection (SignalTree EntitySignal - O(1) CRUD)
  readonly users: EntitySignal<UserDto, number>;

  // State signals (read-only via TypeScript interface)
  readonly selectedUserId: Signal<number | null>;
  readonly loadingState: Signal<LoadingState>;
  readonly error: Signal<string | null>;
  readonly searchTerm: Signal<string>;

  // Computed selectors (derived state)
  readonly selectedUser: Signal<UserDto | null>;
  readonly filteredUsers: Signal<UserDto[]>;
  readonly activeUserCount: Signal<number>;
  readonly isLoaded: Signal<boolean>;
  readonly isLoading: Signal<boolean>;

  // Mutation methods
  setSelectedUser(id: number | null): void;
  setSearchTerm(term: string): void;
  setRoleFilter(role: string | null): void;
  toggleShowInactive(): void;
  clearUsers(): void;

  // Async operations
  loadAll$(): Observable<void>;
  refresh(): void;
}

// ============================================================================
// Injection Token & Provider
// ============================================================================

export const USER_TREE = new InjectionToken<UserTree>('UserTree');

export function provideUserTree() {
  return {
    provide: USER_TREE,
    useFactory: createUserTree,
  };
}

// ============================================================================
// Factory Function (SignalTree-First Implementation)
// ============================================================================

const STORE_NAME = 'UserTree';

/**
 * Creates a SignalTree-based UserTree for managing users.
 *
 * This is the **canonical example** of SignalTree-first implementation:
 * - Direct signal exposure from $ tree (no computed wrappers)
 * - TypeScript interface for read-only contract
 * - computed() only for derived state
 * - EntitySignal API for O(1) entity operations
 * - effect() for side effects
 *
 * @example
 * ```typescript
 * const userTree = inject(USER_TREE);
 *
 * // Entity access (O(1) lookups)
 * const user = userTree.users.byId(123)();
 * const allUsers = userTree.users.all();
 *
 * // Reactive selectors
 * effect(() => console.log('Selected:', userTree.selectedUser()));
 *
 * // Load data
 * userTree.loadAll$().subscribe();
 * ```
 */
export function createUserTree(): UserTree {
  // ============================================================
  // Initial State
  // ============================================================

  const initialState: UserTreeState = {
    users: entityMap<UserDto, number>(),
    selected: {
      userId: null,
    },
    loading: {
      state: LoadingState.NotLoaded,
      error: null,
    },
    filter: {
      searchTerm: '',
      roleFilter: null,
      showInactive: false,
    },
  };

  // ============================================================
  // Create Signal Tree
  // ============================================================

  const tree = signalTree(initialState)
    .with(withEntities())
    .with(withDevTools({ treeName: STORE_NAME }));

  // Shorthand for tree access
  const $ = tree.$;

  // ============================================================
  // Computed Selectors (Actual Derived State)
  // ============================================================

  /** Selected user entity - derived from ID + entity collection */
  const selectedUser = computed(() => {
    const id = $.selected.userId();
    if (id === null) return null;
    const userSignal = $.users.byId(id);
    return userSignal ? userSignal() ?? null : null;
  });

  /** Users filtered by search term, role, and active status */
  const filteredUsers = computed(() => {
    const all = $.users.all();
    const search = $.filter.searchTerm().toLowerCase();
    const role = $.filter.roleFilter();
    const showInactive = $.filter.showInactive();

    return all.filter((user: UserDto) => {
      // Filter by active status
      if (!showInactive && !user.isActive) return false;

      // Filter by role
      if (role && user.role !== role) return false;

      // Filter by search term
      if (search) {
        const matchesName = user.name.toLowerCase().includes(search);
        const matchesEmail = user.email.toLowerCase().includes(search);
        if (!matchesName && !matchesEmail) return false;
      }

      return true;
    });
  });

  /** Count of active users */
  const activeUserCount = computed(() => {
    return $.users.all().filter((u: UserDto) => u.isActive).length;
  });

  /** Loading state checks */
  const isLoaded = computed(() => $.loading.state() === LoadingState.Loaded);
  const isLoading = computed(() => $.loading.state() === LoadingState.Loading);

  // ============================================================
  // Mutation Methods
  // ============================================================

  function setSelectedUser(id: number | null): void {
    $.selected.userId.set(id);
  }

  function setSearchTerm(term: string): void {
    $.filter.searchTerm.set(term);
  }

  function setRoleFilter(role: string | null): void {
    $.filter.roleFilter.set(role);
  }

  function toggleShowInactive(): void {
    $.filter.showInactive.update((v: boolean) => !v);
  }

  function clearUsers(): void {
    $.users.clear();
    $.selected.userId.set(null);
    $.loading.state.set(LoadingState.NotLoaded);
  }

  // ============================================================
  // Async Operations
  // ============================================================

  /** Load all users - returns Observable<void>, consumers read from signals */
  function loadAll$(): Observable<void> {
    // Guard against duplicate requests
    if ($.loading.state() === LoadingState.Loading) {
      return EMPTY;
    }

    // Set loading state
    $.loading.state.set(LoadingState.Loading);
    $.loading.error.set(null);

    // Simulate API call (replace with real service in production)
    return of(getMockUsers()).pipe(
      delay(500), // Simulate network latency
      tap((users) => {
        $.users.setAll(users);
        $.loading.state.set(LoadingState.Loaded);
      }),
      map(() => void 0), // Return void, not data
      catchError((error) => {
        $.loading.error.set(error.message ?? 'Failed to load users');
        $.loading.state.set(LoadingState.Error);
        return EMPTY;
      })
    );
  }

  /** Force refresh - clears cache and reloads */
  function refresh(): void {
    $.loading.state.set(LoadingState.NotLoaded);
    loadAll$().subscribe();
  }

  // ============================================================
  // Side Effects
  // ============================================================

  // Log selection changes (replace with analytics in production)
  effect(() => {
    const user = selectedUser();
    if (user) {
      console.log(`[${STORE_NAME}] Selected user:`, user.name);
    }
  });

  // Persist filter to sessionStorage
  effect(() => {
    const filter = {
      searchTerm: $.filter.searchTerm(),
      roleFilter: $.filter.roleFilter(),
      showInactive: $.filter.showInactive(),
    };
    sessionStorage.setItem(`${STORE_NAME}-filter`, JSON.stringify(filter));
  });

  // ============================================================
  // Public API (SignalTree-First Pattern)
  // ============================================================

  return {
    // Entity collection (SignalTree EntitySignal - O(1) CRUD)
    users: $.users,

    // State signals (direct exposure - SignalTree-first)
    // TypeScript interface declares Signal<T> for read-only contract
    selectedUserId: $.selected.userId,
    loadingState: $.loading.state,
    error: $.loading.error,
    searchTerm: $.filter.searchTerm,

    // Computed selectors (actual derived state)
    selectedUser,
    filteredUsers,
    activeUserCount,
    isLoaded,
    isLoading,

    // Mutation methods (preferred for complex state changes)
    setSelectedUser,
    setSearchTerm,
    setRoleFilter,
    toggleShowInactive,
    clearUsers,

    // Async operations
    loadAll$,
    refresh,
  };
}

// ============================================================================
// Mock Data (Replace with real API service)
// ============================================================================

function getMockUsers(): UserDto[] {
  return [
    {
      id: 1,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'admin',
      isActive: true,
    },
    {
      id: 2,
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'user',
      isActive: true,
    },
    {
      id: 3,
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      role: 'user',
      isActive: false,
    },
    {
      id: 4,
      name: 'Diana Prince',
      email: 'diana@example.com',
      role: 'admin',
      isActive: true,
    },
    {
      id: 5,
      name: 'Eve Wilson',
      email: 'eve@example.com',
      role: 'guest',
      isActive: true,
    },
    {
      id: 6,
      name: 'Frank Castle',
      email: 'frank@example.com',
      role: 'user',
      isActive: false,
    },
    {
      id: 7,
      name: 'Grace Lee',
      email: 'grace@example.com',
      role: 'user',
      isActive: true,
    },
    {
      id: 8,
      name: 'Henry Ford',
      email: 'henry@example.com',
      role: 'guest',
      isActive: true,
    },
  ];
}

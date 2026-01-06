# SignalTree v7 Patterns Guide

## Core Philosophy

SignalTree v7 follows a **minimal marker** approach: we only provide markers for functionality that Angular doesn't have built-in.

### What SignalTree Provides (No Angular Equivalent)

| Marker                 | Purpose                                         | Use When                                |
| ---------------------- | ----------------------------------------------- | --------------------------------------- |
| `entityMap<T, K>()`    | Normalized collections with `byId`, `all`, etc. | Managing lists of entities by ID        |
| `status()`             | Manual async operation state                    | Form submissions, multi-step operations |
| `stored(key, default)` | localStorage persistence                        | Persisting user preferences             |

### What Angular Already Provides (Use Directly)

| Angular          | Purpose                        | SignalTree Action |
| ---------------- | ------------------------------ | ----------------- |
| `computed()`     | Derived read-only state        | Use directly      |
| `linkedSignal()` | Writable derived state         | Use directly      |
| `resource()`     | Async fetch with loading/error | Use directly      |

---

## The `.derived()` Rule

> **Rule: `.derived()` is only for when you need `$`**
>
> If your `computed()`, `resource()`, or `linkedSignal()` doesn't reference tree state, put it in the initial state directly.

### ✅ Correct: Primitives in Initial State

```typescript
signalTree({
  // Plain values → become signals
  count: 0,
  name: '',

  // SignalTree markers
  users: entityMap<User, number>(),
  usersStatus: status(),
  theme: stored('theme', 'light'),

  // Angular primitives that DON'T need tree state
  windowWidth: linkedSignal(() => window.innerWidth),
  serverConfig: resource({ loader: () => fetch('/api/config') }),
});
```

### ✅ Correct: Tree-Dependent State in `.derived()`

```typescript
.derived($ => ({
  // These NEED $ - they reference tree state
  doubled: computed(() => $.count() * 2),
  selectedUser: computed(() => $.users.byId($.selectedId())?.()),
  userDetails: resource({
    request: () => $.selectedId(),
    loader: ({ request }) => fetch(`/api/users/${request}`)
  })
}))
```

### ❌ Wrong: Independent Primitives in `.derived()`

```typescript
// Don't do this - these don't need $
.derived($ => ({
  windowWidth: linkedSignal(() => window.innerWidth),  // Move to initial state
  serverConfig: resource({ loader: () => fetch('/api/config') }),  // Move to initial state
}))
```

---

## Pattern: Entity List with Resource

Load a list into an entityMap with automatic loading state:

```typescript
import { signalTree, entityMap } from '@signaltree/core';
import { computed, resource } from '@angular/core';

interface User {
  id: number;
  name: string;
  email: string;
}

const store = signalTree({
  users: entityMap<User, number>(),
  selectedId: null as number | null,

  // Resource for fetching users - doesn't need tree state
  userListResource: resource({
    loader: async () => {
      const response = await fetch('/api/users');
      return response.json() as Promise<User[]>;
    },
  }),
}).derived(($) => ({
  // Derived state that DOES need tree state
  selectedUser: computed(() => {
    const id = $.selectedId();
    return id != null ? $.users.byId(id)?.() : null;
  }),

  userCount: computed(() => $.users.all().length),
}));
// Note: .with(entities()) no longer needed in v7 - entityMap auto-processes!

// Usage: Load users into entityMap when resource resolves
effect(() => {
  const users = store.$.userListResource.value();
  if (users) {
    store.$.users.setAll(users);
  }
});
```

---

## Pattern: Form with Manual Status

Use `status()` for operations where you control the loading state:

```typescript
import { signalTree, status, entityMap } from '@signaltree/core';
import { computed, linkedSignal } from '@angular/core';

interface FormData {
  name: string;
  email: string;
}

const formStore = signalTree({
  // Form data
  formData: {
    name: '',
    email: '',
  },

  // Manual async status for form submission
  submitStatus: status(),

  // Validation errors
  errors: {} as Record<string, string>,
}).derived(($) => ({
  // Validation depends on form data
  isValid: computed(() => {
    const data = $.formData;
    return data.name().length > 0 && data.email().includes('@');
  }),

  // Disable submit when loading or invalid
  canSubmit: computed(() => $.isValid() && !$.submitStatus.isLoading()),
}));

// Submit handler
async function handleSubmit() {
  if (!formStore.$.canSubmit()) return;

  formStore.$.submitStatus.setLoading();

  try {
    await fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify({
        name: formStore.$.formData.name(),
        email: formStore.$.formData.email(),
      }),
    });
    formStore.$.submitStatus.setLoaded();
  } catch (error) {
    formStore.$.submitStatus.setError(error as Error);
  }
}
```

---

## Pattern: Editable Derived State with linkedSignal

Use `linkedSignal()` for writable derived state:

```typescript
import { signalTree, entityMap } from '@signaltree/core';
import { computed, linkedSignal } from '@angular/core';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const todoStore = signalTree({
  todos: entityMap<Todo, number>(),
  selectedId: null as number | null,
}).derived(($) => ({
  // Read-only derived
  selectedTodo: computed(() => {
    const id = $.selectedId();
    return id != null ? $.todos.byId(id)?.() : null;
  }),

  // Editable copy of selected todo's text
  editableText: linkedSignal(() => {
    const todo = $.selectedTodo();
    return todo?.text ?? '';
  }),
}));
// Note: .with(entities()) no longer needed in v7 - entityMap auto-processes!

// Usage in component
function saveEdit() {
  const id = todoStore.$.selectedId();
  if (id != null) {
    const currentTodo = todoStore.$.todos.byId(id)?.();
    if (currentTodo) {
      todoStore.$.todos.upsertOne({
        ...currentTodo,
        text: todoStore.$.editableText(),
      });
    }
  }
}
```

---

## Pattern: User Preferences with stored()

Persist user preferences automatically:

```typescript
import { signalTree, stored } from '@signaltree/core';
import { computed } from '@angular/core';

type Theme = 'light' | 'dark' | 'system';

interface Preferences {
  notifications: boolean;
  fontSize: number;
  language: string;
}

const prefsStore = signalTree({
  // Individual stored values
  theme: stored<Theme>('app-theme', 'system'),

  // Complex stored object
  preferences: stored<Preferences>('user-prefs', {
    notifications: true,
    fontSize: 14,
    language: 'en',
  }),
}).derived(($) => ({
  // Derived from stored values
  effectiveTheme: computed(() => {
    const theme = $.theme();
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }),

  fontSizeClass: computed(() => {
    const size = $.preferences().fontSize;
    if (size < 14) return 'text-sm';
    if (size > 16) return 'text-lg';
    return 'text-base';
  }),
}));

// Theme changes auto-save to localStorage
prefsStore.$.theme.set('dark');

// Clear stored value (resets to default)
prefsStore.$.theme.clear();
```

---

## Pattern: status() vs resource() Decision

| Scenario                     | Use                         | Why                        |
| ---------------------------- | --------------------------- | -------------------------- |
| Fetch data on component init | `resource()`                | Auto-manages loading/error |
| Fetch when ID changes        | `resource()` with `request` | Auto-refetches             |
| Form submission              | `status()`                  | You control when it starts |
| Multi-step wizard            | `status()`                  | Complex state transitions  |
| Optimistic updates           | `status()`                  | Need manual control        |
| Simple GET request           | `resource()`                | Less boilerplate           |

### resource() - Angular Manages State

```typescript
// Angular handles loading/error automatically
userDetails: resource({
  request: () => $.selectedId(),
  loader: ({ request }) => fetch(`/api/users/${request}`),
});

// Access loading state via Angular's API
store.$.userDetails.isLoading(); // Angular provides this
store.$.userDetails.error(); // Angular provides this
store.$.userDetails.value(); // The resolved value
```

### status() - You Manage State

```typescript
submitStatus: status();

// You control state transitions
store.$.submitStatus.setLoading();
// ... do async work ...
store.$.submitStatus.setLoaded();
// or
store.$.submitStatus.setError(error);
```

---

## Summary

1. **Markers are for gaps** - Only use SignalTree markers when Angular doesn't provide the functionality
2. **Use Angular directly** - `computed()`, `linkedSignal()`, `resource()` work perfectly in SignalTree
3. **`.derived()` is for `$`** - Only put state in `.derived()` if it needs to reference tree state
4. **Choose the right async pattern** - `resource()` for auto-managed fetching, `status()` for manual control

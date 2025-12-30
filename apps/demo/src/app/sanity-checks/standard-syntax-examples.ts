import { signalTree } from '@signaltree/core';

// ==============================================
// Example 1: Basic Operations
// ==============================================

const basicTree = signalTree({
  name: 'John' as string,
  age: 30 as number,
  email: 'john@example.com' as string,
  active: true as boolean,
});

// Direct value updates (standard syntax)
basicTree.$.name.set('Jane Doe');
basicTree.$.age.set(25);
basicTree.$.email.set('jane@example.com');
basicTree.$.active.set(false);

// Functional updates (standard syntax)
basicTree.$.name.update((current) => current.toUpperCase());
basicTree.$.age.update((current) => current + 5);

// ==============================================
// Example 2: Nested Object Operations
// ==============================================

const nestedTree = signalTree({
  user: {
    profile: {
      firstName: 'John' as string,
      lastName: 'Doe' as string,
      settings: {
        theme: 'dark' as string,
        notifications: true as boolean,
      },
    },
    preferences: {
      language: 'en' as string,
      timezone: 'UTC' as string,
    },
  },
});

// Deep nested updates
nestedTree.$.user.profile.firstName.set('Jane');
nestedTree.$.user.profile.lastName.set('Smith');
nestedTree.$.user.profile.settings.theme.set('light');
nestedTree.$.user.preferences.language.set('es');

// Functional updates on individual nested properties
nestedTree.$.user.profile.firstName.update((current) => current + ' (Updated)');
nestedTree.$.user.profile.lastName.update((current) => current + ' (Updated)');

// ==============================================
// Example 3: Array Operations
// ==============================================

const arrayTree = signalTree({
  todos: [
    { id: 1, text: 'Learn SignalTree', done: false },
    { id: 2, text: 'Build awesome app', done: false },
  ] as Array<{ id: number; text: string; done: boolean }>,
  tags: ['typescript', 'angular'] as string[],
  scores: [95, 87, 92] as number[],
});

// Add new todo
arrayTree.$.todos.update((current) => [
  ...current,
  { id: 3, text: 'Deploy to production', done: false },
]);

// Mark todo as done
arrayTree.$.todos.update((current) =>
  current.map((todo) => (todo.id === 1 ? { ...todo, done: true } : todo))
);

// Add new tag
arrayTree.$.tags.update((current) => [...current, 'signaltree']);

// Update scores
arrayTree.$.scores.update((current) => current.map((score) => score + 3));

// ==============================================
// Example 4: Conditional and Complex Updates
// ==============================================

const stateTree = signalTree({
  ui: {
    loading: false as boolean,
    error: null as string | null,
    data: null as { results: string[] } | null,
  },
  filters: {
    search: '' as string,
    category: 'all' as string,
    sortBy: 'name' as string,
  },
});

// Simulate loading state
stateTree.$.ui.loading.set(true);
stateTree.$.ui.error.set(null);

// Simulate data loading
setTimeout(() => {
  stateTree.$.ui.loading.set(false);
  // Demo-local narrow cast to allow .set() on optional data node
  (
    stateTree.$.ui.data as unknown as {
      set: (v: { results: string[] }) => void;
    }
  ).set({ results: ['item1', 'item2', 'item3'] });
}, 100);

// Update filters based on conditions
stateTree.$.filters.search.update((current) => current.trim());
stateTree.$.filters.category.update((current) =>
  current === 'all' ? 'featured' : current
);

// ==============================================
// Example 5: Working with Optional Values
// ==============================================

const optionalTree = signalTree({
  user: {
    name: 'John' as string,
    email: 'john@example.com' as string,
    avatar: null as string | null,
    lastLogin: null as Date | null,
  },
  settings: {
    notifications: true as boolean,
    theme: 'auto' as 'light' | 'dark' | 'auto',
  },
});

// Handle optional values
optionalTree.$.user.avatar.set('https://example.com/avatar.jpg');
optionalTree.$.user.lastLogin.set(new Date());

// Conditional updates
optionalTree.$.user.avatar.update((current) => current || 'default-avatar.jpg');
optionalTree.$.user.lastLogin.update((current) => current || new Date());

// ==============================================
// Example 6: Performance and Batching
// ==============================================

const performanceTree = signalTree({
  metrics: {
    pageViews: 0 as number,
    uniqueVisitors: 0 as number,
    bounceRate: 0.0 as number,
  },
  analytics: {
    events: [] as Array<{ type: string; timestamp: Date }>,
    sessions: 0 as number,
  },
});

// Multiple rapid updates (would benefit from batching)
performanceTree.$.metrics.pageViews.update((current) => current + 1);
performanceTree.$.metrics.uniqueVisitors.update((current) => current + 1);
performanceTree.$.metrics.bounceRate.update((current) =>
  Math.max(0, current - 0.01)
);

// Batch analytics updates
performanceTree.$.analytics.events.update((current) => [
  ...current,
  { type: 'page_view', timestamp: new Date() },
  { type: 'user_action', timestamp: new Date() },
]);
performanceTree.$.analytics.sessions.update((current) => current + 1);

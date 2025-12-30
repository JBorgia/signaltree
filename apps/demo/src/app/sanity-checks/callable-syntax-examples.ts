import '@signaltree/callable-syntax/augmentation';

import { signalTree } from '@signaltree/core';

/**
 * 🎯 CALLABLE SYNTAX EXAMPLES
 *
 * This file demonstrates the callable syntax that requires the @signaltree/callable-syntax
 * build-time transform. The syntax shown here gets converted during compilation:
 *
 * • tree.$.prop('value') → tree.$.prop.set('value')
 * • tree.$.prop(fn) → tree.$.prop.update(fn)
 * • tree.$.prop() → tree.$.prop() (unchanged)
 *
 * ⚠️ TypeScript errors are EXPECTED without the transform!
 * ✅ Zero runtime overhead - pure build-time syntax sugar
 */
// ==============================================
// Example 1: Basic Operations
// ==============================================

const basicTree = signalTree({
  name: 'John' as string,
  age: 30 as number,
  email: 'john@example.com' as string,
  active: true as boolean,
});

// Direct value updates (callable syntax → .set())
basicTree.$.name('Jane Doe');
basicTree.$.age(25);
basicTree.$.email('jane@example.com');
basicTree.$.active(false);

// Functional updates (callable syntax → .update())
basicTree.$.name((current) => current.toUpperCase());
basicTree.$.age((current) => current + 5);

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
nestedTree.$.user.profile.firstName('Jane');
nestedTree.$.user.profile.lastName('Smith');
nestedTree.$.user.profile.settings.theme('light');
nestedTree.$.user.preferences.language('es');

// Functional updates on nested objects
nestedTree.$.user.profile((current) => ({
  ...current,
  firstName: current.firstName + ' (Updated)',
  lastName: current.lastName + ' (Updated)',
}));

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
arrayTree.$.todos((current) => [
  ...current,
  { id: 3, text: 'Deploy to production', done: false },
]);

// Mark todo as done
arrayTree.$.todos((current) =>
  current.map((todo) => (todo.id === 1 ? { ...todo, done: true } : todo))
);

// Add new tag
arrayTree.$.tags((current) => [...current, 'signaltree']);

// Update scores
arrayTree.$.scores((current) => current.map((score) => score + 3));

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
stateTree.$.ui.loading(true);
stateTree.$.ui.error(null);

// Simulate data loading
setTimeout(() => {
  stateTree.$.ui((current) => ({
    ...current,
    loading: false,
    data: { results: ['item1', 'item2', 'item3'] },
  }));
}, 100);

// Update filters based on conditions
stateTree.$.filters((current) => ({
  ...current,
  search: current.search.trim(),
  category: current.category === 'all' ? 'featured' : current.category,
}));

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
optionalTree.$.user.avatar('https://example.com/avatar.jpg');
optionalTree.$.user.lastLogin(new Date());

// Conditional updates
optionalTree.$.user((current) => ({
  ...current,
  avatar: current.avatar || 'default-avatar.jpg',
  lastLogin: current.lastLogin || new Date(),
}));

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
performanceTree.$.metrics.pageViews((current) => current + 1);
performanceTree.$.metrics.uniqueVisitors((current) => current + 1);
performanceTree.$.metrics.bounceRate((current) => Math.max(0, current - 0.01));

// Batch analytics updates
performanceTree.$.analytics((current) => ({
  ...current,
  events: [
    ...current.events,
    { type: 'page_view', timestamp: new Date() },
    { type: 'user_action', timestamp: new Date() },
  ],
  sessions: current.sessions + 1,
}));

/**
 * 📚 STANDARD SYNTAX EXAMPLES
 *
 * This file demonstrates the same examples as callable-examples.ts
 * but using the standard .set() and .update() methods that work without
 * any build-time transforms.
 *
 * • Direct updates: tree.$.prop.set('value')
 * • Functional updates: tree.$.prop.update(fn)
 * • Getters: tree.$.prop()
 *
 * ✅ No transforms required - works immediately
 * ✅ Zero runtime overhead - pure Angular signals
 */
import { signalTree } from '@signaltree/core';

console.log('📚 STANDARD SYNTAX EXAMPLES\n');

// ==============================================
// Example 1: Basic Operations
// ==============================================

const basicTree = signalTree({
  name: 'John',
  age: 30,
  email: 'john@example.com',
  active: true,
});

console.log('--- Example 1: Basic Operations ---');

// Getters (same in both syntaxes)
console.log('Initial state:', {
  name: basicTree.$.name(),
  age: basicTree.$.age(),
  email: basicTree.$.email(),
  active: basicTree.$.active(),
});

// Direct value updates (standard syntax)
basicTree.$.name.set('Jane Doe');
basicTree.$.age.set(25);
basicTree.$.email.set('jane@example.com');
basicTree.$.active.set(false);

console.log('After direct updates:', {
  name: basicTree.$.name(),
  age: basicTree.$.age(),
  email: basicTree.$.email(),
  active: basicTree.$.active(),
});

// Functional updates (standard syntax)
basicTree.$.name.update((current) => current.toUpperCase());
basicTree.$.age.update((current) => current + 5);

console.log('After functional updates:', {
  name: basicTree.$.name(),
  age: basicTree.$.age(),
});

// ==============================================
// Example 2: Nested Object Operations
// ==============================================

const nestedTree = signalTree({
  user: {
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      settings: {
        theme: 'dark',
        notifications: true,
      },
    },
    preferences: {
      language: 'en',
      timezone: 'UTC',
    },
  },
});

console.log('\n--- Example 2: Nested Object Operations ---');

// Deep nested updates
nestedTree.$.user.profile.firstName.set('Jane');
nestedTree.$.user.profile.lastName.set('Smith');
nestedTree.$.user.profile.settings.theme.set('light');
nestedTree.$.user.preferences.language.set('es');

// Functional updates on individual nested properties
nestedTree.$.user.profile.firstName.update((current) => current + ' (Updated)');
nestedTree.$.user.profile.lastName.update((current) => current + ' (Updated)');

console.log('Updated nested tree:', {
  profile: nestedTree.$.user.profile(),
  preferences: nestedTree.$.user.preferences(),
});

// ==============================================
// Example 3: Array Operations
// ==============================================

const arrayTree = signalTree({
  todos: [
    { id: 1, text: 'Learn SignalTree', done: false },
    { id: 2, text: 'Build awesome app', done: false },
  ],
  tags: ['typescript', 'angular'],
  scores: [95, 87, 92],
});

console.log('\n--- Example 3: Array Operations ---');

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

console.log('Updated arrays:', {
  todos: arrayTree.$.todos(),
  tags: arrayTree.$.tags(),
  scores: arrayTree.$.scores(),
});

// ==============================================
// Example 4: Conditional and Complex Updates
// ==============================================

const stateTree = signalTree({
  ui: {
    loading: false,
    error: null as string | null,
    data: null as { results: string[] } | null,
  },
  filters: {
    search: '',
    category: 'all',
    sortBy: 'name',
  },
});

console.log('\n--- Example 4: Conditional and Complex Updates ---');

// Simulate loading state
stateTree.$.ui.loading.set(true);
stateTree.$.ui.error.set(null);

// Simulate data loading
setTimeout(() => {
  stateTree.$.ui.loading.set(false);
  stateTree.$.ui.data.set({ results: ['item1', 'item2', 'item3'] });
}, 100);

// Update filters based on conditions
stateTree.$.filters.search.update((current) => current.trim());
stateTree.$.filters.category.update((current) =>
  current === 'all' ? 'featured' : current
);

console.log('State management example:', {
  ui: stateTree.$.ui(),
  filters: stateTree.$.filters(),
});

// ==============================================
// Example 5: Working with Optional Values
// ==============================================

const optionalTree = signalTree({
  user: {
    name: 'John',
    email: 'john@example.com',
    avatar: null as string | null,
    lastLogin: null as Date | null,
  },
  settings: {
    notifications: true,
    theme: 'auto' as 'light' | 'dark' | 'auto',
  },
});

console.log('\n--- Example 5: Working with Optional Values ---');

// Handle optional values
optionalTree.$.user.avatar.set('https://example.com/avatar.jpg');
optionalTree.$.user.lastLogin.set(new Date());

// Conditional updates
optionalTree.$.user.avatar.update((current) => current || 'default-avatar.jpg');
optionalTree.$.user.lastLogin.update((current) => current || new Date());

console.log('Optional values example:', {
  user: optionalTree.$.user(),
});

// ==============================================
// Example 6: Performance and Batching
// ==============================================

const performanceTree = signalTree({
  metrics: {
    pageViews: 0,
    uniqueVisitors: 0,
    bounceRate: 0.0,
  },
  analytics: {
    events: [] as Array<{ type: string; timestamp: Date }>,
    sessions: 0,
  },
});

console.log('\n--- Example 6: Performance and Batching ---');

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

console.log('Performance metrics:', {
  metrics: performanceTree.$.metrics(),
  analytics: performanceTree.$.analytics(),
});

// ==============================================
// Standard Syntax Summary
// ==============================================

console.log('\n📚 STANDARD SYNTAX RULES');
console.log('=========================');
console.log('✅ tree.$.prop.set("value")    → Direct value assignment');
console.log('✅ tree.$.prop.update(fn)      → Functional update');
console.log('✅ tree.$.prop()               → Getter (read value)');
console.log('✅ Works at any nesting level');
console.log('✅ No transforms required');
console.log('✅ Zero runtime overhead');
console.log('✅ Full TypeScript support');

console.log('\n📚 END STANDARD SYNTAX EXAMPLES');

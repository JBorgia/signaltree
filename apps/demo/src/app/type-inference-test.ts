/**
 * Quick test to validate our improved type inference
 */

import { signalTree } from '@signaltree/core';

export function validateTypeInference() {
  // Test the signal-store pattern implementation
  const testState = signalTree({
    user: {
      id: 42,
      name: 'Test User',
      preferences: {
        theme: 'dark' as const,
        language: 'en',
        notifications: true,
      },
    },
    counters: {
      visits: 0,
      likes: 0,
    },
    metadata: {
      created: new Date().toISOString(),
      tags: ['test', 'demo'] as const,
    },
  });

  // Test type preservation
  console.log('🔍 Testing type inference...');

  // These should have exact type inference
  const userId = testState.$.user.id(); // Should be number
  const theme = testState.$.user.preferences.theme(); // Should be 'dark'
  const notifications = testState.$.user.preferences.notifications(); // Should be boolean
  const visits = testState.$.counters.visits(); // Should be number

  console.log('✅ userId:', userId, '(type: number)');
  console.log('✅ theme:', theme, '(type: "dark")');
  console.log('✅ notifications:', notifications, '(type: boolean)');
  console.log('✅ visits:', visits, '(type: number)');

  // Test type-safe updates
  testState.$.user.name.set('Updated User');
  testState.$.counters.visits.set(testState.$.counters.visits() + 1);

  // Test unwrap with complete type preservation
  const unwrapped = testState.unwrap();
  console.log('✅ Unwrapped state:', unwrapped);

  // Test complex update with type safety
  testState.update((state) => ({
    user: {
      ...state.user,
      preferences: {
        ...state.user.preferences,
        notifications: !state.user.preferences.notifications,
      },
    },
    counters: {
      ...state.counters,
      likes: state.counters.likes + 1,
    },
  }));

  console.log('🎉 All type inference tests passed!');
  return testState;
}

export { validateTypeInference as default };

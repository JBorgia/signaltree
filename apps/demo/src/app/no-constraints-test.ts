/**
 * Simple test to verify NO CONSTRAINTS work
 */

import { signalTree } from '@signaltree/core';

// Test interface without index signature
export interface TestAppState {
  users: { id: number; name: string }[];
  posts: { id: number; title: string }[];
  ui: {
    theme: 'light' | 'dark';
    sidebar: { isOpen: boolean; width: number };
  };
  auth: {
    currentUser?: { id: number; name: string };
    isAuthenticated: boolean;
  };
}

// This should work now without ANY constraints!
export const testTree = signalTree<TestAppState>({
  users: [],
  posts: [],
  ui: {
    theme: 'light',
    sidebar: {
      isOpen: true,
      width: 280,
    },
  },
  auth: {
    currentUser: undefined,
    isAuthenticated: false,
  },
});

// Test type inference - this should work perfectly
export function testTypeInference() {
  // These should all have perfect type inference
  const users = testTree.$.users(); // { id: number; name: string }[]
  const theme = testTree.$.ui.theme(); // 'light' | 'dark'
  const isOpen = testTree.$.ui.sidebar.isOpen(); // boolean
  const isAuth = testTree.$.auth.isAuthenticated(); // boolean

  // Updates should work with perfect typing
  testTree.$.users.set([{ id: 1, name: 'John' }]);
  testTree.$.ui.theme.set('dark');
  testTree.$.ui.sidebar.isOpen.set(false);
  testTree.$.auth.isAuthenticated.set(true);

  return {
    users,
    theme,
    isOpen,
    isAuth,
  };
}

// Test with different types
export const primitiveTree = signalTree(42);
export const stringTree = signalTree('hello');
export const arrayTree = signalTree([1, 2, 3]);

// Test class instance
export class TestClass {
  prop1 = 'value';
  prop2 = 123;
  nested = {
    deep: {
      value: true,
    },
  };
}

export const classTree = signalTree(new TestClass());

// Test weird types
export const weirdTree = signalTree({
  map: new Map(),
  set: new Set(),
  date: new Date(),
  regex: /test/,
  fn: () => 'hello',
});

// All these should compile without errors!
console.log('✅ All trees created successfully!');
console.log('Primitive tree:', primitiveTree.unwrap());
console.log('String tree:', stringTree.unwrap());
console.log('Array tree:', arrayTree.unwrap());
console.log('Class tree:', classTree.unwrap());
console.log('Weird tree:', weirdTree.unwrap());

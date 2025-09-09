/**
 * TypeScript augmentation for callable syntax support
 * This file provides IDE support for the callable syntax before transformation
 */

declare module '@signaltree/core' {
  // Augment the AccessibleTreeNode to support callable syntax
  interface AccessibleTreeNode<T> {
    // Make the node callable with value (transforms to .set())
    (value: T): void;
    // Make the node callable with updater function (transforms to .update())
    (updater: (current: T) => T): void;
  }
}

export {}; // Ensure this is treated as a module

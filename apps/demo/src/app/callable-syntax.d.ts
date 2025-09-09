/**
 * Type augmentation for @signaltree/callable-syntax
 * This enables TypeScript to understand the callable syntax during development
 */

declare module '@signaltree/core' {
  interface AccessibleTreeNode<T> {
    // Enable callable syntax for setting values
    (value: T): void;
    // Enable callable syntax for functional updates
    (updater: (current: T) => T): void;
  }
}

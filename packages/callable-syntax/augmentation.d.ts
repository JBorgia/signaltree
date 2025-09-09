import '@angular/core';
import '@angular/core';

// Root-level augmentation to ensure editors/tsserver load callable overloads.
// Provides callable set/update forms for Angular WritableSignal to enable
// signal(value) and signal(fn) ergonomics before transform.
declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: T extends (...args: unknown[]) => unknown ? never : T): void;
    (updater: (current: T) => T): void;
  }
}

export {};
// Global callable syntax augmentation entrypoint.
// Included via tsconfig "types" so no manual import required.
// NodeAccessor callable overloads live directly in @signaltree/core now.
// Here we augment Angular's WritableSignal so leaf signals also accept
// the same ergonomic callable set/update forms for consistent DX.

declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: T extends (...args: unknown[]) => unknown ? never : T): void;
    (updater: (current: T) => T): void;
  }
}

export {};

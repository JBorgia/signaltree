import '@angular/core';

// Optional augmentation: allow callable leaf syntax in editors when transform is installed.
declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: T): void;
    (updater: (current: T) => T): void;
  }
}

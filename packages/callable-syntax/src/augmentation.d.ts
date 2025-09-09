import '@angular/core';

// Augment Angular WritableSignal so leaves support callable set/update like NodeAccessor.
// Getter signature already exists on WritableSignal.
declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: T extends (...args: unknown[]) => unknown ? never : T): void;
    (updater: (current: T) => T): void;
  }
}

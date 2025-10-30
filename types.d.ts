declare global {
  class WeakRef<T extends object = object> {
    constructor(target: T);
    deref(): T | undefined;
  }

  class FinalizationRegistry<T = unknown> {
    constructor(cleanupCallback: (heldValue: T) => void);
    register(target: object, heldValue: T, unregisterToken?: object): void;
    unregister(unregisterToken: object): void;
  }
}

export {};

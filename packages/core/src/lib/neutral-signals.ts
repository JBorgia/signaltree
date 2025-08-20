/**
 * Neutral signal type interfaces decoupled from @angular/core specifics.
 * These allow internal typing to reference a minimal structural contract
 * so downstream alternative engines don't need Angular's concrete types.
 */
export interface BaseSignalReadable<T = unknown> {
  (): T;
}

export interface BaseSignalWritable<T = unknown> extends BaseSignalReadable<T> {
  set(value: T): void;
  update(updater: (current: T) => T): void;
}

export type AnyReadableSignal<T = unknown> = BaseSignalReadable<T> | { (): T };
export type AnyWritableSignal<T = unknown> = BaseSignalWritable<T>;

// Utility conditional helpers used to narrow in typings without importing Angular types
export type IsReadableSignal<T> = T extends BaseSignalReadable<unknown>
  ? true
  : false;
export type IsWritableSignal<T> = T extends BaseSignalWritable<unknown>
  ? true
  : false;

/** Narrowing guard (runtime-lightweight) */
export function isBaseSignalReadable<T = unknown>(
  v: unknown
): v is BaseSignalReadable<T> {
  return typeof v === 'function';
}

import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Build a synchronous StandardSchema for tests. `check` returns null on
 * success or an error message string on failure.
 */
export function syncSchema<T = unknown>(
  check: (v: unknown) => string | null
): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test-sync',
      validate: (v: unknown): StandardSchemaV1.Result<T> => {
        const err = check(v);
        if (err) return { issues: [{ message: err }] };
        return { value: v as T };
      },
    },
  };
}

/**
 * Build an async StandardSchema for tests. `check` returns a promise of null
 * (success) or an error message string. Optional `delayMs` adds artificial
 * latency.
 */
export function asyncSchema<T = unknown>(
  check: (v: unknown) => Promise<string | null> | string | null,
  delayMs = 0
): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test-async',
      validate: async (v: unknown): Promise<StandardSchemaV1.Result<T>> => {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        const err = await check(v);
        if (err) return { issues: [{ message: err }] };
        return { value: v as T };
      },
    },
  };
}

/**
 * Build a controllable async schema where each call returns a deferred
 * promise the test can resolve manually. Useful for write-sequence guard
 * tests.
 */
export function controllableSchema<T = unknown>(): {
  schema: StandardSchemaV1<T, T>;
  /** Resolve the most recent in-flight validate call with `msg` (null = valid). */
  resolveLatest(msg: string | null): void;
  /** Resolve all pending validate calls in FIFO order with msg. */
  resolveAll(msg: string | null): void;
  /** Number of validate() calls pending resolution. */
  pendingCount(): number;
} {
  const pending: Array<(r: StandardSchemaV1.Result<T>) => void> = [];

  const schema: StandardSchemaV1<T, T> = {
    '~standard': {
      version: 1,
      vendor: 'test-controllable',
      validate: (v: unknown): Promise<StandardSchemaV1.Result<T>> => {
        void v;
        return new Promise<StandardSchemaV1.Result<T>>((resolve) => {
          pending.push(resolve);
        });
      },
    },
  };

  function resolveOneWith(msg: string | null, resolver: (r: StandardSchemaV1.Result<T>) => void): void {
    if (msg === null) {
      resolver({ value: undefined as unknown as T });
    } else {
      resolver({ issues: [{ message: msg }] });
    }
  }

  return {
    schema,
    resolveLatest(msg) {
      const r = pending.pop();
      if (r) resolveOneWith(msg, r);
    },
    resolveAll(msg) {
      while (pending.length > 0) {
        const r = pending.shift();
        if (r) resolveOneWith(msg, r);
      }
    },
    pendingCount: () => pending.length,
  };
}

/**
 * A schema that throws synchronously on validate. For runtime-error tests.
 */
export function throwingSchema(message = 'boom'): StandardSchemaV1<unknown, unknown> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test-throwing',
      validate: () => {
        throw new Error(message);
      },
    },
  };
}

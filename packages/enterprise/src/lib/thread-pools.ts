export interface WorkerPool {
  run<T, A extends unknown[]>(fn: (...args: A) => T, ...args: A): Promise<T>;
}

export function createMockPool(): WorkerPool {
  return {
    async run<T, A extends unknown[]>(fn: (...args: A) => T, ...args: A) {
      return fn(...args);
    },
  };
}

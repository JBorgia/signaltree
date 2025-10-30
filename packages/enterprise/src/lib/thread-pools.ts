export interface WorkerPool {
  run<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
}

export function createMockPool(): WorkerPool {
  return {
    async run(fn, ...args) {
      return fn(...args);
    }
  };
}

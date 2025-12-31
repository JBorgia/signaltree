/**
 * Archived initialization helpers for dedicated profiling/harness use.
 *
 * These functions were moved out of the per-library benchmark services to
 * keep the demo orchestrator lean. They are retained here so nightly
 * or ad-hoc profiling jobs can import them without relying on the demo UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runAkitaInitialization(): Promise<{
  durationMs: number;
  memoryDeltaMB: number | 'N/A';
}> {
  const { runTimed } = await import('./benchmark-runner');
  const stateFactory = () => ({
    deepNested: {},
    largeArray: [],
    computedValues: { base: 0, factors: [] },
    batchData: {},
  });
  const result = await runTimed(
    async () => {
      // Simulate Akita store initialization
      const { Store } = await import('@datorama/akita');
      class InitStore extends (Store as any) {
        constructor() {
          super(stateFactory());
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const store = new InitStore();
    },
    { operations: 1, trackMemory: true, label: 'akita-init' }
  );
  return {
    durationMs: result.durationMs,
    memoryDeltaMB:
      typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
  };
}

export async function runElfInitialization(): Promise<{
  durationMs: number;
  memoryDeltaMB: number | 'N/A';
}> {
  const { runTimed } = await import('./benchmark-runner');
  const result = await runTimed(
    async () => {
      // Simulate Elf store initialization
      const { createStore } = await import('@ngneat/elf');
      const { withEntities } = await import('@ngneat/elf-entities');
      createStore({ name: 'elf-init' }, withEntities<any>());
    },
    { operations: 1, trackMemory: true, label: 'elf-init' }
  );
  return {
    durationMs: result.durationMs,
    memoryDeltaMB:
      typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
  };
}

export async function runNgRxSignalsInitialization(): Promise<{
  durationMs: number;
  memoryDeltaMB: number | 'N/A';
}> {
  const { runTimed } = await import('./benchmark-runner');
  const stateFactory = () => ({
    deepNested: {},
    largeArray: [],
    computedValues: { base: 0, factors: [] },
    batchData: {},
  });
  const result = await runTimed(
    async () => {
      // Simulate NgRx Signals store initialization
      const { signalState } = await import('@ngrx/signals');
      signalState(stateFactory());
    },
    { operations: 1, trackMemory: true, label: 'ngrx-signals-init' }
  );
  return {
    durationMs: result.durationMs,
    memoryDeltaMB:
      typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
  };
}

export async function runNgRxInitialization(): Promise<{
  durationMs: number;
  memoryDeltaMB: number | 'N/A';
}> {
  const { runTimed } = await import('./benchmark-runner');
  const stateFactory = () => ({ groups: [], posts: [], users: [] });
  const result = await runTimed(
    async () => {
      // Simulate NgRx store initialization (createReducer used as a proxy)
      const { createReducer } = await import('@ngrx/store');
      createReducer(stateFactory());
    },
    { operations: 1, trackMemory: true, label: 'ngrx-init' }
  );
  return {
    durationMs: result.durationMs,
    memoryDeltaMB:
      typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
  };
}

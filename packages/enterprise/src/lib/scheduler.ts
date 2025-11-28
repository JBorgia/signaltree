export type Task = () => void;

interface SchedulerConfig {
  yieldEveryTasks?: number; // yield after N tasks
  yieldEveryMs?: number; // yield after elapsed ms
  instrumentation?: boolean;
}

interface SchedulerMetrics {
  drainCycles: number;
  tasksExecuted: number;
  maxQueueLength: number;
  yields: number;
  lastDrainDurationMs: number;
  totalDrainDurationMs: number;
}

const defaultConfig: Required<SchedulerConfig> = {
  yieldEveryTasks: 500,
  yieldEveryMs: 8,
  instrumentation: false,
};

let config: Required<SchedulerConfig> = { ...defaultConfig };
let metrics: SchedulerMetrics = {
  drainCycles: 0,
  tasksExecuted: 0,
  maxQueueLength: 0,
  yields: 0,
  lastDrainDurationMs: 0,
  totalDrainDurationMs: 0,
};

const q: Task[] = [];
let draining = false;

export function configureScheduler(newConfig: SchedulerConfig) {
  config = { ...config, ...newConfig };
}

export function getSchedulerMetrics(reset = false): SchedulerMetrics {
  const snapshot = { ...metrics };
  if (reset) {
    metrics = {
      drainCycles: 0,
      tasksExecuted: 0,
      maxQueueLength: 0,
      yields: 0,
      lastDrainDurationMs: 0,
      totalDrainDurationMs: 0,
    };
  }
  return snapshot;
}

export function postTask(t: Task) {
  q.push(t);
  if (config.instrumentation && q.length > metrics.maxQueueLength) {
    metrics.maxQueueLength = q.length;
  }
  if (!draining) {
    draining = true;
    // Use microtask kickoff
    Promise.resolve().then(drain);
  }
}

async function drain() {
  const start = config.instrumentation ? performance.now() : 0;
  if (config.instrumentation) metrics.drainCycles++;
  let tasksSinceYield = 0;
  while (q.length) {
    const t = q.shift()!;
    try {
      t();
    } catch (e) {
      console.error('[EnterpriseScheduler]', e);
    }
    tasksSinceYield++;
    if (config.instrumentation) metrics.tasksExecuted++;
    if (
      tasksSinceYield >= config.yieldEveryTasks ||
      (config.instrumentation &&
        performance.now() - start >= config.yieldEveryMs)
    ) {
      if (config.instrumentation) metrics.yields++;
      tasksSinceYield = 0;
      // Yield to event loop
      await Promise.resolve();
    }
  }
  if (config.instrumentation) {
    const duration = performance.now() - start;
    metrics.lastDrainDurationMs = duration;
    metrics.totalDrainDurationMs += duration;
  }
  draining = false;
}

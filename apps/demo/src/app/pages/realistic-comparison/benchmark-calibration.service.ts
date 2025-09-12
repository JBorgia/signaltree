import { Injectable, signal } from '@angular/core';

export type ScenarioKey =
  | 'deepNested'
  | 'arrayUpdates'
  | 'selectorPerf'
  | 'computedPerf';

export interface ScenarioPlan {
  iterations: number;
  innerOps: number; // operations inside each sample iteration
}

export interface CalibrationPlan {
  targetMsPerSample: number;
  opsPerMs: number; // calibration units per ms
  scenarios: Record<ScenarioKey, ScenarioPlan>;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class BenchmarkCalibrationService {
  // Defaults chosen to keep UI responsive while avoiding 0ms samples
  private readonly defaultPlans: Record<ScenarioKey, ScenarioPlan> = {
    deepNested: { iterations: 100, innerOps: 25 },
    arrayUpdates: { iterations: 100, innerOps: 10 },
    selectorPerf: { iterations: 100, innerOps: 10 },
    computedPerf: { iterations: 100, innerOps: 1 },
  };

  readonly plan = signal<CalibrationPlan | null>(null);
  readonly isCalibrating = signal(false);

  getPlan(scenario: ScenarioKey): ScenarioPlan {
    const p = this.plan();
    return p ? p.scenarios[scenario] : this.defaultPlans[scenario];
  }

  async calibrate(targetMsPerSample = 120): Promise<CalibrationPlan> {
    if (this.isCalibrating())
      return this.plan() ?? this.createPlanFromOps(1, targetMsPerSample);
    this.isCalibrating.set(true);
    try {
      // Warm up JIT a bit
      for (let i = 0; i < 5; i++) this.calibrationUnit(2000);

      // Measure how many units we can do in ~50-150ms window
      let units = 2000;
      let duration = 0;
      for (let tries = 0; tries < 6; tries++) {
        const start = performance.now();
        this.calibrationUnit(units);
        duration = performance.now() - start;
        if (duration === 0) duration = 0.01;
        // Aim roughly for targetMsPerSample; adjust units proportionally
        const scale = targetMsPerSample / duration;
        units = Math.max(500, Math.floor(units * scale));
        if (Math.abs(duration - targetMsPerSample) < 10) break;
      }

      const opsPerMs = units / Math.max(duration, 0.01);
      const plan = this.createPlanFromOps(opsPerMs, targetMsPerSample);
      this.plan.set(plan);
      return plan;
    } finally {
      this.isCalibrating.set(false);
    }
  }

  private createPlanFromOps(
    opsPerMs: number,
    targetMsPerSample: number
  ): CalibrationPlan {
    // Map calibration ops to scenario innerOps via simple scaling against defaults
    const scale = (desiredMs: number, baseInnerOps: number) => {
      // We assume each inner op costs about (targetMsPerSample / opsPerMs) / 100 in ms.
      // This is a rough heuristic to avoid 0ms while keeping UI snappy.
      const approxMsPerOp = 1 / Math.max(opsPerMs, 0.001);
      const targetOps = Math.max(
        1,
        Math.round((desiredMs * 0.8) / approxMsPerOp)
      );
      // Clamp and normalize against base counts so we don't go wild on fast machines.
      const clamped = Math.min(
        Math.max(Math.round(targetOps / 100), 1) * 1,
        baseInnerOps * 8
      );
      return clamped;
    };

    const scenarios: Record<ScenarioKey, ScenarioPlan> = {
      deepNested: {
        iterations: 100,
        innerOps: scale(
          targetMsPerSample,
          this.defaultPlans.deepNested.innerOps
        ),
      },
      arrayUpdates: {
        iterations: 100,
        innerOps: Math.max(
          5,
          Math.min(
            50,
            scale(
              targetMsPerSample * 0.7,
              this.defaultPlans.arrayUpdates.innerOps
            )
          )
        ),
      },
      selectorPerf: {
        iterations: 100,
        innerOps: Math.max(
          5,
          Math.min(
            40,
            scale(
              targetMsPerSample * 0.7,
              this.defaultPlans.selectorPerf.innerOps
            )
          )
        ),
      },
      computedPerf: {
        iterations: 100,
        innerOps: Math.max(
          1,
          Math.min(
            20,
            scale(
              targetMsPerSample * 0.4,
              this.defaultPlans.computedPerf.innerOps
            )
          )
        ),
      },
    };

    return {
      targetMsPerSample,
      opsPerMs,
      scenarios,
      timestamp: new Date().toISOString(),
    };
  }

  private calibrationUnit(units: number) {
    // CPU-heavy but side-effect-free numeric work to estimate throughput.
    let acc = 0;
    for (let i = 0; i < units; i++) {
      const x = Math.sin(i) * Math.cos(i * 0.5) + Math.tan(i % 10);
      acc += x * 0.000001;
      if ((i & 1023) === 0 && acc > 1e12) acc = 0; // keep it bounded; avoid DCE
    }
    return acc;
  }
}

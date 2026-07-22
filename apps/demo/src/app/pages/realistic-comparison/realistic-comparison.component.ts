
import { Component, ChangeDetectionStrategy } from '@angular/core';

import { BenchmarkOrchestratorComponent } from './benchmark-orchestrator/benchmark-orchestrator.component';

@Component({
  selector: 'app-realistic-comparison',
  standalone: true,
  imports: [BenchmarkOrchestratorComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: ` <app-benchmark-orchestrator /> `,
})
export class RealisticComparisonComponent {}

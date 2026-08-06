
import { Component, ChangeDetectionStrategy } from '@angular/core';

import { BenchmarkOrchestratorComponent } from './benchmark-orchestrator/benchmark-orchestrator.component';

@Component({
  selector: 'app-realistic-comparison',
  standalone: true,
  imports: [BenchmarkOrchestratorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <app-benchmark-orchestrator /> `,
})
export class RealisticComparisonComponent {}

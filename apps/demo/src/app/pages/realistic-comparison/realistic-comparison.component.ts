import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { BenchmarkOrchestratorComponent } from './benchmark-orchestrator/benchmark-orchestrator.component';

@Component({
  selector: 'app-realistic-comparison',
  standalone: true,
  imports: [CommonModule, BenchmarkOrchestratorComponent],
  template: ` <app-benchmark-orchestrator /> `,
})
export class RealisticComparisonComponent {}

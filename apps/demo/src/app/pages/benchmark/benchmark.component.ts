
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * AI-codegen accuracy benchmark — public scorecard page.
 *
 * Surfaces the reproducible 720-cell measurement showing SignalTree's
 * +49 percentage-point lift when llms.txt is in agent context (v10.3.3 re-run,
 * after ~98 doc-accuracy fixes across the AI-discoverability surface).
 */
@Component({
  selector: 'app-benchmark',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './benchmark.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './benchmark.component.scss',
})
export class BenchmarkComponent {
  readonly perLibraryScores = [
    { lib: 'signaltree', cold: 54, primed: 95, fullPrimed: 98, delta: 44, isOurs: true },
    { lib: 'ngrx-signals', cold: 87, primed: 75, fullPrimed: 76, delta: -11, isOurs: false },
    { lib: 'ngrx-store', cold: 93, primed: 89, fullPrimed: 95, delta: 2, isOurs: false },
    { lib: 'akita', cold: 94, primed: 92, fullPrimed: 91, delta: -2, isOurs: false },
    { lib: 'elf', cold: 99, primed: 92, fullPrimed: 94, delta: -5, isOurs: false },
  ];

  readonly perAgentScores = [
    { agent: 'Claude Sonnet 4.6', cold: 44, primed: 100, fullPrimed: 100, delta: 56, tier: 'frontier' },
    { agent: 'GPT-5.4', cold: 56, primed: 100, fullPrimed: 100, delta: 44, tier: 'frontier' },
    { agent: 'Gemini 3.1 Pro', cold: 46, primed: 78, fullPrimed: 91, delta: 32, tier: 'frontier' },
    { agent: 'Perplexity Sonar Pro', cold: 59, primed: 100, fullPrimed: 100, delta: 41, tier: 'frontier' },
    { agent: 'Claude Haiku 4.5', cold: 63, primed: 97, fullPrimed: 97, delta: 34, tier: 'cost' },
    { agent: 'GPT-5.4-mini', cold: 53, primed: 93, fullPrimed: 100, delta: 40, tier: 'cost' },
  ];

  readonly residualFailures = [
    {
      pattern: 'loginForm (form).data()',
      count: 2,
      fix: 'Hallucination → promoted to a real API in v10.4: .data() now ships as a permanent read alias on the form marker.',
    },
  ];
}

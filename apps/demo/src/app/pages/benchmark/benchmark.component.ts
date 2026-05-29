import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * AI-codegen accuracy benchmark — public scorecard page.
 *
 * Surfaces the reproducible 720-cell measurement showing SignalTree's
 * +42 percentage-point lift when llms.txt is in agent context.
 */
@Component({
  selector: 'app-benchmark',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './benchmark.component.html',
  styleUrl: './benchmark.component.scss',
})
export class BenchmarkComponent {
  readonly perLibraryScores = [
    { lib: 'signaltree', cold: 49, primed: 91, fullPrimed: 87, delta: 42, isOurs: true },
    { lib: 'ngrx-signals', cold: 86, primed: 80, fullPrimed: 82, delta: -4, isOurs: false },
    { lib: 'ngrx-store', cold: 91, primed: 88, fullPrimed: 88, delta: -3, isOurs: false },
    { lib: 'akita', cold: 94, primed: 85, fullPrimed: 85, delta: -9, isOurs: false },
    { lib: 'elf', cold: 94, primed: 87, fullPrimed: 87, delta: -7, isOurs: false },
  ];

  readonly perAgentScores = [
    { agent: 'Claude Sonnet 4.6', cold: 41, primed: 99, fullPrimed: 99, delta: 58, tier: 'frontier' },
    { agent: 'GPT-5.4', cold: 56, primed: 94, fullPrimed: 95, delta: 39, tier: 'frontier' },
    { agent: 'Gemini 3.1 Pro', cold: 42, primed: 83, fullPrimed: 64, delta: 41, tier: 'frontier' },
    { agent: 'Perplexity Sonar Pro', cold: 52, primed: 80, fullPrimed: 80, delta: 28, tier: 'frontier' },
    { agent: 'Claude Haiku 4.5', cold: 55, primed: 97, fullPrimed: 93, delta: 42, tier: 'cost' },
    { agent: 'GPT-5.4-mini', cold: 50, primed: 96, fullPrimed: 94, delta: 46, tier: 'cost' },
  ];

  readonly residualFailures = [
    { pattern: 'items (entityMap).subtotal()', count: 2, fix: '.derived($ => ({ subtotal: ... })) — derived state, not entityMap method' },
    { pattern: 'loginForm (form).data()', count: 4, fix: 'formMarker() — call the marker itself for value' },
    { pattern: 'users (asyncSource).addOne()', count: 1, fix: 'entityMap is for mutation; asyncSource is read-only-after-load' },
    { pattern: 'loginForm (form).isDirty()', count: 1, fix: '.dirty (bare property, no is prefix)' },
  ];
}

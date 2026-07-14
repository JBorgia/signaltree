import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

import type { EmissionEntry } from './example.types';

/**
 * Live log of signal emissions / reactions — the single replacement for the
 * ad-hoc `.log-entry` + `logs: string[]` list reimplemented in ~6 demos.
 * Feed it with {@link trackEmissions} or any `EmissionEntry[]` signal.
 */
@Component({
  selector: 'st-emission-log',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length) {
      <ul class="emission-log">
        @for (entry of entries(); track entry.seq) {
          <li class="emission-log__row">
            <span class="emission-log__label">{{ entry.label }}</span>
            <span class="emission-log__value">{{ entry.value }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="emission-log emission-log--empty">{{ emptyText() }}</p>
    }
  `,
  styleUrl: './emission-log.component.scss',
})
export class EmissionLogComponent {
  readonly entries = input<EmissionEntry[]>([]);
  readonly emptyText = input<string>('Interact with the demo to see emissions.');
}

import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

/**
 * Live, formatted view of a state snapshot — the single replacement for the
 * `.state-display` / `<pre>{{ obj | json }}</pre>` block hand-rolled across
 * ~14 demos. Bind a `computed()` (or any signal-read object) to `[value]`;
 * it re-renders whenever the underlying signals emit.
 */
@Component({
  selector: 'st-state-inspector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    <div class="state-inspector">
      @if (label()) {
        <p class="state-inspector__label">{{ label() }}</p>
      }
      <pre class="state-inspector__pre">{{ value() | json }}</pre>
    </div>
  `,
  styleUrl: './state-inspector.component.scss',
})
export class StateInspectorComponent {
  readonly value = input<unknown>();
  readonly label = input<string>('');
}

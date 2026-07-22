import { Component, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  type CodeFile,
  ExampleComponent,
} from '../../../../shared/components/example-shell';

@Component({
  selector: 'app-signals-examples',
  standalone: true,
  imports: [FormsModule, ExampleComponent],
  templateUrl: './signals-examples.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './signals-examples.component.scss',
})
export class SignalsExamplesComponent {
  // Example A: Counter
  count = signal(0);
  inc() {
    this.count.update((v) => v + 1);
  }
  dec() {
    this.count.update((v) => v - 1);
  }
  reset() {
    this.count.set(0);
  }

  // Example B: Reactive input → greeting (computed)
  name = signal('');
  greeting = computed(() => `Hello, ${this.name().trim() || 'friend'}!`);

  // ── Source shown in the st-example code panels ────────────────────────────
  readonly counterCode: CodeFile[] = [
    {
      label: 'counter.ts',
      language: 'typescript',
      source: `const count = signal(0);
count.update(v => v + 1);`,
    },
  ];

  readonly greetingCode: CodeFile[] = [
    {
      label: 'greeting.ts',
      language: 'typescript',
      source: `const name = signal('');
const greeting = computed(() => \`Hello, \${name().trim() || 'friend'}!\`);`,
    },
  ];
}

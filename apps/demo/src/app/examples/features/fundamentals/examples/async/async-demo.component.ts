import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

import {
  type CodeFile,
  ExampleComponent,
} from '../../../../shared/components/example-shell';

/**
 * Async Operations — fundamentals tour entry.
 *
 * The canonical async demo lives at /async (asyncSource + asyncQuery markers).
 * This entry exists in the fundamentals tour as a pointer so the tour
 * acknowledges async without duplicating the full interactive demo.
 *
 * Previously this component implemented its own debounced search and load
 * lifecycle using raw `signal()` — pre-SignalTree-marker patterns that
 * taught the wrong shape. Replaced in 9.6.0 audit.
 */
@Component({
  selector: 'app-async-demo',
  standalone: true,
  imports: [RouterModule, ExampleComponent],
  templateUrl: './async-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './async-demo.component.scss',
})
export class AsyncDemoComponent {
  /** The quick-reference snippet shown in the st-example code panel. */
  readonly codeFiles: CodeFile[] = [
    {
      label: 'store.ts',
      language: 'typescript',
      source: `import { signalTree, asyncSource, asyncQuery } from '@signaltree/core';

const store = signalTree({
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),
  }),
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    filter: (q) => q.length > 0,
    query: (q) => this.api.search$(q),
  }),
});

// Uniform reads:
store.$.users();           // User[] | undefined
store.$.users.loading();   // boolean
store.$.users.error();     // unknown | null
store.$.users.refresh();   // reload (cancels in-flight)

store.$.search.input.set('alice');  // drives debounced pipeline
store.$.search();                    // results`,
    },
  ];
}

import { CommonModule } from '@angular/common';
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { asyncQuery, asyncSource, signalTree } from '@signaltree/core';
import { delay, of, throwError } from 'rxjs';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user' | 'guest';
}

const ALL_USERS: User[] = [
  { id: 1, name: 'Alice', role: 'admin' },
  { id: 2, name: 'Bob', role: 'user' },
  { id: 3, name: 'Carol', role: 'user' },
  { id: 4, name: 'Dave', role: 'guest' },
  { id: 5, name: 'Eve', role: 'admin' },
  { id: 6, name: 'Frank', role: 'user' },
];

@Component({
  selector: 'app-async-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, CodeTabsComponent],
  templateUrl: './async-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './async-demo.component.scss',
})
export class AsyncDemoComponent {
  readonly heroImportCode: CodeFile[] = [
    {
      label: 'import.ts',
      language: 'typescript',
      source: `import { asyncSource, asyncQuery } from '@signaltree/core';`,
    },
  ];

  readonly asyncSourceCode: CodeFile[] = [
    {
      label: 'asyncSource.ts',
      language: 'typescript',
      source: `const store = signalTree({
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),  // returns Observable<User[]>
  }),
});

// Read:
store.$.users();           // User[] | undefined
store.$.users.loading();   // boolean
store.$.users.error();     // unknown | null

// Drive lifecycle:
store.$.users.refresh();   // reload (cancels in-flight)
store.$.users.set([...]);  // manual override
store.$.users.reset();     // clear data/error/loading`,
    },
  ];

  readonly asyncQueryCode: CodeFile[] = [
    {
      label: 'asyncQuery.ts',
      language: 'typescript',
      source: `const store = signalTree({
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    filter: (q) => q.length > 0,
    query: (q) => this.api.search$(q),
  }),
});

// Push input — pipeline fires after debounce + dedup:
store.$.search.input.set('alice');

// Or two-way bind in the template:
<input [(ngModel)]="store.$.search.input">

// Read results:
store.$.search();          // results
store.$.search.loading();  // in-flight
store.$.search.error();`,
    },
  ];

  readonly resilienceCode: CodeFile[] = [
    {
      label: 'resilience.ts',
      language: 'typescript',
      source: `lookup: asyncQuery<string, string>({
  initialResult: '',
  debounce: 200,
  filter: (q) => q.length > 0,
  query: (q) => failNext() ? throwError(() => new Error('…')) : of(result),
});

// A failed query no longer kills the stream — new inputs still fire:
store.$.lookup.input.set('next-key');   // runs even after an error

// rerun() bypasses debounce + dedup — re-fires the CURRENT input:
store.$.lookup.rerun();`,
    },
  ];

  /** Toggle: make the next resilient-lookup query fail (demonstrates recovery). */
  readonly failNext = signal(false);
  /** Counts how many times the resilient-lookup query factory actually ran. */
  readonly lookupCalls = signal(0);

  /**
   * Single tree, three async markers, one canonical pattern.
   * - asyncSource: load-and-expose with status surface
   * - asyncQuery: input-driven debounced query
   * - lookup (asyncQuery): error-resilience + rerun() showcase
   *
   * Both markers attach at any depth (here all at depth 1). No manual
   * setLoading/setLoaded wiring, no Ops class needed, no rxMethod boilerplate.
   */
  readonly store = signalTree({
    users: asyncSource<User[]>({
      initial: [],
      load: () => of(ALL_USERS).pipe(delay(800)),
      lazy: true, // demo opt-in: click the button to load
    }),
    search: asyncQuery<string, User[]>({
      initialResult: [],
      debounce: 300,
      filter: (q) => q.length > 0,
      query: (q) =>
        of(
          ALL_USERS.filter((u) =>
            u.name.toLowerCase().includes(q.toLowerCase())
          )
        ).pipe(delay(200)),
    }),
    // Resilience showcase: the query can be toggled to fail, and the result
    // embeds a call counter so rerun() with the SAME input is visibly distinct.
    lookup: asyncQuery<string, string>({
      initialResult: '',
      debounce: 200,
      filter: (q) => q.length > 0,
      query: (q) => {
        this.lookupCalls.update((n) => n + 1);
        if (this.failNext()) {
          return throwError(() => new Error(`lookup failed for "${q}"`));
        }
        return of(`"${q}" → resolved (call #${this.lookupCalls()})`).pipe(
          delay(200)
        );
      },
    }),
  });
}

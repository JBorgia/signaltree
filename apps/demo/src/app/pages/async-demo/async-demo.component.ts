import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { asyncQuery, asyncSource, signalTree } from '@signaltree/core';
import { delay, of } from 'rxjs';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './async-demo.component.html',
  styleUrl: './async-demo.component.scss',
})
export class AsyncDemoComponent {
  /**
   * Single tree, two async markers, one canonical pattern.
   * - asyncSource: load-and-expose with status surface
   * - asyncQuery: input-driven debounced query
   *
   * Both markers attach at any depth (here both at depth 1). No manual
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
  });
}

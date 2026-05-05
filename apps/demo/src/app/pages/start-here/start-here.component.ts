import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

interface NextStepCard {
  audience: string;
  title: string;
  description: string;
  route: string;
  cta: string;
}

@Component({
  selector: 'app-start-here',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './start-here.component.html',
  styleUrl: './start-here.component.scss',
})
export class StartHereComponent {
  readonly mentalModelCode = `// 1. Initialize with a plain JSON shape
const tree = signalTree({
  user: { name: 'Ada', age: 36 },
  count: 0,
});

// 2. Read by calling — fully typed, deeply nested
tree.$.user.name();          // 'Ada'
tree.$.count();              // 0

// 3. Write with .set or .update
tree.$.user.name.set('Bo');
tree.$.count.update((n) => n + 1);`;

  readonly ngrxCounterCode = `// counter.actions.ts
export const increment = createAction('[Counter] Increment');
export const reset = createAction('[Counter] Reset');

// counter.reducer.ts
export const counterReducer = createReducer(
  0,
  on(increment, (state) => state + 1),
  on(reset, () => 0)
);

// counter.selectors.ts
export const selectCount = createFeatureSelector<number>('count');

// counter.component.ts
@Component({ /* ... */ })
export class CounterComponent {
  count$ = this.store.select(selectCount);
  constructor(private store: Store) {}
  inc() { this.store.dispatch(increment()); }
  reset() { this.store.dispatch(reset()); }
}`;

  readonly signalTreeCounterCode = `// counter.tree.ts
export const counterTree = signalTree({ count: 0 });

// counter.component.ts
@Component({ /* ... */ })
export class CounterComponent {
  count = counterTree.$.count;
  inc() { counterTree.$.count.update((n) => n + 1); }
  reset() { counterTree.$.count.set(0); }
}`;

  readonly architectureCode = `// app.tree.ts — one runtime tree, typed slices
export const appTree = signalTree({
  user: { name: '', email: '' },
  ui: { theme: 'light', sidebarOpen: false },
  cart: { items: [] as CartItem[], total: 0 },
})
  .with(devTools())      // Redux DevTools at the root
  .with(timeTravel())    // Undo/redo at the root
  .with(persistence());  // Auto-save at the root

// Use it anywhere — features get typed slices
@Component({ /* ... */ })
export class CartView {
  items = appTree.$.cart.items;
  total = appTree.$.cart.total;
}`;

  readonly nextSteps: NextStepCard[] = [
    {
      audience: "I'm ready to build",
      title: 'Run the fundamentals',
      description:
        'Open a working playground with the core APIs in one page — entityMap, status, stored, callable syntax, and forms.',
      route: '/examples/fundamentals',
      cta: 'Open fundamentals →',
    },
    {
      audience: "I'm migrating from NgRx",
      title: 'Read the migration recipe',
      description:
        'Mechanical mapping: actions → setters, reducers → updates, selectors → computed signals. With a phased rollout playbook.',
      route: '/migrate',
      cta: 'Open migration recipe →',
    },
    {
      audience: 'I want the full reference',
      title: 'Browse package docs',
      description:
        'Core API surface, plus optional packages: ng-forms, realtime, enterprise, callable-syntax. Every type, every signature.',
      route: '/docs',
      cta: 'Open docs →',
    },
    {
      audience: 'I want proof, not promises',
      title: 'Inspect the benchmarks',
      description:
        'Live cross-library benchmarks against @ngrx/signals, Akita, and Elf — runs in your browser with frequency-weighted scenarios.',
      route: '/benchmarks',
      cta: 'Run benchmarks →',
    },
  ];
}

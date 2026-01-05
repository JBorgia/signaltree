import { CommonModule } from '@angular/common';
import { Component, effect, signal } from '@angular/core';

@Component({
  selector: 'app-batching-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './batching-comparison.component.html',
  styleUrls: ['./batching-comparison.component.scss'],
})
export class BatchingComparisonComponent {
  // Controls
  ops = signal(1000);
  batchNotificationDelayMs = signal(0);

  // Results
  batchedTime = signal<number | null>(null);
  unbatchedTime = signal<number | null>(null);
  batchedRenders = signal(0);
  unbatchedRenders = signal(0);

  // Render counters are incremented via effects attached to the trees
  runComparison() {
    this.runUnbatched();
    this.runBatched();
  }

  private runUnbatched() {
    // Create a tree without batching (or with batching disabled)
    const { signalTree } = require('@signaltree/core');
    const tree = signalTree({ counter: 0 });

    // Count renders using effect
    let renders = 0;
    effect(() => {
      // read counter to trigger
      const _ = tree.$.counter();
      renders++;
    });

    const n = this.ops();
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      tree.$.counter.update((c: number) => c + 1);
    }
    const end = performance.now();
    this.unbatchedTime.set(end - start);
    this.unbatchedRenders.set(renders);
  }

  private runBatched() {
    const { signalTree, batching } = require('@signaltree/core');
    const tree = signalTree({ counter: 0 }).with(
      batching({
        enabled: true,
        notificationDelayMs: this.batchNotificationDelayMs(),
      })
    );

    let renders = 0;
    effect(() => {
      const _ = tree.$.counter();
      renders++;
    });

    const n = this.ops();
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      tree.$.counter.update((c: number) => c + 1);
    }
    // Run microtask to allow batched notifications to flow
    // We don't await here — batch notificationDelayMs defaults to microtask.
    Promise.resolve().then(() => {
      const end = performance.now();
      this.batchedTime.set(end - start);
      this.batchedRenders.set(renders);
    });
  }
}

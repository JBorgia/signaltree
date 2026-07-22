import { Component, effect, inject, Injector, signal, ChangeDetectionStrategy } from '@angular/core';
import { batching, signalTree } from '@signaltree/core';

import { ExampleComponent } from '../../../../../shared/components/example-shell';

@Component({
  selector: 'app-batching-comparison',
  standalone: true,
  imports: [ExampleComponent],
  templateUrl: './batching-comparison.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './batching-comparison.component.scss',
})
export class BatchingComparisonComponent {
  // effect() needs an injection context; component methods run outside one,
  // so we capture the injector here and pass it explicitly (avoids NG0203).
  private readonly injector = inject(Injector);

  // Controls
  ops = signal(1000);
  batchNotificationDelayMs = signal(0);
  running = signal(false);

  // Results
  batchedTime = signal<number | null>(null);
  unbatchedTime = signal<number | null>(null);
  batchedWrites = signal(0);
  unbatchedWrites = signal(0);
  batchedRenders = signal(0);
  unbatchedRenders = signal(0);

  async runComparison(): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    try {
      await this.runUnbatched();
      await this.runBatched();
    } finally {
      this.running.set(false);
    }
  }

  /**
   * Creates a tree whose counter tracks how many writes actually reach the
   * underlying signal. The wrap is applied BEFORE any enhancer, so a batched
   * tree's coalesced writes are counted after deduplication.
   */
  private createCountingTree() {
    const tree = signalTree({ counter: 0 });
    let applied = 0;
    const counter = tree.$.counter as unknown as { set(v: number): void };
    const rawSet = counter.set.bind(counter);
    counter.set = (v: number) => {
      applied++;
      rawSet(v);
    };
    return { tree, appliedWrites: () => applied };
  }

  private async runUnbatched(): Promise<void> {
    const { tree, appliedWrites } = this.createCountingTree();

    let renders = 0;
    const ref = effect(
      () => {
        void tree.$.counter();
        renders++;
      },
      { injector: this.injector }
    );

    const n = this.ops();
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      tree.$.counter.set(i + 1);
    }
    const elapsed = performance.now() - start;

    await this.settle();
    ref.destroy();

    this.unbatchedTime.set(elapsed);
    this.unbatchedWrites.set(appliedWrites());
    this.unbatchedRenders.set(renders);
  }

  private async runBatched(): Promise<void> {
    const { tree: base, appliedWrites } = this.createCountingTree();
    const tree = base.with(
      batching({
        enabled: true,
        notificationDelayMs: this.batchNotificationDelayMs(),
      })
    );

    let renders = 0;
    const ref = effect(
      () => {
        void tree.$.counter();
        renders++;
      },
      { injector: this.injector }
    );

    const n = this.ops();
    const start = performance.now();
    // coalesce() dedupes same-path writes — only the final value is applied
    // to the underlying signal when the callback completes.
    tree.coalesce(() => {
      for (let i = 0; i < n; i++) {
        tree.$.counter.set(i + 1);
      }
    });
    const elapsed = performance.now() - start;

    await this.settle(this.batchNotificationDelayMs());
    ref.destroy();

    this.batchedTime.set(elapsed);
    this.batchedWrites.set(appliedWrites());
    this.batchedRenders.set(renders);
  }

  /** Wait long enough for effects (and any delayed notification) to flush. */
  private settle(extraMs = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, extraMs + 20));
  }
}

import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signal-tree';

@Component({
  selector: 'app-basic-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './basic-store.component.html',
  styleUrls: ['./basic-store.component.scss'],
})
export class BasicTreeComponent {
  state = {
    name: 'John Doe',
    age: 25,
    email: 'john@example.com',
  };

  // Smart progressive enhancement - no configuration needed!
  tree = signalTree(this.state);

  updateLog: Array<{ timestamp: Date; action: string; data: unknown }> = [];

  constructor() {
    // Track all tree changes
    this.logUpdate(
      'Tree initialized with smart progressive enhancement',
      this.tree.unwrap()
    );
  }

  incrementAge() {
    const newAge = this.tree.$.age() + 1;
    this.tree.$.age.set(newAge);
    this.logUpdate('Age incremented', { age: newAge });
  }

  updateName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.tree.$.name.set(target.value);
    this.logUpdate('Name updated', { name: target.value });
  }

  updateAge(event: Event) {
    const target = event.target as HTMLInputElement;
    const age = parseInt(target.value) || 0;
    this.tree.$.age.set(age);
    this.logUpdate('Age updated', { age });
  }

  updateEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.tree.$.email.set(target.value);
    this.logUpdate('Email updated', { email: target.value });
  }

  resetTree() {
    this.tree.update(() => ({
      name: 'John Doe',
      age: 25,
      email: 'john@example.com',
    }));
    this.logUpdate('Tree reset', this.tree.unwrap());
  }

  // Batch update example - auto-enabling!
  batchUpdateExample() {
    this.tree.batchUpdate(() => {
      this.tree.$.name.set('Jane Smith');
      this.tree.$.age.set(30);
      this.tree.$.email.set('jane@example.com');
    });
    this.logUpdate('Batch update completed', this.tree.unwrap());
  }

  // Memoized getter example
  get fullInfo() {
    return this.tree.memoize(
      'fullInfo',
      () =>
        `${this.tree.$.name()} (${this.tree.$.age()}) - ${this.tree.$.email()}`
    );
  }

  // Clear cache to force re-computation
  clearCache() {
    this.tree.clearCache();
    this.logUpdate('Cache cleared', 'All memoized values will be recomputed');
  }

  // Get tree metrics (shows auto-enabled features)
  getMetrics() {
    const metrics = this.tree.getMetrics();
    this.logUpdate('Tree metrics', metrics);
    return metrics;
  }

  randomizeData() {
    const names = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson'];
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];

    const name = names[Math.floor(Math.random() * names.length)];
    const age = Math.floor(Math.random() * 50) + 18;
    const email =
      name.toLowerCase().replace(' ', '.') +
      '@' +
      domains[Math.floor(Math.random() * domains.length)];

    this.tree.update(() => ({ name, age, email }));
    this.logUpdate('Data randomized', { name, age, email });
  }

  private logUpdate(action: string, data: unknown) {
    this.updateLog.unshift({
      timestamp: new Date(),
      action,
      data,
    });

    // Keep only last 20 entries
    if (this.updateLog.length > 20) {
      this.updateLog = this.updateLog.slice(0, 20);
    }
  }

  clearLog() {
    this.updateLog = [];
  }

  trackByIndex(index: number): number {
    return index;
  }

  codeExample = `import { signalTree } from 'signal-tree';

// Smart progressive enhancement - zero configuration!
const tree = signalTree({
  name: 'John Doe',
  age: 25,
  email: 'john@example.com'
});

// Access signals with $ shorthand
console.log(tree.$.name()); // 'John Doe'
console.log(tree.$.age());  // 25

// Update individual signals
tree.$.name.set('Jane Doe');
tree.$.age.update(age => age + 1);

// Batch updates auto-enable on first use
tree.batchUpdate(() => {
  tree.$.name.set('Alice');
  tree.$.age.set(28);
  tree.$.email.set('alice@example.com');
});

// Memoization auto-enables
const computed = tree.memoize('fullName', () =>
  \`\${tree.$.name()} (\${tree.$.age()})\`
);

// Get metrics to see auto-enabled features
const metrics = tree.getMetrics();
console.log(metrics); // Shows caching, batching status`;
}

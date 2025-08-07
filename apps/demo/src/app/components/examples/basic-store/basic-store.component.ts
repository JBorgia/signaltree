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
  tree = signalTree(this.state);

  updateLog: Array<{ timestamp: Date; action: string; data: unknown }> = [];

  constructor() {
    // Track all tree changes
    this.logUpdate('Tree initialized', this.tree.unwrap());
  }
  incrementAge() {
    const newAge = this.tree.state.age() + 1;
    this.tree.state.age.set(newAge);
    this.logUpdate('Age incremented', { age: newAge });
  }

  updateName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.tree.state.name.set(target.value);
    this.logUpdate('Name updated', { name: target.value });
  }

  updateAge(event: Event) {
    const target = event.target as HTMLInputElement;
    const age = parseInt(target.value) || 0;
    this.tree.state.age.set(age);
    this.logUpdate('Age updated', { age });
  }

  updateEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.tree.state.email.set(target.value);
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

// Create a basic signal tree
const tree = signalTree({
  name: 'John Doe',
  age: 25,
  email: 'john@example.com'
});

// Access individual signals through state
console.log(tree.state.name()); // 'John Doe'
console.log(tree.$.age());      // 25 ($ is shorthand for state)

// Update individual signals
tree.state.name.set('Jane Doe');
tree.state.age.update(age => age + 1);

// Update entire tree
tree.update(current => ({
  ...current,
  age: current.age + 1
}));

// Get plain object
const plainData = tree.unwrap();
console.log(plainData); // { name: 'Jane Doe', age: 26, email: '...' }`;
}

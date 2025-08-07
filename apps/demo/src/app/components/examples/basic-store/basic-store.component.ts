import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signal-tree';

@Component({
  selector: 'app-basic-store',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h1 class="page-title">🎯 Basic Signal Store</h1>

      <div class="main-grid">
        <!-- Interactive Demo -->
        <div class="demo-card">
          <h2 class="card-title">Interactive Demo</h2>

          <div class="form-group">
            <div class="input-group">
              <label for="name" class="input-label"> Name </label>
              <input
                id="name"
                [value]="store.state.name()"
                (input)="updateName($event)"
                class="form-input"
                placeholder="Enter your name"
              />
            </div>

            <div class="input-group">
              <label for="age" class="input-label"> Age </label>
              <input
                id="age"
                type="number"
                [value]="store.state.age()"
                (input)="updateAge($event)"
                class="form-input"
                placeholder="Enter your age"
              />
            </div>

            <div class="input-group">
              <label for="email" class="input-label"> Email </label>
              <input
                id="email"
                type="email"
                [value]="store.state.email()"
                (input)="updateEmail($event)"
                class="form-input"
                placeholder="Enter your email"
              />
            </div>

            <div class="button-group">
              <button (click)="incrementAge()" class="btn btn-primary">
                Increment Age
              </button>

              <button (click)="resetStore()" class="btn btn-secondary">
                Reset
              </button>

              <button (click)="randomizeData()" class="btn btn-success">
                Randomize
              </button>
            </div>
          </div>
        </div>

        <!-- Live State Display -->
        <div class="demo-card">
          <h2 class="card-title">Live State</h2>

          <div class="state-display">
            <div class="state-section">
              <h3 class="state-title">Individual Signals</h3>
              <div class="signal-list">
                <div class="signal-item">
                  <strong>Name:</strong>
                  <code class="signal-value">{{ store.state.name() }}</code>
                </div>
                <div class="signal-item">
                  <strong>Age:</strong>
                  <code class="signal-value">{{ store.state.age() }}</code>
                </div>
                <div class="signal-item">
                  <strong>Email:</strong>
                  <code class="signal-value">{{ store.state.email() }}</code>
                </div>
              </div>
            </div>

            <div class="state-section">
              <h3 class="state-title">Unwrapped Store</h3>
              <pre class="json-display">{{ store.unwrap() | json }}</pre>
            </div>

            <div class="state-section">
              <h3 class="state-title">Store Methods</h3>
              <div class="methods-list">
                <div><strong>Available methods:</strong></div>
                <ul class="method-items">
                  <li>
                    <code>store.state.name()</code> - Get name signal value
                  </li>
                  <li>
                    <code>store.state.name.set(value)</code> - Set name directly
                  </li>
                  <li><code>store.update(fn)</code> - Update entire store</li>
                  <li><code>store.unwrap()</code> - Get plain object</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Code Example -->
      <div class="code-section">
        <h2 class="section-title">💻 Code Example</h2>

        <div class="code-block">
          <pre><code>{{ codeExample }}</code></pre>
        </div>
      </div>

      <!-- Update Log -->
      <div class="log-section">
        <h2 class="section-title">📋 Update Log</h2>

        <div class="log-container">
          <div
            *ngFor="let log of updateLog; trackBy: trackByIndex"
            class="log-entry"
          >
            <div class="log-timestamp">
              {{ log.timestamp | date : 'medium' }}
            </div>
            <div class="log-action">{{ log.action }}</div>
            <div class="log-data">{{ log.data | json }}</div>
          </div>
        </div>

        <button (click)="clearLog()" class="btn btn-danger">Clear Log</button>
      </div>
    </div>
  `,
  styleUrls: ['./basic-store.component.scss'],
})
export class BasicStoreComponent {
  state = {
    name: 'John Doe',
    age: 25,
    email: 'john@example.com',
  };
  store = signalTree(this.state);

  updateLog: Array<{ timestamp: Date; action: string; data: unknown }> = [];

  constructor() {
    // Track all store changes
    this.logUpdate('Store initialized', this.store.unwrap());
  }
  incrementAge() {
    const newAge = this.store.state.age() + 1;
    this.store.state.age.set(newAge);
    this.logUpdate('Age incremented', { age: newAge });
  }

  updateName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.state.name.set(target.value);
    this.logUpdate('Name updated', { name: target.value });
  }

  updateAge(event: Event) {
    const target = event.target as HTMLInputElement;
    const age = parseInt(target.value) || 0;
    this.store.state.age.set(age);
    this.logUpdate('Age updated', { age });
  }

  updateEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.state.email.set(target.value);
    this.logUpdate('Email updated', { email: target.value });
  }

  resetStore() {
    this.store.update(() => ({
      name: 'John Doe',
      age: 25,
      email: 'john@example.com',
    }));
    this.logUpdate('Store reset', this.store.unwrap());
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

    this.store.update(() => ({ name, age, email }));
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

// Create a basic signal store
const store = signalTree({
  name: 'John Doe',
  age: 25,
  email: 'john@example.com'
});

// Access individual signals through state
console.log(store.state.name()); // 'John Doe'
console.log(store.$.age());      // 25 ($ is shorthand for state)

// Update individual signals
store.state.name.set('Jane Doe');
store.state.age.update(age => age + 1);

// Update entire store
store.update(current => ({
  ...current,
  age: current.age + 1
}));

// Get plain object
const plainData = store.unwrap();
console.log(plainData); // { name: 'Jane Doe', age: 26, email: '...' }`;
}

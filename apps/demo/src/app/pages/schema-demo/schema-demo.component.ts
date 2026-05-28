import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

// Demo state — a profile form with sync + async validation
interface ProfileForm {
  [key: string]: unknown;
  name: string;
  email: string;
  age: number;
  username: string;
}

@Component({
  selector: 'app-schema-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schema-demo.component.html',
  styleUrl: './schema-demo.component.scss',
})
export class SchemaDemoComponent {
  // Track which usernames are "taken" to demo async validation
  private readonly takenUsernames = new Set(['admin', 'root', 'system']);

  // Build the tree with the schema enhancer attached
  readonly store = signalTree<ProfileForm>({
    name: '',
    email: '',
    age: 0,
    username: '',
  }).with(
    schemas({
      schemas: {
        name: z.string().min(2, 'Name must be at least 2 characters'),
        email: z.string().email('Must be a valid email address'),
        age: z.number().int('Must be a whole number').min(13, 'Must be 13 or older').max(120, 'Must be a real age'),
        // Async refine — simulated server check
        username: z
          .string()
          .min(3, 'Username must be at least 3 characters')
          .refine(
            async (value: string) => {
              // Simulate a 300ms network round-trip
              await new Promise((r) => setTimeout(r, 300));
              return !this.takenUsernames.has(value.toLowerCase());
            },
            { message: 'Username is already taken' },
          ),
      },
    }),
  );

  // Mirror tree leaves into local writable signals for ngModel binding
  readonly name = signal('');
  readonly email = signal('');
  readonly age = signal(0);
  readonly username = signal('');

  // Live submit state
  readonly submitting = signal(false);
  readonly lastResult = signal<'success' | 'failure' | null>(null);

  // Code shown in the example panel
  readonly codeExample = `import { signalTree } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

const tree = signalTree({
  name: '', email: '', age: 0, username: '',
}).with(
  schemas({
    schemas: {
      name: z.string().min(2),
      email: z.string().email(),
      age: z.number().int().min(13).max(120),
      // Async refine — schema enhancer awaits the verdict.
      username: z.string().min(3).refine(
        async (v) => !(await checkTaken(v)),
        { message: 'Username is already taken' },
      ),
    },
  }),
);

// Read errors per path (memoized signals).
tree.schemas.errorsAt('email')();      // string | null

// Aggregate state (reactive signals).
tree.schemas.isValid();                // O(1) — counter-backed
tree.schemas.pending();                // true if any async run in flight
tree.schemas.errorList();              // readonly string[]

// Imperative validate (returns post-validation isValid).
const ok = await tree.schemas.validate();`;

  // Aggregates from the enhancer
  readonly isValid = computed(() => this.store.schemas.isValid());
  readonly pending = computed(() => this.store.schemas.pending());
  readonly pendingPaths = computed(() => this.store.schemas.pendingPaths());
  readonly errorList = computed(() => this.store.schemas.errorList());

  // Per-path error signals (memoized)
  readonly nameError = this.store.schemas.errorsAt('name');
  readonly emailError = this.store.schemas.errorsAt('email');
  readonly ageError = this.store.schemas.errorsAt('age');
  readonly usernameError = this.store.schemas.errorsAt('username');
  readonly usernamePending = this.store.schemas.isPendingAt('username');

  onNameInput(value: string) {
    this.name.set(value);
    (this.store as unknown as { $: { name: { set: (v: string) => void } } }).$.name.set(value);
  }

  onEmailInput(value: string) {
    this.email.set(value);
    (this.store as unknown as { $: { email: { set: (v: string) => void } } }).$.email.set(value);
  }

  onAgeInput(value: string) {
    const n = Number(value);
    this.age.set(n);
    (this.store as unknown as { $: { age: { set: (v: number) => void } } }).$.age.set(n);
  }

  onUsernameInput(value: string) {
    this.username.set(value);
    (this.store as unknown as { $: { username: { set: (v: string) => void } } }).$.username.set(value);
  }

  async submit() {
    this.submitting.set(true);
    this.lastResult.set(null);
    try {
      const ok = await this.store.schemas.validate();
      this.lastResult.set(ok ? 'success' : 'failure');
    } finally {
      this.submitting.set(false);
    }
  }

  reset() {
    this.name.set('');
    this.email.set('');
    this.age.set(0);
    this.username.set('');
    (this.store as unknown as { $: ProfileForm & { name: { set: (v: string) => void }; email: { set: (v: string) => void }; age: { set: (v: number) => void }; username: { set: (v: string) => void } } }).$.name.set('');
    (this.store as unknown as { $: { email: { set: (v: string) => void } } }).$.email.set('');
    (this.store as unknown as { $: { age: { set: (v: number) => void } } }).$.age.set(0);
    (this.store as unknown as { $: { username: { set: (v: string) => void } } }).$.username.set('');
    this.lastResult.set(null);
  }
}

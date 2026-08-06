import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { signalTree, toWritableSignal } from '@signaltree/core';

import {
  type CodeFile,
  ExampleComponent,
} from '../../../../shared/components/example-shell';

interface UserProfile {
  personal: {
    firstName: string;
    lastName: string;
  };
  contact: {
    email: string;
    phone: string;
  };
  preferences: {
    newsletter: boolean;
    notifications: boolean;
  };
}

/**
 * Classic Reactive Forms Bridge Demo
 *
 * Bridges Angular's classic Reactive Forms (FormControl/FormGroup) to
 * SignalTree state. Angular has no `FormControl.connect(signal)` /
 * `FormGroup.connect(signal)` API, so this bridges manually with effect()
 * (signal → control, via setValue/patchValue with emitEvent: false) and
 * control.valueChanges (control → signal):
 * - Converting NodeAccessor (slices) to WritableSignal with toWritableSignal()
 * - Two-way sync between forms and tree state
 * - Real-time state display
 *
 * For signal-native forms (no bridging required), see `signalForm()` from
 * `@signaltree/ng-forms` — demoed on the /signal-forms page.
 */
@Component({
  selector: 'app-signal-forms-demo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ExampleComponent],
  templateUrl: './signal-forms-demo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './signal-forms-demo.component.scss',
})
export class SignalFormsDemoComponent {
  // Store injector for passing to toWritableSignal()
  private readonly injector: Injector = inject(Injector);
  // Create a SignalTree with nested structure
  profile = signalTree<UserProfile>({
    personal: {
      firstName: '',
      lastName: '',
    },
    contact: {
      email: '',
      phone: '',
    },
    preferences: {
      newsletter: true,
      notifications: false,
    },
  });

  // Example 1: Connect individual leaf signals directly
  // Leaves are already WritableSignal<T>
  firstNameControl = new FormControl('');
  lastNameControl = new FormControl('');
  emailControl = new FormControl('');

  // Example 2: Convert a NodeAccessor (slice) to WritableSignal
  // The personal object is a NodeAccessor, not a WritableSignal
  // Use toWritableSignal() to make it compatible with connect()
  // Using loose typing to avoid Angular internal WritableSignal branding mismatch in demo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalSignal!: any;
  personalFormGroup = new FormGroup({
    firstName: new FormControl(''),
    lastName: new FormControl(''),
  });

  // Example 3: Full form with mixed approaches
  contactFormGroup = new FormGroup({
    email: new FormControl(''),
    phone: new FormControl(''),
  });

  preferencesFormGroup = new FormGroup({
    newsletter: new FormControl(true),
    notifications: new FormControl(false),
  });

  // Track sync status
  syncStatus = signal<'idle' | 'syncing' | 'synced'>('idle');

  constructor() {
    // Initialize writable signals from slices (needs injection context)
    this.personalSignal = toWritableSignal(
      this.profile.$.personal,
      this.injector
    );

    // Example 1: Bridge leaf signals directly (already WritableSignal)
    this.bridgeControlToSignal(
      this.firstNameControl,
      this.profile.$.personal.firstName
    );
    this.bridgeControlToSignal(
      this.lastNameControl,
      this.profile.$.personal.lastName
    );
    this.bridgeControlToSignal(this.emailControl, this.profile.$.contact.email);

    // Example 2: Bridge slice converted via toWritableSignal
    this.bridgeControlToSignal(this.personalFormGroup, this.personalSignal);

    // Example 3: Contact slice
    const contactSignal = toWritableSignal(
      this.profile.$.contact,
      this.injector
    );
    this.bridgeControlToSignal(this.contactFormGroup, contactSignal);

    // Example 4: Preferences slice
    const preferencesSignal = toWritableSignal(
      this.profile.$.preferences,
      this.injector
    );
    this.bridgeControlToSignal(this.preferencesFormGroup, preferencesSignal);

    this.syncStatus.set('synced');
  }

  // Manual bidirectional bridge between a classic Reactive Forms control and
  // a tree signal. Angular has no `FormControl.connect(signal)` API, so this
  // is the real sync path: an effect() pushes signal -> control (setValue /
  // patchValue with emitEvent: false, to avoid feedback loops), and
  // control.valueChanges pushes control -> signal.
  private bridgeControlToSignal(control: FormControl | FormGroup, sig: unknown) {
    // sig is WritableSignal<any>; type loosened for demo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = sig as any;
    if (control instanceof FormControl) {
      control.setValue(writable());
      control.valueChanges.subscribe((v) => writable.set(v));
      // Keep control updated from signal
      effect(() => control.setValue(writable(), { emitEvent: false }), {
        injector: this.injector,
      });
    } else if (control instanceof FormGroup) {
      control.patchValue(writable(), { emitEvent: false });
      control.valueChanges.subscribe((v) => writable.set(v));
      effect(() => control.patchValue(writable(), { emitEvent: false }), {
        injector: this.injector,
      });
    }
  }

  updateViaTree() {
    this.syncStatus.set('syncing');
    this.profile.$.personal.firstName.set('John');
    this.profile.$.personal.lastName.set('Doe');
    this.profile.$.contact.email.set('john.doe@example.com');
    this.profile.$.contact.phone.set('+1-555-0123');
    setTimeout(() => this.syncStatus.set('synced'), 300);
  }

  updateViaForm() {
    this.syncStatus.set('syncing');
    this.firstNameControl.setValue('Jane');
    this.lastNameControl.setValue('Smith');
    this.emailControl.setValue('jane.smith@example.com');
    setTimeout(() => this.syncStatus.set('synced'), 300);
  }

  resetAll() {
    this.syncStatus.set('syncing');
    this.profile.$.personal.firstName.set('');
    this.profile.$.personal.lastName.set('');
    this.profile.$.contact.email.set('');
    this.profile.$.contact.phone.set('');
    this.profile.$.preferences.newsletter.set(true);
    this.profile.$.preferences.notifications.set(false);
    setTimeout(() => this.syncStatus.set('idle'), 300);
  }

  // Computed full name from tree state
  get fullName(): string {
    const first = this.profile.$.personal.firstName();
    const last = this.profile.$.personal.lastName();
    return first && last ? `${first} ${last}` : 'Not set';
  }

  get statusIcon(): string {
    switch (this.syncStatus()) {
      case 'syncing':
        return '🔄';
      case 'synced':
        return '✅';
      default:
        return '⏸️';
    }
  }

  // ── st-example: complete-state snapshot for the inspector ───────────────────
  readonly stateSnapshot = computed(() => ({
    fullName: this.fullName,
    personal: {
      firstName: this.profile.$.personal.firstName(),
      lastName: this.profile.$.personal.lastName(),
    },
    contact: {
      email: this.profile.$.contact.email(),
      phone: this.profile.$.contact.phone(),
    },
    preferences: {
      newsletter: this.profile.$.preferences.newsletter(),
      notifications: this.profile.$.preferences.notifications(),
    },
  }));

  // ── st-example: key code patterns shown in the source panel ─────────────────
  readonly codeFiles: CodeFile[] = [
    {
      label: '1. Bridging a Leaf Signal',
      language: 'typescript',
      source: `// Angular has no FormControl.connect(signal) API — bridge manually.
// Leaves are WritableSignal<T>, so no conversion is needed.
const tree = signalTree({ user: { name: '' } });
const nameControl = new FormControl('');

// signal -> control (skip emitEvent to avoid feedback loops)
effect(() => nameControl.setValue(tree.$.user.name(), { emitEvent: false }));

// control -> signal
nameControl.valueChanges.subscribe((v) => tree.$.user.name.set(v));

// Prefer signal-native forms? See signalForm() from @signaltree/ng-forms
// (demoed on the /signal-forms page) — no bridging required.`,
    },
    {
      label: '2. Slice Conversion',
      language: 'typescript',
      source: `// Slices are NodeAccessor<T>, not WritableSignal<T> - convert first
const tree = signalTree({ user: { name: '', email: '' } });
const userFormGroup = new FormGroup({
  name: new FormControl(''),
  email: new FormControl('')
});

// Convert slice to WritableSignal<T>
const userSignal = toWritableSignal(tree.$.user, injector);

// Bridge the same way: effect() pushes signal -> group,
// valueChanges pushes group -> signal
effect(() => userFormGroup.patchValue(userSignal(), { emitEvent: false }));
userFormGroup.valueChanges.subscribe((v) => userSignal.set(v));`,
    },
    {
      label: '3. Two-Way Sync',
      language: 'typescript',
      source: `// Once bridged, changes flow both ways:
tree.$.user.name.set('John');     // → Form updates
nameControl.setValue('Jane');     // → Tree updates

// Real-time reactivity in templates:
profile.$.personal.firstName()  // Always current`,
    },
  ];
}

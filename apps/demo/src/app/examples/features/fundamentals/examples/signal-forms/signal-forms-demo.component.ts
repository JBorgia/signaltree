import { CommonModule } from '@angular/common';
import { Component, effect, inject, Injector, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { signalTree, toWritableSignal } from '@signaltree/core';

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
 * Signal Forms Demo
 *
 * Demonstrates Angular Signal Forms integration with SignalTree:
 * - Using connect() API with leaf signals
 * - Converting NodeAccessor (slices) to WritableSignal with toWritableSignal()
 * - Two-way sync between forms and tree state
 * - Real-time state display
 */
@Component({
  selector: 'app-signal-forms-demo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './signal-forms-demo.component.html',
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

    // Example 1: Connect leaf signals directly (already WritableSignal)
    this.connectIfAvailable(
      this.firstNameControl,
      this.profile.$.personal.firstName
    );
    this.connectIfAvailable(
      this.lastNameControl,
      this.profile.$.personal.lastName
    );
    this.connectIfAvailable(this.emailControl, this.profile.$.contact.email);

    // Example 2: Connect slice converted via toWritableSignal
    this.connectIfAvailable(this.personalFormGroup, this.personalSignal);

    // Example 3: Contact slice
    const contactSignal = toWritableSignal(
      this.profile.$.contact,
      this.injector
    );
    this.connectIfAvailable(this.contactFormGroup, contactSignal);

    // Example 4: Preferences slice
    const preferencesSignal = toWritableSignal(
      this.profile.$.preferences,
      this.injector
    );
    this.connectIfAvailable(this.preferencesFormGroup, preferencesSignal);

    this.syncStatus.set('synced');
  }

  // Attempt Angular 20.3+ connect(); fallback to manual sync using effects
  private connectIfAvailable(control: FormControl | FormGroup, sig: unknown) {
    // try native connect
    const maybeConnect = (
      control as unknown as { connect?: (s: unknown) => void }
    ).connect;
    if (typeof maybeConnect === 'function') {
      try {
        maybeConnect(sig);
        return;
      } catch (err) {
        console.warn('connect() failed, falling back to manual sync:', err);
      }
    }
    // Fallback: manual sync via valueChanges + effect
    // sig is WritableSignal<any>
    // Type loosening for demo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = sig as any;
    if (control instanceof FormControl) {
      control.setValue(writable());
      control.valueChanges.subscribe((v) => writable.set(v));
      // Keep control updated from signal
      effect(() => control.setValue(writable(), { emitEvent: false }));
    } else if (control instanceof FormGroup) {
      control.patchValue(writable(), { emitEvent: false });
      control.valueChanges.subscribe((v) => writable.set(v));
      effect(() => control.patchValue(writable(), { emitEvent: false }));
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
}

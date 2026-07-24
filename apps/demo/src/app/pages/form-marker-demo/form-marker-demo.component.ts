import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  type AuditEntry,
  createAuditTracker,
  form,
  FormSignal,
  history,
  type ISignalTree,
  signalTree,
  validators,
} from '@signaltree/core';
import { formBridge } from '@signaltree/ng-forms';

import {
  type CodeFile,
  CodeTabsComponent,
  StateInspectorComponent,
} from '../../examples/shared/components/example-shell';

// =============================================================================
// TYPES
// =============================================================================

interface ContactForm {
  [key: string]: unknown;
  name: string;
  email: string;
  phone: string;
  message: string;
}

interface ProfileDraft {
  [key: string]: unknown;
  name: string;
  email: string;
}

interface ListingWizard {
  [key: string]: unknown;
  title: string;
  description: string;
  category: string;
  price: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  photos: string[];
  location: string;
  shippingOptions: string[];
}

interface AuditProfile {
  [key: string]: unknown;
  name: string;
  email: string;
  bio: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

@Component({
  selector: 'app-form-marker-demo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CodeTabsComponent,
    StateInspectorComponent,
  ],
  templateUrl: './form-marker-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './form-marker-demo.component.scss',
})
export class FormMarkerDemoComponent implements OnDestroy {
  // Demo selection
  activeDemo = signal<
    'basic' | 'wizard' | 'persistence' | 'history' | 'angular-bridge' | 'audit'
  >('basic');

  // =============================================================================
  // DEMO 1: Basic Form with Validation
  // =============================================================================

  basicStore = signalTree({
    contact: form<ContactForm>({
      initial: {
        name: '',
        email: '',
        phone: '',
        message: '',
      },
      validators: {
        name: validators.required('Name is required'),
        email: [
          validators.required('Email is required'),
          validators.email('Please enter a valid email'),
        ],
        phone: validators.pattern(/^\+?[\d\s-()]+$/, 'Invalid phone format'),
        message: [
          validators.required('Message is required'),
          validators.minLength(10, 'Message must be at least 10 characters'),
        ],
      },
    }),
  });

  // Convenience accessor
  get contactForm() {
    return this.basicStore.$.contact as unknown as FormSignal<ContactForm>;
  }

  async submitContact() {
    const result = await this.contactForm.submit(
      async (values: ContactForm) => {
        // Simulate API call
        await new Promise((r) => setTimeout(r, 1500));
        console.log('Submitted contact form:', values);
        return { success: true, id: Math.random().toString(36).slice(2) };
      }
    );

    if (result?.success) {
      alert(`Form submitted successfully! ID: ${result.id}`);
      this.contactForm.reset();
    }
  }

  // =============================================================================
  // DEMO 2: Multi-step Wizard Form
  // =============================================================================

  wizardStore = signalTree({
    listing: form<ListingWizard>({
      initial: {
        title: '',
        description: '',
        category: '',
        price: 0,
        condition: 'good',
        photos: [],
        location: '',
        shippingOptions: [],
      },
      validators: {
        title: [
          validators.required('Title is required'),
          validators.maxLength(100, 'Title too long'),
        ],
        description: validators.minLength(20, 'Description too short'),
        category: validators.required('Select a category'),
        price: validators.min(0.01, 'Price must be positive'),
        location: validators.required('Location is required'),
      },
      wizard: {
        steps: ['details', 'media', 'pricing', 'review'],
        stepFields: {
          details: ['title', 'description', 'category'],
          media: ['photos'],
          pricing: ['price', 'condition', 'shippingOptions'],
          review: ['location'],
        },
      },
    }),
  });

  get listingForm() {
    return this.wizardStore.$.listing as unknown as FormSignal<ListingWizard>;
  }

  categoryOptions = [
    'Electronics',
    'Clothing',
    'Home & Garden',
    'Sports',
    'Books',
    'Toys',
    'Vehicles',
    'Other',
  ];

  conditionOptions: ListingWizard['condition'][] = [
    'new',
    'like_new',
    'good',
    'fair',
    'poor',
  ];

  shippingOptions = [
    'Local Pickup',
    'Standard Shipping',
    'Express Shipping',
    'Free Shipping',
  ];

  toggleShipping(option: string) {
    const current = this.listingForm.$.shippingOptions();
    if (current.includes(option)) {
      this.listingForm.$.shippingOptions.set(
        current.filter((o: string) => o !== option)
      );
    } else {
      this.listingForm.$.shippingOptions.set([...current, option]);
    }
  }

  addMockPhoto() {
    const photos = this.listingForm.$.photos();
    const mockUrl = `https://picsum.photos/seed/${Date.now()}/200/200`;
    this.listingForm.$.photos.set([...photos, mockUrl]);
  }

  removePhoto(index: number) {
    const photos = this.listingForm.$.photos();
    this.listingForm.$.photos.set(
      photos.filter((_: string, i: number) => i !== index)
    );
  }

  async publishListing() {
    const result = await this.listingForm.submit(
      async (values: ListingWizard) => {
        await new Promise((r) => setTimeout(r, 2000));
        console.log('Publishing listing:', values);
        return { success: true, listingId: 'LST-' + Date.now() };
      }
    );

    if (result?.success) {
      alert(`Listing published! ID: ${result.listingId}`);
      this.listingForm.reset();
      this.listingForm.wizard?.reset();
    }
  }

  // =============================================================================
  // DEMO 3: Persistence Demo
  // =============================================================================

  persistStore = signalTree({
    draft: form<{ subject: string; body: string; tags: string[] }>({
      initial: {
        subject: '',
        body: '',
        tags: [],
      },
      persist: 'signaltree-demo-email-draft',
      persistDebounceMs: 300,
      validators: {
        subject: validators.required('Subject required'),
        body: validators.minLength(5, 'Body too short'),
      },
    }),
  });

  get draftForm() {
    return this.persistStore.$.draft as unknown as FormSignal<{
      subject: string;
      body: string;
      tags: string[];
    }>;
  }

  tagInput = signal('');

  addTag() {
    const tag = this.tagInput().trim();
    if (tag && !this.draftForm.$.tags().includes(tag)) {
      this.draftForm.$.tags.set([...this.draftForm.$.tags(), tag]);
      this.tagInput.set('');
    }
  }

  removeTag(tag: string) {
    this.draftForm.$.tags.set(
      this.draftForm.$.tags().filter((t: string) => t !== tag)
    );
  }

  clearDraft() {
    this.draftForm.clearStorage();
    this.draftForm.reset();
  }

  // =============================================================================
  // DEMO 3.5: Undo/Redo History
  // =============================================================================

  historyStore = signalTree({
    profile: form<ProfileDraft>({
      initial: { name: '', email: '' },
      history: history({ capacity: 20 }),
    }),
  });

  get historyForm() {
    return this.historyStore.$.profile as unknown as FormSignal<ProfileDraft>;
  }

  // =============================================================================
  // DEMO 4: Angular FormGroup Bridge
  // =============================================================================

  bridgeStore = signalTree({
    feedback: form<{
      rating: number;
      title: string;
      comment: string;
      recommend: boolean;
    }>({
      initial: {
        rating: 0,
        title: '',
        comment: '',
        recommend: false,
      },
      validators: {
        rating: validators.min(1, 'Please select a rating'),
        title: [
          validators.required('Title is required'),
          validators.minLength(5, 'Title must be at least 5 characters'),
        ],
        comment: validators.minLength(
          10,
          'Please provide at least 10 characters'
        ),
      },
    }),
  }).with(formBridge());

  // Get the Angular FormGroup bridge
  get feedbackFormGroup(): FormGroup | null {
    return (
      this.bridgeStore.getAngularForm<{
        rating: number;
        title: string;
        comment: string;
        recommend: boolean;
      }>('feedback')?.formGroup ?? null
    );
  }

  get feedbackForm() {
    return this.bridgeStore.$.feedback as unknown as FormSignal<{
      rating: number;
      title: string;
      comment: string;
      recommend: boolean;
    }>;
  }

  // Rating stars helper
  ratingStars = computed(() => {
    const rating = this.feedbackForm.$.rating();
    return [1, 2, 3, 4, 5].map((star) => ({
      star,
      filled: star <= rating,
    }));
  });

  setRating(star: number) {
    this.feedbackForm.$.rating.set(star);
  }

  async submitFeedback() {
    const result = await this.feedbackForm.submit(async (values) => {
      await new Promise((r) => setTimeout(r, 1000));
      console.log('Feedback submitted:', values);
      return { success: true };
    });

    if (result?.success) {
      alert('Thank you for your feedback!');
      this.feedbackForm.reset();
    }
  }

  // =============================================================================
  // DEMO 5: Audit Tracker — createAuditTracker (@signaltree/core)
  // =============================================================================

  auditStore = signalTree<AuditProfile>({
    name: '',
    email: '',
    bio: '',
  });

  /** Raw log `createAuditTracker` pushes into (plain array, not a signal). */
  private readonly auditLogRaw: AuditEntry<AuditProfile>[] = [];
  /** Signal copy synced on an interval so the template re-renders live. */
  readonly auditEntries = signal<AuditEntry<AuditProfile>[]>([]);

  private stopAuditTracker?: () => void;
  private auditSyncHandle?: ReturnType<typeof setInterval>;
  readonly auditTrackingActive = signal(false);

  constructor() {
    this.startAuditTracking();
  }

  startAuditTracking(): void {
    if (this.stopAuditTracker) return;

    // core signalTree has no `subscribe`, so createAuditTracker falls back
    // to ~100ms polling internally. We sync our own display signal on a
    // short interval so the live log below reflects that polling.
    this.stopAuditTracker = createAuditTracker(
      this.auditStore as unknown as ISignalTree<AuditProfile>,
      this.auditLogRaw,
      {
        includePreviousValues: true,
        getMetadata: () => ({
          source: 'form-marker-demo',
          description: 'profile edit',
        }),
        maxEntries: 25,
      }
    );
    this.auditSyncHandle = setInterval(() => {
      this.auditEntries.set([...this.auditLogRaw]);
    }, 150);
    this.auditTrackingActive.set(true);
  }

  stopAuditTracking(): void {
    this.stopAuditTracker?.();
    this.stopAuditTracker = undefined;
    if (this.auditSyncHandle) {
      clearInterval(this.auditSyncHandle);
      this.auditSyncHandle = undefined;
    }
    this.auditTrackingActive.set(false);
  }

  randomizeAuditProfile(): void {
    const names = ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'];
    const roles = ['engineer', 'admin', 'viewer'];
    const name = names[Math.floor(Math.random() * names.length)];
    this.auditStore.$.name.set(name);
    this.auditStore.$.email.set(
      `${name.split(' ')[0].toLowerCase()}@example.com`
    );
    this.auditStore.$.bio.set(
      `Role: ${roles[Math.floor(Math.random() * roles.length)]}`
    );
  }

  clearAuditLog(): void {
    this.auditLogRaw.length = 0;
    this.auditEntries.set([]);
  }

  ngOnDestroy(): void {
    this.stopAuditTracking();
  }

  // =============================================================================
  // CODE EXAMPLES
  // =============================================================================

  basicFormCode = `// Basic form with validation
signalTree({
  contact: form<ContactForm>({
    initial: {
      name: '',
      email: '',
      phone: '',
      message: '',
    },
    validators: {
      name: validators.required('Name is required'),
      email: [
        validators.required('Email is required'),
        validators.email('Invalid email format'),
      ],
      phone: validators.pattern(/^\\+?[\\d\\s-()]+$/, 'Invalid phone'),
      message: validators.minLength(10, 'Too short'),
    },
  }),
});

// Access fields via $
tree.$.contact.$.name();           // Get value
tree.$.contact.$.name.set('John'); // Set value

// Validation
tree.$.contact.valid();            // boolean
tree.$.contact.errors();           // { name: null, email: 'Required', ... }
tree.$.contact.errorList();        // ['Email is required', ...]

// Submit with loading state
await tree.$.contact.submit(async (values) => {
  await api.sendContact(values);
});`;

  wizardCode = `// Multi-step wizard form
signalTree({
  listing: form<ListingWizard>({
    initial: { title: '', price: 0, ... },
    validators: {
      title: validators.required(),
      price: validators.min(0.01, 'Must be positive'),
    },
    wizard: {
      steps: ['details', 'media', 'pricing', 'review'],
      stepFields: {
        details: ['title', 'description', 'category'],
        media: ['photos'],
        pricing: ['price', 'condition'],
        review: ['location'],
      },
    },
  }),
});

// Wizard navigation
tree.$.listing.wizard.currentStep();  // 0
tree.$.listing.wizard.stepName();     // 'details'
tree.$.listing.wizard.canNext();      // validates step fields
tree.$.listing.wizard.canPrev();      // true if not first step

await tree.$.listing.wizard.next();   // Validates, then advances
tree.$.listing.wizard.prev();         // Go back
tree.$.listing.wizard.goTo('pricing'); // Jump to step
tree.$.listing.wizard.reset();        // Back to first step`;

  persistenceCode = `// Persistent form with auto-save
signalTree({
  draft: form({
    initial: { subject: '', body: '' },
    persist: 'email-draft',        // localStorage key
    persistDebounceMs: 300,        // Debounce writes
    validators: {
      subject: validators.required(),
    },
  }),
});

// Changes auto-save to localStorage
tree.$.draft.$.subject.set('Hello');  // Debounced save

// Manual persistence control
tree.$.draft.persistNow();    // Force immediate save
tree.$.draft.reload();        // Reload from storage
tree.$.draft.clearStorage();  // Remove from storage`;

  historyCode = `// Undo/redo history for a form() marker
import { signalTree, form, history } from '@signaltree/core';

const tree = signalTree({
  profile: form({
    initial: { name: '', email: '' },
    history: history({ capacity: 20 }), // optional: exclude: ['ssn']
  }),
});

// Every patch()/set()/$.field.set() call records a snapshot
tree.$.profile.$.name.set('Ada');
tree.$.profile.$.email.set('ada@example.com');

// Undo/redo drive the marker's values signal directly
tree.$.profile.history?.undo();          // reverts email, then name
tree.$.profile.history?.redo();
tree.$.profile.history?.clearHistory();  // drop past/future, keep present

// Signals for wiring up UI
tree.$.profile.history?.canUndo();       // Signal<boolean>
tree.$.profile.history?.canRedo();       // Signal<boolean>
tree.$.profile.history?.history();       // Signal<{ past, present, future }>`;

  formBridgeCode = `// Angular FormGroup Bridge
// Use form() marker with formBridge() enhancer to get
// Angular-compatible FormGroup instances

import { form, signalTree } from '@signaltree/core';
import { formBridge } from '@signaltree/ng-forms';

const tree = signalTree({
  feedback: form<FeedbackForm>({
    initial: {
      rating: 0,
      title: '',
      comment: '',
      recommend: false,
    },
    validators: {
      rating: validators.min(1, 'Please select a rating'),
      title: validators.required('Title is required'),
    },
  }),
}).with(formBridge());

// Get the Angular FormGroup
const feedbackFormGroup = tree.getAngularForm('feedback')?.formGroup;

// Use in template with [formGroup]
<form [formGroup]="feedbackFormGroup">
  <input formControlName="title">
  <textarea formControlName="comment"></textarea>
</form>

// Both APIs stay in sync:
tree.$.feedback.$.title.set('New title');  // Updates FormGroup
feedbackFormGroup.patchValue({ title: 'Another' }); // Updates signals

// Access Angular-specific features
const titleControl = tree.getAngularForm('feedback')?.formControl('title');
titleControl?.markAsTouched();`;

  auditCode = `// Audit tracker — tree-shakeable, moved to @signaltree/core in v13
// (@signaltree/ng-forms/audit is a deprecated re-export)
import { signalTree, createAuditTracker, type AuditEntry } from '@signaltree/core';

interface Profile { name: string; email: string; bio: string }

const tree = signalTree<Profile>({ name: '', email: '', bio: '' });
const auditLog: AuditEntry<Profile>[] = [];

// Pushes an AuditEntry into auditLog on every state change. Uses
// tree.subscribe() when available; core signalTree has none, so it falls
// back to ~100ms polling — zero setup either way.
const stopTracking = createAuditTracker(tree, auditLog, {
  includePreviousValues: true,      // capture the "before" values too
  getMetadata: () => ({ source: 'profile-editor' }),
  maxEntries: 25,                   // bound the log (0 = unlimited)
  // filter: (changes) => 'email' in changes, // only audit specific fields
});

tree.$.name.set('Ada Lovelace');
// auditLog[0] === {
//   timestamp: 1737...,
//   changes: { name: 'Ada Lovelace' },
//   previousValues: { name: '' },
//   metadata: { source: 'profile-editor' },
// }

stopTracking(); // unsubscribe / stop polling`;

  // Source strings wrapped for the shared tabbed code viewer
  basicFormFiles: CodeFile[] = [
    { label: 'basic-form.ts', language: 'typescript', source: this.basicFormCode },
  ];
  wizardFiles: CodeFile[] = [
    { label: 'wizard-form.ts', language: 'typescript', source: this.wizardCode },
  ];
  persistenceFiles: CodeFile[] = [
    {
      label: 'persistence.ts',
      language: 'typescript',
      source: this.persistenceCode,
    },
  ];
  historyFiles: CodeFile[] = [
    { label: 'history.ts', language: 'typescript', source: this.historyCode },
  ];
  formBridgeFiles: CodeFile[] = [
    {
      label: 'form-bridge.ts',
      language: 'typescript',
      source: this.formBridgeCode,
    },
  ];
  auditFiles: CodeFile[] = [
    { label: 'audit.ts', language: 'typescript', source: this.auditCode },
  ];
}

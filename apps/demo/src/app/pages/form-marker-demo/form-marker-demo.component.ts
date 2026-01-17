import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormSignal, signalTree, validators } from '@signaltree/core';

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

// =============================================================================
// COMPONENT
// =============================================================================

@Component({
  selector: 'app-form-marker-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './form-marker-demo.component.html',
  styleUrls: ['./form-marker-demo.component.scss'],
})
export class FormMarkerDemoComponent {
  // Demo selection
  activeDemo = signal<'basic' | 'wizard' | 'persistence'>('basic');

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
}

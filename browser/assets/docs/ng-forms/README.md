# @signaltree/ng-forms

**Tree-structured signal forms for Angular 21+**. When Angular's native signal forms aren't enough—add persistence, wizards, history tracking, and nested state management.

**Bundle size: 3.38KB gzipped**

## Why ng-forms?

Angular 21 introduced native signal forms with `FormField<T>`, which work great for simple, flat forms. **ng-forms is for complex forms** that need:

### **🌲 Tree-Structured State**
```typescript
// Angular 21: Flat fields, no relationships
const name = formField('');
const email = formField('');

// ng-forms: Hierarchical structure that mirrors your data model
const form = createFormTree({
  user: { name: '', email: '' },
  address: { street: '', city: '', zip: '' }
});
// Access nested: form.$.user.name()
// Validate paths: 'address.zip'
```

### **💾 Auto-Persistence**
```typescript
// Angular 21: No persistence, build it yourself
// ng-forms: Built-in with debouncing
const form = createFormTree(initialState, {
  persistKey: 'checkout-draft',
  storage: localStorage,
  persistDebounceMs: 500
});
// Auto-saves changes, restores on init
```

### **🧙 Wizard & Multi-Step Forms**
```typescript
// Angular 21: Build from scratch
// ng-forms: First-class wizard support
const wizard = createWizardForm([
  { fields: ['profile.name', 'profile.email'] },
  { fields: ['address.street', 'address.city'] }
], initialValues);
wizard.nextStep(); // Automatic field visibility management
```

### **↩️ History / Undo-Redo**
```typescript
// Angular 21: Not available
// ng-forms: Built-in
const form = withFormHistory(createFormTree(initialState));
form.undo();
form.redo();
```

### **🔗 Reactive Forms Bridge**
```typescript
// Angular 21: New API, migration required
// ng-forms: Works with existing FormGroup/FormControl
<form [formGroup]="profile.form" (ngSubmit)="save()">
  <input formControlName="name" />
</form>
// Signals AND reactive forms, incremental migration
```

### **⚙️ Declarative Configuration**
```typescript
// Angular 21: Per-field imperative setup
// ng-forms: Centralized, glob-pattern configs
fieldConfigs: {
  'email': { validators: [validators.email()], debounceMs: 300 },
  'payment.card.*': { validators: validators.required() }
}
```

**Use Angular 21 signal forms for simple forms. Use ng-forms for enterprise apps with complex state, persistence, and workflow requirements.**

## Installation

```bash
pnpm add @signaltree/core @signaltree/ng-forms
```

> **Compatibility**: Angular 17+ with TypeScript 5.5+. Angular 21+ recommended for best experience. Works alongside Angular's native signal forms—use both where appropriate.

## Quick start

```typescript
import { Component } from '@angular/core';
import { createFormTree, validators } from '@signaltree/ng-forms';

interface ProfileForm {
  name: string;
  email: string;
  marketing: boolean;
}

@Component({
  selector: 'app-profile-form',
  template: `
    <form [formGroup]="profile.form" (ngSubmit)="save()">
      <input formControlName="name" placeholder="Name" />
      <span class="error" *ngIf="profile.getFieldError('name')()">
        {{ profile.getFieldError('name')() }}
      </span>

      <input formControlName="email" placeholder="Email" />
      <span class="error" *ngIf="profile.getFieldError('email')()">
        {{ profile.getFieldError('email')() }}
      </span>

      <label> <input type="checkbox" formControlName="marketing" /> Email marketing </label>

      <button type="submit" [disabled]="profile.valid() === false">
        {{ profile.submitting() ? 'Saving...' : 'Save profile' }}
      </button>
    </form>

    <pre>Signals: {{ profile.$.name() }} / {{ profile.$.email() }}</pre>
  `,
})
export class ProfileFormComponent {
  private storage = typeof window !== 'undefined' ? window.localStorage : undefined;

  profile = createFormTree<ProfileForm>(
    {
      name: '',
      email: '',
      marketing: false,
    },
    {
      persistKey: 'profile-form',
      storage: this.storage,
      fieldConfigs: {
        name: { validators: validators.required('Name is required') },
        email: {
          validators: [validators.required(), validators.email()],
          debounceMs: 150,
        },
      },
    }
  );

  async save() {
    await this.profile.submit(async (values) => {
      // Persist values to your API or service layer here
      console.log('Saving profile', values);
    });
  }
}
```

The returned `FormTree` exposes:

- `form`: Angular `FormGroup` for templates and directives
- `$` / `state`: signal-backed access to individual fields
- `errors`, `asyncErrors`, `valid`, `dirty`, `submitting`: writable signals for UI state
- Helpers such as `setValue`, `setValues`, `reset`, `validate`, and `submit`

## Core capabilities

- **Signal-synced forms**: Bidirectional sync between Angular FormControls and SignalTree signals
- **Per-field configuration**: Debounce, sync & async validators, and wildcard matcher support
- **Conditional fields**: Enable/disable controls based on dynamic predicates
- **Persistence**: Keep form state in `localStorage`, IndexedDB, or custom storage with debounced writes
- **Validation batching**: Aggregate touched/errors updates to avoid jitter in large forms
- **Wizard & history helpers**: Higher-level APIs for multi-step flows and undo/redo stacks
- **Signal ↔ Observable bridge**: Convert signals to RxJS streams for interoperability
- **Template-driven adapter**: `SignalValueDirective` bridges standalone signals with `ngModel`

## Angular 21 Interoperability

**ng-forms complements Angular 21's native signal forms**—use both in the same app:

### Use Angular 21 `FormField<T>` for:
- ✅ Simple, flat forms (login, search)
- ✅ Single-field validation
- ✅ Maximum type safety

### Use ng-forms `createFormTree()` for:
- ✅ Nested object structures (user + address + payment)
- ✅ Forms with persistence/auto-save
- ✅ Wizard/multi-step flows
- ✅ History/undo requirements
- ✅ Complex conditional logic
- ✅ Migration from reactive forms

### Hybrid Example: Simple Fields + Complex Tree
```typescript
import { formField } from '@angular/forms';
import { createFormTree } from '@signaltree/ng-forms';

@Component({...})
class CheckoutComponent {
  // Simple field: Use Angular 21 native
  promoCode = formField('');

  // Complex nested state: Use ng-forms
  checkout = createFormTree({
    shipping: { name: '', address: '', city: '', zip: '' },
    payment: { card: '', cvv: '', expiry: '' },
    items: [] as CartItem[]
  }, {
    persistKey: 'checkout-draft',
    fieldConfigs: {
      'shipping.zip': { validators: validators.zipCode() },
      'payment.card': { validators: validators.creditCard(), debounceMs: 300 }
    }
  });

  // Both work together seamlessly
}
```

### Connecting to Reactive Forms
```ts
import { toWritableSignal } from '@signaltree/core';

// Convert ng-forms signals to work with Angular's .connect()
const nameSignal = toWritableSignal(formTree.$.user.name);
reactiveControl.connect(nameSignal);
```

## Form tree configuration

```typescript
const checkout = createFormTree(initialState, {
  validators: {
    'shipping.zip': (value) => (/^[0-9]{5}$/.test(String(value)) ? null : 'Enter a valid ZIP code'),
  },
  asyncValidators: {
    'account.email': async (value) => ((await emailService.isTaken(value)) ? 'Email already used' : null),
  },
  fieldConfigs: {
    'payment.card.number': { debounceMs: 200 },
    'preferences.*': { validators: validators.required() },
  },
  conditionals: [
    {
      when: (values) => values.shipping.sameAsBilling,
      fields: ['shipping.address', 'shipping.city', 'shipping.zip'],
    },
  ],
  persistKey: 'checkout-draft',
  storage: sessionStorage,
  persistDebounceMs: 500,
  validationBatchMs: 16,
});
```

- `validators` / `asyncValidators`: Map paths (supports `*` globs) to declarative validation functions
- `fieldConfigs`: Attach validators and per-field debounce without scattering logic
- `conditionals`: Automatically disable controls when predicates fail
- `persistKey` + `storage`: Load persisted values on creation and auto-save thereafter
- `validationBatchMs`: Batch aggregate signal updates when running lots of validators at once

## Wizard flows

```typescript
import { createWizardForm, FormStep } from '@signaltree/ng-forms';

const steps: FormStep<AccountSetup>[] = [
  {
    fields: ['profile.name', 'profile.email'],
    validate: async (form) => {
      await form.validate('profile.email');
      return !form.getFieldError('profile.email')();
    },
  },
  {
    fields: ['security.password', 'security.confirm'],
  },
];

const wizard = createWizardForm(steps, initialValues, {
  conditionals: [
    {
      when: ({ marketingOptIn }) => marketingOptIn,
      fields: ['preferences.frequency'],
    },
  ],
});

await wizard.nextStep();
wizard.previousStep();
wizard.currentStep(); // readonly signal
wizard.isFieldVisible('preferences.frequency')();
```

Wizard forms reuse the same `form` instance and `FormTree` helpers, adding `currentStep`, `nextStep`, `previousStep`, `goToStep`, and `isFieldVisible` helpers for UI state.

## Form history snapshots

```typescript
import { withFormHistory } from '@signaltree/ng-forms';

const form = withFormHistory(createFormTree(initialValues), { capacity: 20 });

form.setValue('profile.name', 'Ada');
form.undo();
form.redo();
form.history(); // signal with { past, present, future }
form.clearHistory();
```

History tracking works at the FormGroup level so it plays nicely with external updates and preserved snapshots.

## Helpers and utilities

- `validators` / `asyncValidators`: Lightweight factories for common rules (required, email, minLength, unique, etc.)
- `createVirtualFormArray`: Virtualize huge `FormArray`s by only instantiating the visible window
- `toObservable(signal)`: Convert any Angular signal to an RxJS `Observable`
- `SIGNAL_FORM_DIRECTIVES`: Re-export of `SignalValueDirective` for template-driven helpers
- `FormValidationError`: Error thrown from `submit` when validation fails, containing sync & async errors

## Template-driven bridge

```html
<input type="text" [(ngModel)]="userName" [signalTreeSignalValue]="formTree.$.user.name" (signalTreeSignalValueChange)="audit($event)" />
```

Use `SignalValueDirective` to keep standalone signals and `ngModel` fields aligned in legacy sections while new pages migrate to forms-first APIs.

## When to use ng-forms vs Angular 21 signal forms

| Scenario | Recommendation |
|----------|---------------|
| Login form (2-3 fields) | ✅ Angular 21 `FormField` |
| Search bar with filters | ✅ Angular 21 `FormField` |
| User profile with nested address | ✅ **ng-forms** (tree structure) |
| Checkout flow (shipping + payment + items) | ✅ **ng-forms** (persistence + wizard) |
| Multi-step onboarding (5+ steps) | ✅ **ng-forms** (wizard API) |
| Form with auto-save drafts | ✅ **ng-forms** (built-in persistence) |
| Complex editor with undo/redo | ✅ **ng-forms** (history tracking) |
| Migrating from reactive forms | ✅ **ng-forms** (FormGroup bridge) |
| Dynamic form with conditional fields | ✅ **ng-forms** (conditionals config) |
| Form synced with global app state | ✅ **ng-forms** (SignalTree integration) |

**Rule of thumb**: If your form data is a nested object or needs workflow features (persistence/wizards/history), use ng-forms. For simple flat forms, Angular 21's native signal forms are perfect.

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Angular 21 Migration Guide](./ANGULAR21-MIGRATION.md)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Demo Application](https://signaltree.io/examples)

## License

MIT License with AI Training Restriction — see the [LICENSE](../../LICENSE) file for details.

---

**Seamless signal-first Angular forms.**

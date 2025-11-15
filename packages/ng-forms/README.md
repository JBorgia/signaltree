# @signaltree/ng-forms

Angular 20 signal forms meet SignalTree. `@signaltree/ng-forms` keeps your form state, validation, persistence, and wizard flows in sync with the rest of your application signals—no manual plumbing.

**Bundle size: 3.38KB gzipped**

## Installation

```bash
pnpm add @signaltree/core @signaltree/ng-forms
```

> This package supports Angular 17+ with TypeScript 5.5+. Angular 17-19 support uses a legacy bridge that will be deprecated when Angular 21 is released. For the best experience, upgrade to Angular 20.3+ to use native Signal Forms.

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

## Signal Forms (Angular 20+)

`@signaltree/ng-forms` now prefers Angular's experimental Signal Forms `connect()` API when available.

- Leaves in a SignalTree are native `WritableSignal<T>` and can be connected directly
- For object slices, convert to a `WritableSignal<T>` via `toWritableSignal()` from `@signaltree/core`

```ts
import { toWritableSignal } from '@signaltree/core';

const values = createFormTree({
  user: { name: '', email: '' },
});

// Connect leaves directly
nameControl.connect(values.$.user.name);
emailControl.connect(values.$.user.email);

// Or connect a whole slice
const userSignal = toWritableSignal(values.values.$.user);
userGroupControl.connect(userSignal);
```

Angular 20.3+ is preferred for native Signal Forms `connect()`. Angular 17-19 is supported via a legacy bridge that will be deprecated when Angular 21 is released.

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

## When to reach for ng-forms

- Complex Angular forms that need to remain in sync with SignalTree application state
- Workflows that require persistence, auto-save, or offline drafts
- Multi-step wizards or surveys with dynamic branching
- Applications that benefit from first-class signal APIs around Angular forms

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Demo Application](https://signaltree.io/examples)

## License

MIT License with AI Training Restriction — see the [LICENSE](../../LICENSE) file for details.

---

**Seamless signal-first Angular forms.**

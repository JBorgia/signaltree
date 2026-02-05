# @signaltree/ng-forms

**Angular FormGroup bridge for SignalTree's `form()` marker**. Adds reactive forms integration, conditional fields, and undo/redo to tree-integrated forms.

**Bundle size: 3.38KB gzipped**

## Architecture: form() + formBridge()

SignalTree v7 introduces a layered forms architecture:

```
@signaltree/core                    @signaltree/ng-forms
┌─────────────────────────┐         ┌─────────────────────────┐
│ form() marker           │         │ formBridge()      │
│ ─────────────────────── │   ───►  │ enhancer that:          │
│ • Signal-based fields   │         │ • Creates FormGroup     │
│ • Sync/async validators │         │ • Bidirectional sync    │
│ • Persistence           │         │ • Conditional fields    │
│ • Wizard navigation     │         │ • Angular validators    │
│ • dirty/valid/submitting│         │                         │
└─────────────────────────┘         │ withFormHistory()       │
     Works standalone!              │ • Undo/redo             │
                                    └─────────────────────────┘
```

**Key insight**: `form()` is self-sufficient. `formBridge()` adds Angular-specific capabilities.

## Quick Start (Recommended Pattern)

```typescript
import { signalTree, form } from '@signaltree/core';
import { formBridge } from '@signaltree/ng-forms';

// Define forms in your tree
const tree = signalTree({
  checkout: {
    shipping: form({
      initial: { name: '', address: '', zip: '' },
      validators: {
        zip: (v) => (/^\d{5}$/.test(String(v)) ? null : 'Invalid ZIP'),
      },
      persist: 'checkout-shipping',
    }),
    payment: form({
      initial: { card: '', cvv: '' },
      wizard: { steps: ['card', 'review'] },
    }),
  },
}).with(
  formBridge({
    conditionals: [{ when: (v) => v.checkout.sameAsBilling, fields: ['checkout.shipping.*'] }],
  })
);

// Use in components
@Component({
  template: `
    <!-- Option 1: Use form() signals directly -->
    <input [value]="tree.$.checkout.shipping.$.name()" (input)="tree.$.checkout.shipping.$.name.set($event.target.value)" />

    <!-- Option 2: Use Angular FormGroup -->
    <form [formGroup]="shippingForm">
      <input formControlName="name" />
    </form>
  `,
})
class CheckoutComponent {
  tree = inject(CHECKOUT_TREE);

  // Get the FormGroup bridge
  shippingForm = this.tree.getAngularForm('checkout.shipping')?.formGroup;
}
```

## When to Use Each Layer

### form() alone (no ng-forms needed)

```typescript
import { signalTree, form } from '@signaltree/core';
import { email } from '@signaltree/ng-forms';

// Pure signal forms - works without Angular forms module
const tree = signalTree({
  login: form({
    initial: { email: '', password: '' },
    validators: { email: email() },
  }),
});

// Full functionality without Angular FormGroup
tree.$.login.$.email.set('user@test.com');
tree.$.login.valid(); // Reactive validation
tree.$.login.validate(); // Trigger validation
tree.$.login.submit(fn); // Submit handling
tree.$.login.wizard?.next(); // Wizard navigation (if configured)
```

**Use when**: SSR, unit tests, simple forms, non-Angular environments

### form() + formBridge()

```typescript
// Add Angular FormGroup bridge
const tree = signalTree({
  profile: form({ initial: { name: '' } }),
}).with(formBridge());

// Now you get FormGroup access
const formGroup = tree.getAngularForm('profile')?.formGroup;
// Or attached directly: (tree.$.profile as any).formGroup
```

**Use when**: Need `[formGroup]` directives, Angular validators, conditional field disabling

### form() + formBridge() + withFormHistory()

```typescript
const tree = signalTree({
  editor: form({ initial: { content: '' } }),
})
  .with(formBridge())
  .with(withFormHistory({ capacity: 50 }));

tree.undo();
tree.redo();
```

**Use when**: Complex editors, need undo/redo

## Installation

```bash
pnpm add @signaltree/core @signaltree/ng-forms
```

> **Compatibility**: Angular 17+ with TypeScript 5.5+. Angular 21+ recommended for best experience. Works alongside Angular's native signal forms—use both where appropriate.

## Quick start

```typescript
import { Component } from '@angular/core';
import { createFormTree, required, email } from '@signaltree/ng-forms';

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

  // Type is inferred from initial values - no interface needed!
  profile = createFormTree(
    {
      name: '',
      email: '',
      marketing: false,
    },
    {
      persistKey: 'profile-form',
      storage: this.storage,
      fieldConfigs: {
        name: { validators: [required('Name is required')] },
        email: {
          validators: [required(), email()],
          debounceMs: 150,
        },
      },
    }
  );

  async save() {
    await this.profile.submit(async (values) => {
      // values is typed as { name: string; email: string; marketing: boolean }
      console.log('Saving profile', values);
    });
  }
}
```

The returned `FormTree` exposes:

- `form`: Angular `TypedFormGroup<T>` for templates and directives (fully typed!)
- `$` / `state`: signal-backed access to individual fields
- `errors`, `asyncErrors`, `valid`, `dirty`, `submitting`: writable signals for UI state
- Helpers such as `setValue`, `setValues`, `reset`, `validate`, and `submit`

## Type Inference

`createFormTree()` leverages recursive type inference—types flow from initial values:

```typescript
// ✅ Simple case: types inferred automatically
const form = createFormTree({
  name: '',           // string
  age: 0,             // number
  active: false,      // boolean
});

form.$.name();        // string
form.$.age();         // number
form.form.controls.name;  // FormControl<string>
```

### Union Types Need Assertions

When a field can be one of several specific values, TypeScript widens the inferred type to `string`. Use inline type assertions to preserve narrowness:

```typescript
// ❌ Without assertion: resolution is inferred as string
const form = createFormTree({
  resolution: 'PENDING',  // Inferred as string, not the union
});

// ✅ With assertion: resolution is the exact union type
const form = createFormTree({
  resolution: 'PENDING' as 'PENDING' | 'APPROVED' | 'REJECTED',
  category: null as CategoryType | null,
  items: [] as string[],
});
```

### TypedFormGroup

The `form` property returns `TypedFormGroup<T>`, which recursively maps your form shape to Angular controls:

```typescript
type TypedFormGroup<T> = FormGroup<{
  [K in keyof T]: T[K] extends unknown[]
    ? FormArray<FormControl<T[K][number]>>
    : T[K] extends object
      ? FormGroup<...>  // Nested objects become nested FormGroups
      : FormControl<T[K]>
}>;

// Result: full autocomplete and type checking
const form = createFormTree({ user: { name: '', email: '' } });
form.form.controls.user.controls.name.value;  // string
```

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
      'shipping.zip': { validators: [(v) => /^\d{5}$/.test(String(v)) ? null : 'Invalid ZIP'] },
      'payment.card': { validators: [(v) => /^\d{13,19}$/.test(String(v)) ? null : 'Invalid card'], debounceMs: 300 }
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
    'preferences.*': { validators: [required()] },
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

| Scenario                                   | Recommendation                           |
| ------------------------------------------ | ---------------------------------------- |
| Login form (2-3 fields)                    | ✅ Angular 21 `FormField`                |
| Search bar with filters                    | ✅ Angular 21 `FormField`                |
| User profile with nested address           | ✅ **ng-forms** (tree structure)         |
| Checkout flow (shipping + payment + items) | ✅ **ng-forms** (persistence + wizard)   |
| Multi-step onboarding (5+ steps)           | ✅ **ng-forms** (wizard API)             |
| Form with auto-save drafts                 | ✅ **ng-forms** (built-in persistence)   |
| Complex editor with undo/redo              | ✅ **ng-forms** (history tracking)       |
| Migrating from reactive forms              | ✅ **ng-forms** (FormGroup bridge)       |
| Dynamic form with conditional fields       | ✅ **ng-forms** (conditionals config)    |
| Form synced with global app state          | ✅ **ng-forms** (SignalTree integration) |

**Rule of thumb**: If your form data is a nested object or needs workflow features (persistence/wizards/history), use ng-forms. For simple flat forms, Angular 21's native signal forms are perfect.

## Migration from createFormTree()

`createFormTree()` is deprecated in favor of the composable `form()` + `formBridge()` pattern.

### Before (deprecated)

```typescript
import { createFormTree, email } from '@signaltree/ng-forms';

const form = createFormTree(
  {
    name: '',
    email: '',
  },
  {
    validators: { email: email() },
    persistKey: 'profile-form',
  }
);

// Access
form.$.name.set('John');
form.form; // FormGroup
```

### After (recommended)

```typescript
import { signalTree, form } from '@signaltree/core';
import { formBridge, email } from '@signaltree/ng-forms';

const tree = signalTree({
  profile: form({
    initial: { name: '', email: '' },
    validators: { email: email() },
    persist: 'profile-form',
  }),
}).with(formBridge());

// Access
tree.$.profile.$.name.set('John');
tree.getAngularForm('profile')?.formGroup; // FormGroup
// Or: (tree.$.profile as any).formGroup
```

### Key differences

| Aspect               | createFormTree()        | form() + formBridge()  |
| -------------------- | ----------------------- | ---------------------------- |
| **Standalone**       | Always needs Angular    | form() works without Angular |
| **Tree integration** | Separate from app state | Lives in your main tree      |
| **DevTools**         | Separate                | Inherits tree DevTools       |
| **Composability**    | Limited                 | Add enhancers freely         |
| **Tree-shaking**     | All-or-nothing          | Only what you use            |

### Migration steps

1. Move form state into your SignalTree using `form()` marker
2. Add `.with(formBridge())` to your tree
3. Update access patterns: `form.$.field` → `tree.$.formName.$.field`
4. Update FormGroup access: `form.form` → `tree.getAngularForm('path')?.formGroup`

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

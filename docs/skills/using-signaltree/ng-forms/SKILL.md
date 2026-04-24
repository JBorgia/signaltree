---
name: signaltree-ng-forms
description: Guides AI agents integrating Angular reactive forms with SignalTree via @signaltree/ng-forms. Covers FormGroup ↔ signal bidirectional sync, validators, conditional fields, persistence, undo/redo, and multi-step wizards. Triggers on @signaltree/ng-forms, Angular reactive forms, FormGroup, createFormTree, form() marker, formBridge, signal forms, FormControl, FormArray, form validators, wizard forms.
---

# Using @signaltree/ng-forms

Use when an Angular component needs both a SignalTree-backed state slice (reactive in templates/computed/effect) and a native Angular `FormGroup`/`FormControl` for `ReactiveFormsModule`, third-party UI libs, or `ControlValueAccessor` interop.

Install:

```bash
npm install @signaltree/core @signaltree/ng-forms
```

Peer: `@angular/core ^20`, `@angular/forms ^20`, `rxjs ^7`.

Two patterns — choose one:
1. **Pattern B: `form()` marker + `formBridge()`** — recommended for new code. Form is one slice of a larger tree.
2. **Pattern A: `createFormTree()`** — when entire component is a form and you want all helpers on one object. Emits dev-only deprecation note; fully functional.

Pattern A — `createFormTree` (full example with validators, async validation, conditionals, persistence):

```ts
import { createFormTree, email, minLength, pattern, required } from '@signaltree/ng-forms';

interface ProfileForm extends Record<string, unknown> {
  name: string; email: string; role: string; company: { name: string; size: string }
}

class ProfileComponent {
  emailAvailabilityValidator: any = null;

  readonly profile = createFormTree<ProfileForm>(
    { name: '', email: '', role: 'individual', company: { name: '', size: '1-10' } },
    {
      persistKey: 'profile-form',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      validationBatchMs: 120,            // coalesce validation results (80–150ms for many async validators)
      fieldConfigs: {
        name: { validators: [required(), minLength(3)] },
        email: {
          validators: [required(), email()],
          asyncValidators: [this.emailAvailabilityValidator],
          debounceMs: 180,
        },
        'company.name': { validators: [pattern(/^[A-Za-z0-9 .,'&-]{2,}$/)] },
      },
      conditionals: [
        { when: (v) => v.role === 'manager', fields: ['company.name'] },
      ],
    }
  );

  async save() {
    try {
      await this.profile.submit(async (values) => { /* typed ProfileForm */ });
    } catch { /* FormValidationError thrown on validation failure */ }
  }
}
```

Bind template: `[formGroup]="profile.form"`. Read signal: `profile.$.name()`. Read error: `profile.getFieldError('email')()`.

Pattern B — `form()` marker + `formBridge()`:

```ts
import { form, FormSignal, signalTree, validators } from '@signaltree/core';
import { formBridge } from '@signaltree/ng-forms';

const store = signalTree({
  contact: form<ContactForm>({
    initial: { name: '', email: '', message: '' },
    validators: {
      name: validators.required('Name is required'),
      email: [validators.required(), validators.email()],
      message: [validators.required(), validators.minLength(10)],
    },
  }),
}).with(formBridge());

const bridge = store.getAngularForm('contact');
// bridge?.formGroup → FormGroup; bridge?.formControl('email') → FormControl
```

`formBridge()` auto-discovers all `form()` markers in the tree, including nested paths (`tree.getAngularForm('user.profile')`).

Pattern C — wizard via `form()` marker:

```ts
import { form, signalTree } from '@signaltree/core';

interface SignupForm extends Record<string, unknown> {
  email: string; password: string; firstName: string; lastName: string
}

const tree = signalTree({
  signup: form<SignupForm>({
    initial: { email: '', password: '', firstName: '', lastName: '' },
    wizard: {
      steps: ['credentials', 'profile'],
      stepFields: { credentials: ['email', 'password'], profile: ['firstName', 'lastName'] },
    },
  }),
});
// tree.$.signup.wizard: next(), prev(), goTo(step), currentStep, isLastStep
```

See `WizardConfig` and `FormWizard` in `@signaltree/core` for full shape.

Pattern D — undo/redo:

```ts
import { createFormTree } from '@signaltree/ng-forms';
import { withFormHistory } from '@signaltree/ng-forms';

interface ContactForm extends Record<string, unknown> { name: string; email: string }
const formTree = createFormTree<ContactForm>({ name: '', email: '' });

const formWithHistory = withFormHistory(formTree, { capacity: 20 });
formWithHistory.undo();
formWithHistory.redo();
formWithHistory.history().past.length;
```

Key contracts:
- Conditional fields: `when` predicate `false` → Angular control disabled + excluded from validation. Persisted state respects condition on hydration.
- Persistence: `persistKey` + `storage` (any `Storage`-shaped object). `persistDebounceMs` defaults to 100ms. Pass `undefined` for `storage` in SSR.
- `validationBatchMs: 0` = instant feedback; non-zero = coalesce for async validators.
- Field paths: dotted strings (`'company.name'`). `FormArray` entries use numeric segments (`'phoneNumbers.0.value'`).
- `SIGNAL_FORM_DIRECTIVES` exported for directive-based binding in `imports:` arrays.
- Don't call `createFormTree` outside an injection context without passing `destroyRef` explicitly.
- `FormGroup` is source of truth for `dirty`/`touched`; don't write them directly on the signal. Call `markAsTouched()` on the control.
- Arrays: use `.push`, `.removeAt`, `.setAt`, `.insertAt`, `.move`, `.clear` — don't use `.set([...])` for per-item updates; breaks `FormArray` sync.
- `required()` treats `false`, `0`, `''` as missing. For boolean-must-be-true (accept terms), write a custom `FieldValidator`.

Gotchas:
- `FormValidationError` thrown from `submit()` — always wrap in `try`/`catch`.
- `dirty`/`touched` from signal tree = mirrored value; write via Angular control methods only.
- Arrays: use mutation methods, not `.set([...])`.
- `required()` won't work for boolean-must-be-true; use a custom validator.

Related: `using-signaltree` (root), `spec-auditing`, `compression`

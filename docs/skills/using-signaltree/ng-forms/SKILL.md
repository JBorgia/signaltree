---
name: signaltree-ng-forms
description: Guides AI agents integrating Angular reactive forms with SignalTree via @signaltree/ng-forms. Covers FormGroup ↔ signal bidirectional sync, validators, conditional fields, persistence, undo/redo, and multi-step wizards. Triggers on @signaltree/ng-forms, Angular reactive forms, FormGroup, createFormTree, form() marker, formBridge, signal forms, FormControl, FormArray, form validators, wizard forms.
---

# Using @signaltree/ng-forms

## When to use this package

Reach for `@signaltree/ng-forms` whenever an Angular component needs both (a) a SignalTree-backed state slice that stays reactive in templates and computed/effect code and (b) a native Angular `FormGroup` / `FormControl` for template-driven validation, `ReactiveFormsModule` directives, third-party UI libraries, or `ControlValueAccessor` interop. The package keeps the signal tree and the Angular form fully bidirectional: writes on either side propagate to the other without manual subscriptions. It is complementary to Angular's built-in signal forms — you only need ng-forms when you must speak the existing `AbstractControl` API.

## Install

```bash
npm install @signaltree/core @signaltree/ng-forms
```

Peer range (from the package's `peerDependencies`): `@angular/core ^20`, `@angular/forms ^20`, `rxjs ^7`, `@signaltree/core` (workspace-linked, pulled in via `@signaltree/core`). No separate runtime install is required.

## Mental model

There are two idiomatic shapes, and both ship from the same package:

1. **`form()` marker + `formBridge()` enhancer** (recommended for new code). You define the form in your tree with the `form()` marker from `@signaltree/core`, then `.with(formBridge())` attaches an Angular FormGroup mirror. Each form slice stays a first-class signal; the FormGroup is discovered via `tree.getAngularForm(path)`.
2. **`createFormTree()`** (mature, still supported). A single call that returns an object exposing both the tree (`.$` / `.state`) and the Angular `FormGroup` (`.form`), plus helpers like `submit`, `reset`, `validate`, `fieldErrors`. This is the shape most current SignalTree demos use and remains fully functional, though the package emits a dev-only deprecation note pointing to the marker pattern.

Choose marker + bridge when the form is one slice of a larger tree. Choose `createFormTree` when the entire component is a form and you want all helpers on one object. Validators, conditional fields, persistence, and history work with both shapes.

## Core usage

### Pattern A — `createFormTree` with validators, async validation, conditionals, and persistence

```ts
import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  createFormTree,
  email,
  minLength,
  pattern,
  required,
} from '@signaltree/ng-forms';

interface ProfileForm extends Record<string, unknown> {
  name: string;
  email: string;
  role: 'individual' | 'manager';
  company: { name: string; size: '1-10' | '11-50' | '51-250' | '251+' };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  private readonly storage =
    typeof window !== 'undefined' ? window.localStorage : undefined;

  private readonly emailAvailabilityValidator = async (
    value: unknown
  ): Promise<string | null> => {
    const emailValue = String(value ?? '').trim().toLowerCase();
    if (!emailValue) return null;
    await new Promise((r) => setTimeout(r, 350));
    return emailValue.endsWith('@example.dev')
      ? 'example.dev is reserved for docs'
      : null;
  };

  readonly profile = createFormTree<ProfileForm>(
    {
      name: '',
      email: '',
      role: 'individual',
      company: { name: '', size: '1-10' },
    },
    {
      persistKey: 'profile-form',
      storage: this.storage,
      validationBatchMs: 120,
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
      await this.profile.submit(async (values) => {
        // Typed `values: ProfileForm`. Runs after sync + async validation.
        await fetch('/api/profile', {
          method: 'POST',
          body: JSON.stringify(values),
        });
      });
    } catch {
      // FormValidationError is thrown if validation fails.
    }
  }
}
```

Bind the template with `[formGroup]="profile.form"` exactly like any reactive form. `profile.$.name()` reads the latest signal value; `profile.getFieldError('email')()` returns the current synchronous error string.

### Pattern B — `form()` marker + `formBridge()`

```ts
import { form, FormSignal, signalTree, validators } from '@signaltree/core';
import { formBridge } from '@signaltree/ng-forms';

interface ContactForm {
  [key: string]: unknown;
  name: string;
  email: string;
  message: string;
}

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

// Grab the typed FormSignal for ergonomic access
const contactForm = store.$.contact as unknown as FormSignal<ContactForm>;

// Access the Angular FormGroup when you need to hand it to ReactiveFormsModule
const bridge = store.getAngularForm('contact');
// bridge?.formGroup is a FormGroup; bridge?.formControl('email') is a FormControl
```

### Pattern C — multi-step wizard via the `form()` marker

Multi-step wizards are a first-class feature of the core `form()` marker's
`FormConfig.wizard`. The materialised form carries a `wizard` object you can
use to navigate steps and validate per step:

```ts
import { signalTree, form } from '@signaltree/core';

interface SignupForm extends Record<string, unknown> {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const tree = signalTree({
  signup: form<SignupForm>({
    initial: { email: '', password: '', firstName: '', lastName: '' },
    wizard: {
      steps: ['credentials', 'profile'],
      stepFields: {
        credentials: ['email', 'password'],
        profile: ['firstName', 'lastName'],
      },
    },
  }),
});

// tree.$.signup is a FormSignal<SignupForm>; the wizard navigation lives on
// the materialised form marker. Typical navigation helpers: `next()`,
// `prev()`, `goTo(step)`, `currentStep`, `isLastStep`.
```

See `WizardConfig` and `FormWizard` in `@signaltree/core` for the full shape.

### Pattern D — undo/redo

```ts
import { withFormHistory } from '@signaltree/ng-forms';

const form = createFormTree({ title: '', body: '' });
const formWithHistory = withFormHistory(form, { capacity: 20 });

formWithHistory.undo();
formWithHistory.redo();
formWithHistory.history().past.length; // number of recorded states
```

## Advanced / less-obvious

- **Conditional fields disable AND hide.** Listing `'company.name'` under `conditionals` with `when: (v) => v.role === 'manager'` automatically disables the Angular control and excludes it from validation when the predicate is false. Persisted state respects the condition on hydration, so a form restored with `role: 'individual'` will not error on an empty `company.name`.
- **Persistence is opt-in and debounced.** Set `persistKey` + `storage` to round-trip values through any `Storage`-shaped object. `persistDebounceMs` (default 100) batches writes so rapid typing does not thrash `localStorage`. In SSR, pass `undefined` for `storage` to skip persistence cleanly.
- **`validationBatchMs`** coalesces validation-result recomputation. Set it to a small non-zero value (e.g., 80–150ms) for forms with many async validators to avoid flicker in error UI during fast typing; leave it at `0` for instant feedback.
- **Field paths are dotted strings**, not nested objects. `fieldConfigs['company.name']` and `profile.getFieldError('company.name')` both work. `FormArray` entries use numeric segments: `'phoneNumbers.0.value'`.
- **`formBridge()` auto-discovers `form()` markers** anywhere in the tree. Nested forms under `tree.$.user.profile` work with no extra configuration — call `tree.getAngularForm('user.profile')`.
- **`SIGNAL_FORM_DIRECTIVES`** is exported from the package as a convenience bundle for `imports:` arrays when you prefer directive-based binding over `ReactiveFormsModule`.

## Gotchas

- `FormValidationError` is thrown from `submit()` when validation fails; always wrap calls in `try`/`catch` or check `form.valid()` first.
- The Angular `FormGroup` is the source of truth for `dirty` / `touched`; reading those from the signal tree gives the mirrored value but writing to them directly is not supported — call `markAsTouched()` on the control.
- Do not call `createFormTree` outside an injection context unless you pass `destroyRef` explicitly; the package uses `DestroyRef` for subscription cleanup.
- Arrays in the form state are replaced with enhanced array signals (`.push`, `.removeAt`, `.setAt`, `.insertAt`, `.move`, `.clear`). Use those instead of `.set([...])` for per-item updates — they keep the `FormArray` in lockstep.
- The `required()` validator treats `false`, `0`, and `''` as missing. For boolean-must-be-true (e.g., "accept terms"), write a custom `FieldValidator`.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.

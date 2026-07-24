import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormField, MinValidationError } from '@angular/forms/signals';
import { form, signalTree, validators } from '@signaltree/core';
import { signalForm } from '@signaltree/ng-forms/signals';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

import {
  CodeTabsComponent,
  type CodeFile,
  ExampleComponent,
} from '../../examples/shared/components/example-shell';

interface Profile extends Record<string, unknown> {
  name: string;
  email: string;
}

interface Account {
  username: string;
  age: number;
}

interface AgeCheck extends Record<string, unknown> {
  age: number;
}

/**
 * Angular 22 Signal Forms × SignalTree.
 *
 * One entry point — `signalForm()` — with two call shapes, both live on
 * this page:
 *  1. `signalForm(marker)` — a `form()` marker becomes a Signal Forms
 *     `FieldTree` sharing the marker's values signal as its model.
 *  2. `signalForm(tree, rootPath, subtree)` — `@signaltree/schema`
 *     registrations (Zod here) auto-wire into a FieldTree via
 *     `validateStandardSchema`.
 */
@Component({
  selector: 'app-signal-forms-demo',
  standalone: true,
  imports: [CommonModule, FormField, ExampleComponent, CodeTabsComponent, RouterModule],
  templateUrl: './signal-forms-demo.component.html',
  styleUrl: './signal-forms-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalFormsDemoComponent {
  private readonly injector = inject(Injector);

  // ── 1. form() marker ↔ FieldTree ─────────────────────────────────────────
  readonly tree = signalTree({
    onboarding: {
      profile: form<Profile>({
        initial: { name: '', email: '' },
        validators: {
          name: validators.required('Name is required'),
          email: [
            validators.required('Email is required'),
            validators.email('Not a valid email'),
          ],
        },
      }),
    },
  });

  readonly profile = signalForm(this.tree.$.onboarding.profile, {
    injector: this.injector,
    // Explicit (not left to default) so the one-time nativeErrors advisory
    // stays quiet — this page deliberately shows both shapes side by side.
    nativeErrors: false,
  });

  // ── 1b. nativeErrors: true — branded Angular validation errors ───────────
  readonly nativeTree = signalTree({
    account: form<AgeCheck>({
      initial: { age: 10 },
      validators: {
        age: validators.min(18, 'Must be at least 18'),
      },
    }),
  });

  readonly nativeAccount = signalForm(this.nativeTree.$.account, {
    injector: this.injector,
    nativeErrors: true,
  });

  // The branded error IS a real class instance — `instanceof` genuinely
  // holds, and `.min` is a typed property (not parsed out of a message
  // string).
  readonly nativeAgeError = computed(() => this.nativeAccount.age().errors()[0]);
  readonly isNativeMinError = computed(
    () => this.nativeAgeError() instanceof MinValidationError
  );
  readonly nativeMinValue = computed(() => {
    const err = this.nativeAgeError();
    return err instanceof MinValidationError ? err.min : null;
  });

  // ── 2. schema registrations ↔ FieldTree ──────────────────────────────────
  readonly schemaTree = signalTree({
    account: { username: '', age: 0 } as Account,
  }).with(
    schemas({
      schemas: {
        'account.username': z
          .string()
          .min(3, 'Username needs at least 3 characters'),
        'account.age': z.coerce
          .number()
          .min(13, 'Must be at least 13')
          .max(120, 'Must be at most 120'),
      },
    })
  );

  readonly account = signalForm<Account>(
    this.schemaTree,
    'account',
    this.schemaTree.$.account
  );

  // Marker-side write to prove the FieldTree and marker share one model
  fillFromMarker(): void {
    this.tree.$.onboarding.profile.patch({
      name: 'Ada Lovelace',
      email: 'ada@analytical.engine',
    });
  }

  resetProfile(): void {
    this.tree.$.onboarding.profile.reset();
  }

  readonly markerCode: CodeFile[] = [
    {
      label: 'marker-bridge.ts',
      language: 'typescript',
      source: `import { form, signalTree, validators } from '@signaltree/core';
import { signalForm } from '@signaltree/ng-forms/signals';
import { RouterModule } from '@angular/router';
import { FormField } from '@angular/forms/signals';

const tree = signalTree({
  onboarding: {
    profile: form<Profile>({
      initial: { name: '', email: '' },
      validators: {
        name: validators.required('Name is required'),
        email: [validators.required(), validators.email()],
      },
    }),
  },
});

// FieldTree whose model IS the marker's values signal
readonly profile = signalForm(tree.$.onboarding.profile);

// Template: <input [formField]="profile.name" />
// Both APIs stay live:
//   profile.email().errors()                    // Signal Forms side
//   tree.$.onboarding.profile.valid()           // marker side`,
    },
  ];

  readonly nativeErrorsCode: CodeFile[] = [
    {
      label: 'native-errors.ts',
      language: 'typescript',
      source: `import { MinValidationError } from '@angular/forms/signals';
import { form, signalTree, validators } from '@signaltree/core';
import { signalForm } from '@signaltree/ng-forms/signals';

const tree = signalTree({
  account: form<{ age: number }>({
    initial: { age: 10 },
    validators: { age: validators.min(18, 'Must be at least 18') },
  }),
});

// nativeErrors: true → built-in validator failures are Angular's BRANDED
// error classes, not plain { kind, message } objects.
const account = signalForm(tree.$.account, { nativeErrors: true });

const err = account.age().errors()[0];
err.kind;                          // 'min'
err instanceof MinValidationError; // true — a real branded class instance
err.min;                           // 18 — typed constraint, not string-parsed`,
    },
  ];

  readonly schemaCode: CodeFile[] = [
    {
      label: 'schema-bridge.ts',
      language: 'typescript',
      source: `import { signalTree } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { signalForm } from '@signaltree/ng-forms/signals';
import { z } from 'zod';

const tree = signalTree({
  account: { username: '', age: 0 },
}).with(
  schemas({
    schemas: {
      'account.username': z.string().min(3),
      'account.age': z.coerce.number().min(13).max(120),
    },
  })
);

// FieldTree with every registered schema auto-applied
readonly account = signalForm<Account>(
  tree, 'account', tree.$.account
);`,
    },
  ];
}

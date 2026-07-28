import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  disabled,
  form as ngForm,
  FormField,
  hidden,
  MinValidationError,
  required,
  schema,
  validate,
} from '@angular/forms/signals';
import { form, signalTree, trackHistory, validators } from '@signaltree/core';
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

interface TaskDraft extends Record<string, unknown> {
  title: string;
  priority: 'low' | 'medium' | 'high';
}

interface TeamPlan extends Record<string, unknown> {
  plan: 'free' | 'pro';
  seats: number;
  promoCode: string;
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

  // ── 0. trackHistory() — marker-FREE undo/redo over a raw Signal Forms
  //      model (13.1.0). No form() marker anywhere below: `taskModel` is a
  //      plain WritableSignal, `taskFieldTree` is Angular's own `form()`.
  //      trackHistory() attaches undo/redo directly to the model signal. ──
  readonly taskModel = signal<TaskDraft>({ title: '', priority: 'low' });

  readonly taskFieldTree = ngForm(this.taskModel, (p) => {
    required(p.title, { message: 'Title is required' });
  });

  readonly taskHistory = trackHistory(this.taskModel, {
    capacity: 25,
    injector: this.injector,
  });

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
    // Explicit opt-OUT: the default is branded since v14, and this page
    // deliberately shows both shapes side by side (see nativeAccount below).
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

  // ── 1c. signalForm(marker, { schema }) — a cached Angular schema() adds
  //       disabled/hidden/cross-field validate rules a marker's `validators`
  //       config can't express, composed on top of the marker-backed
  //       FieldTree (13.1.0). The marker stays the model/history authority;
  //       the schema owns the field RULES. ──────────────────────────────────
  readonly planTree = signalTree({
    team: form<TeamPlan>({
      initial: { plan: 'free', seats: 1, promoCode: '' },
    }),
  });

  private readonly planSchema = schema<TeamPlan>((p) => {
    disabled(p.seats, (ctx) => ctx.valueOf(p.plan) === 'free');
    hidden(p.promoCode, (ctx) => ctx.valueOf(p.plan) !== 'pro');
    validate(p.seats, (ctx) =>
      ctx.value() >= 1 ? undefined : { kind: 'min', message: 'At least 1 seat' }
    );
  });

  readonly planForm = signalForm(this.planTree.$.team, {
    injector: this.injector,
    schema: this.planSchema,
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

// Since v14 this is the DEFAULT: built-in validator failures are Angular's
// BRANDED error classes, not plain { kind, message } objects. (Passed
// explicitly here for clarity; { nativeErrors: false } opts back out.)
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

  readonly trackHistoryCode: CodeFile[] = [
    {
      label: 'track-history.ts',
      language: 'typescript',
      source: `import { signal, inject, Injector } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { trackHistory } from '@signaltree/core';

// Plain Signal Forms — no SignalTree form() marker anywhere.
const taskModel = signal({ title: '', priority: 'low' as const });
const taskForm = form(taskModel, (p) => {
  required(p.title, { message: 'Title is required' });
});

// Undo/redo attaches directly to the model signal. No marker required —
// replaces hand-rolled @ngrx-style change trackers with one call.
const history = trackHistory(taskModel, {
  capacity: 25,
  injector: inject(Injector), // or call trackHistory() in injection context
});

// Template: <input [formField]="taskForm.title" />
history.undo();          // reverts the last edit; the FieldTree reflects it
history.redo();
history.clearHistory();
history.canUndo();       // Signal<boolean>
history.canRedo();       // Signal<boolean>
history.history();       // Signal<{ past, present, future }>`,
    },
  ];

  readonly schemaOptionCode: CodeFile[] = [
    {
      label: 'schema-option.ts',
      language: 'typescript',
      source: `import { disabled, hidden, schema, validate } from '@angular/forms/signals';
import { form, signalTree } from '@signaltree/core';
import { signalForm } from '@signaltree/ng-forms/signals';

// The marker carries ONLY the model (and, optionally, history()) —
// no validators config. A rich Angular schema supplies the field RULES.
const tree = signalTree({
  team: form<TeamPlan>({
    initial: { plan: 'free', seats: 1, promoCode: '' },
  }),
});

const planSchema = schema<TeamPlan>((p) => {
  disabled(p.seats, (ctx) => ctx.valueOf(p.plan) === 'free');
  hidden(p.promoCode, (ctx) => ctx.valueOf(p.plan) !== 'pro');
  validate(p.seats, (ctx) =>
    ctx.value() >= 1 ? undefined : { kind: 'min', message: 'At least 1 seat' }
  );
});

// Marker validators (if any) run first, then this schema — applied via
// apply() on top of the marker-backed FieldTree, over the SAME shared model.
const planForm = signalForm(tree.$.team, { schema: planSchema });

planForm.seats().disabled();   // true while plan === 'free'
planForm.promoCode().hidden(); // true while plan !== 'pro'`,
    },
  ];

  readonly webMcpCode: CodeFile[] = [
    {
      label: 'webmcp.ts',
      language: 'typescript',
      source: `// app.config.ts — register the experimental WebMCP forms provider
import { provideExperimentalWebMcpForms } from '@angular/forms/signals';

export const appConfig: ApplicationConfig = {
  providers: [provideExperimentalWebMcpForms(), /* ... */],
};

// component.ts — signalForm() forwards experimentalWebMcpTool verbatim to
// Angular's form(model, schema, options), same as name/submission.
import { form, signalTree } from '@signaltree/core';
import { signalForm } from '@signaltree/ng-forms/signals';

const tree = signalTree({
  profile: form<Profile>({ initial: { name: '', email: '' } }),
});

const profileForm = signalForm(tree.$.profile, {
  name: 'profileForm',
  experimentalWebMcpTool: {
    name: 'profileTool',
    description: 'Edit the user profile',
  },
});

// An MCP-connected AI agent can now discover and drive this form — read its
// fields, set values, and submit — without app-specific glue.
// Experimental; requires Angular 22+.`,
    },
  ];
}

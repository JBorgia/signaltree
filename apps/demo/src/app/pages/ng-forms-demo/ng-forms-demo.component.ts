import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { createFormTree, email, FormValidationError, minLength, pattern, required } from '@signaltree/ng-forms';

type PhoneLabel = 'work' | 'personal' | 'support';

interface ContactNumber {
  label: PhoneLabel;
  value: string;
}

interface ProfileForm extends Record<string, unknown> {
  name: string;
  email: string;
  role: 'individual' | 'manager';
  receiveUpdates: boolean;
  company: {
    name: string;
    size: '1-10' | '11-50' | '51-250' | '251+';
  };
  preferences: {
    newsletter: boolean;
    productUpdates: boolean;
    betaProgram: boolean;
  };
  phoneNumbers: ContactNumber[];
  notes: string;
}

@Component({
  selector: 'app-ng-forms-demo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ng-forms-demo.component.html',
  styleUrls: ['./ng-forms-demo.component.scss'],
})
export class NgFormsDemoComponent {
  private readonly storage =
    typeof window !== 'undefined' ? window.localStorage : undefined;

  private readonly emailAvailabilityValidator = async (
    value: unknown
  ): Promise<string | null> => {
    const emailValue = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!emailValue) {
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));

    if (emailValue.endsWith('@example.dev')) {
      return 'example.dev addresses are reserved for documentation samples';
    }

    if (emailValue.endsWith('@test.invalid')) {
      return 'test.invalid is blocked for demo purposes';
    }

    return null;
  };

  readonly phoneLabelOptions: PhoneLabel[] = ['work', 'personal', 'support'];
  readonly companySizeOptions: ProfileForm['company']['size'][] = [
    '1-10',
    '11-50',
    '51-250',
    '251+',
  ];

  readonly profile = createFormTree<ProfileForm>(
    {
      name: '',
      email: '',
      role: 'individual',
      receiveUpdates: true,
      company: {
        name: '',
        size: '1-10',
      },
      preferences: {
        newsletter: true,
        productUpdates: true,
        betaProgram: false,
      },
      phoneNumbers: [
        {
          label: 'work',
          value: '',
        },
      ],
      notes: '',
    },
    {
      persistKey: 'signaltree-ng-forms-demo',
      storage: this.storage,
      validationBatchMs: 120,
      fieldConfigs: {
        name: {
          validators: [
            required('Name is required'),
            minLength(3, 'Name must be at least 3 characters'),
          ],
        },
        email: {
          validators: [required(), email()],
          asyncValidators: [this.emailAvailabilityValidator],
          debounceMs: 180,
        },
        role: {
          validators: [required()],
        },
        'company.name': {
          validators: [
            required('Company name is required when managing a team'),
            minLength(2),
          ],
        },
        'company.size': {
          validators: [required('Select an approximate company size')],
        },
        'phoneNumbers.*.value': {
          validators: [
            required('Phone number is required'),
            pattern(/^[+\d ()-]{6,}$/),
          ],
        },
        notes: {
          validators: [
            minLength(10, 'Share at least 10 characters about your goals'),
          ],
        },
      },
      conditionals: [
        {
          when: (values) => values.role === 'manager',
          fields: ['company.name', 'company.size'],
        },
      ],
    }
  );

  readonly status = signal<
    'idle' | 'saving' | 'saved' | 'needs-attention' | 'error'
  >('idle');
  readonly lastSaved = signal<ProfileForm | null>(null);

  readonly errorEntries = computed(() =>
    Object.entries(this.profile.errors()).filter(([, message]) => !!message)
  );

  readonly asyncErrorEntries = computed(() =>
    Object.entries(this.profile.asyncErrors()).filter(
      ([, message]) => !!message
    )
  );

  readonly hasPendingAsync = computed(() =>
    Object.values(this.profile.asyncValidating()).some(Boolean)
  );

  readonly isManager = computed(() => this.profile.$.role() === 'manager');

  readonly completionPercent = computed(() => {
    const snapshot = this.profile.unwrap();
    const checks = [
      Boolean(snapshot.name?.trim()),
      Boolean(snapshot.email?.trim()),
      snapshot.role === 'individual' || Boolean(snapshot.company.name?.trim()),
      snapshot.role === 'individual' || Boolean(snapshot.company.size),
      snapshot.phoneNumbers.length > 0 &&
        snapshot.phoneNumbers.every((phone) => phone.value.trim().length >= 6),
      Boolean(snapshot.notes?.trim()),
    ];

    const score = checks.filter(Boolean).length;
    return Math.round((score / checks.length) * 100);
  });

  readonly preview = computed(() => {
    const errors = this.profile.errors();
    const asyncErrors = this.profile.asyncErrors();

    return JSON.stringify(
      {
        values: this.profile.unwrap(),
        valid: this.profile.valid(),
        dirty: this.profile.dirty(),
        submitting: this.profile.submitting(),
        asyncPending: this.profile.asyncValidating(),
        errors,
        asyncErrors,
        completionPercent: this.completionPercent(),
      },
      null,
      2
    );
  });

  readonly calloutCode = `import {
  createFormTree,
  required,
  email,
  minLength,
  pattern,
} from '@signaltree/ng-forms';

const profile = createFormTree({
  name: '',
  email: '',
  role: 'individual',
  phoneNumbers: [{ label: 'work', value: '' }],
}, {
  persistKey: 'team-onboarding',
  fieldConfigs: {
    name: [required(), minLength(3)],
    email: {
      validators: [required(), email()],
      asyncValidators: async (value) => {
        await new Promise((r) => setTimeout(r, 200));
        return String(value).endsWith('@example.dev')
          ? 'Reserved sample domain'
          : null;
      },
    },
    'phoneNumbers.*.value': [required(), pattern(/^[+0-9 ()-]{6,}$/u)],
  },
  conditionals: [
    {
      when: (values) => values.role === 'manager',
      fields: ['company.name', 'company.size'],
    },
  ],
});`;

  get phoneControls(): FormArray {
    return this.profile.form.get('phoneNumbers') as FormArray;
  }

  get nameError() {
    return this.profile.getFieldError('name')();
  }

  get emailError() {
    return this.profile.getFieldError('email')();
  }

  get submissionLabel() {
    if (this.status() === 'saving') {
      return 'Saving…';
    }
    if (this.hasPendingAsync()) {
      return 'Waiting for checks…';
    }
    if (this.status() === 'saved') {
      return 'Saved!';
    }
    if (this.status() === 'needs-attention') {
      return 'Fix validation errors';
    }
    return 'Save profile';
  }

  phoneError(index: number) {
    return this.profile.getFieldError(`phoneNumbers.${index}.value`)();
  }

  phoneAsyncError(index: number) {
    return this.profile.getFieldAsyncError(`phoneNumbers.${index}.value`)();
  }

  async save() {
    try {
      this.status.set('saving');

      await this.profile.submit(async (values) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        this.lastSaved.set(values);
      });

      this.status.set('saved');
      setTimeout(() => {
        if (this.status() === 'saved') {
          this.status.set('idle');
        }
      }, 2000);
    } catch (error) {
      if (error instanceof FormValidationError) {
        this.status.set('needs-attention');
        return;
      }

      console.error('Failed to submit form', error);
      this.status.set('error');
    }
  }

  async validateAll() {
    await this.profile.validate();
    this.status.set(this.profile.valid() ? 'idle' : 'needs-attention');
  }

  addPhoneNumber() {
    this.profile.$.phoneNumbers.update((phones) => [
      ...phones,
      { label: 'support', value: '' },
    ]);
  }

  removePhoneNumber(index: number) {
    if (this.phoneControls.length <= 1) {
      return;
    }
    this.profile.$.phoneNumbers.update((phones) =>
      phones.filter((_, phoneIndex) => phoneIndex !== index)
    );
  }

  reset() {
    this.profile.reset();
    this.status.set('idle');
    this.lastSaved.set(null);
  }

  clearStorage() {
    if (this.storage) {
      this.storage.removeItem('signaltree-ng-forms-demo');
      this.reset();
      this.status.set('idle');
    }
  }

  trackByIndex(index: number) {
    return index;
  }
}

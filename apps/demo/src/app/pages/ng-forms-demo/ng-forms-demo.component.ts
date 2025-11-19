import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { createFormTree, email, FormValidationError, required } from '@signaltree/ng-forms';

interface ProfileForm extends Record<string, unknown> {
  name: string;
  email: string;
  receiveUpdates: boolean;
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

  readonly profile = createFormTree<ProfileForm>(
    {
      name: '',
      email: '',
      receiveUpdates: true,
    },
    {
      persistKey: 'signaltree-ng-forms-demo',
      storage: this.storage,
      fieldConfigs: {
        name: {
          validators: [required('Name is required')],
        },
        email: {
          validators: [required(), email()],
          debounceMs: 150,
        },
      },
    }
  );

  readonly status = signal<
    'idle' | 'saving' | 'saved' | 'needs-attention' | 'error'
  >('idle');
  readonly lastSaved = signal<ProfileForm | null>(null);

  readonly preview = computed(() => {
    const errors = this.profile.errors();
    const asyncErrors = this.profile.asyncErrors();

    return JSON.stringify(
      {
        values: this.profile.unwrap(),
        valid: this.profile.valid(),
        dirty: this.profile.dirty(),
        submitting: this.profile.submitting(),
        errors,
        asyncErrors,
      },
      null,
      2
    );
  });

  readonly calloutCode = `import { createFormTree, email, required } from '@signaltree/ng-forms';

const checkout = createFormTree({
  email: '',
  marketingOptIn: false,
}, {
  fieldConfigs: {
    email: {
      validators: [required(), email()],
      debounceMs: 120,
    },
  },
  persistKey: 'checkout-draft',
});`;

  get nameError() {
    return this.profile.getFieldError('name')();
  }

  get emailError() {
    return this.profile.getFieldError('email')();
  }

  get submissionLabel() {
    switch (this.status()) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Saved!';
      case 'needs-attention':
        return 'Fix validation errors';
      default:
        return 'Save profile';
    }
  }

  async save() {
    try {
      if (!this.profile.valid()) {
        await this.profile.validate();
        this.status.set('needs-attention');
        return;
      }

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

      // Unexpected error – surface and keep the form interactive.
      console.error('Failed to submit form', error);
      this.status.set('error');
    }
  }

  reset() {
    this.profile.reset();
    this.status.set('idle');
    this.lastSaved.set(null);
  }
}

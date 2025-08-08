import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createFormTree, validators, FormTree } from '@signal-tree';

interface UserRegistrationForm extends Record<string, unknown> {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  agreeToTerms: boolean;
}

@Component({
  selector: 'app-form-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './form-validation.component.html',
  styleUrls: ['./form-validation.component.scss'],
})
export class FormValidationComponent {
  isCheckingUsername = false;
  isCheckingEmail = false;
  submissionLog: Array<{ timestamp: Date; action: string; status: string }> =
    [];

  Object = Object; // Expose Object to template

  // Form tree with smart progressive enhancement - auto-enabling validation!
  formTree: FormTree<UserRegistrationForm> =
    createFormTree<UserRegistrationForm>(
      {
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        dateOfBirth: '',
        agreeToTerms: false,
      },
      {
        validators: {
          username: (value: unknown) => {
            const strValue = value as string;
            if (!strValue) return 'Username is required';
            if (strValue.length < 3)
              return 'Username must be at least 3 characters';
            if (!/^[a-zA-Z0-9_]+$/.test(strValue))
              return 'Username can only contain letters, numbers, and underscores';
            return null;
          },

          email: validators.email(),

          password: (value: unknown) => {
            const strValue = value as string;
            if (!strValue) return 'Password is required';
            if (strValue.length < 8)
              return 'Password must be at least 8 characters';
            if (!/(?=.*[a-z])/.test(strValue))
              return 'Password must contain at least one lowercase letter';
            if (!/(?=.*[A-Z])/.test(strValue))
              return 'Password must contain at least one uppercase letter';
            if (!/(?=.*\d)/.test(strValue))
              return 'Password must contain at least one number';
            return null;
          },

          confirmPassword: (value: unknown) => {
            const strValue = value as string;
            if (!strValue) return 'Please confirm your password';

            // Get the current password value to compare
            const currentPassword = this.formTree.$.password();
            if (strValue !== currentPassword) {
              return 'Passwords do not match';
            }
            return null;
          },

          firstName: validators.required('First name is required'),
          lastName: validators.required('Last name is required'),

          dateOfBirth: (value: unknown) => {
            const strValue = value as string;
            if (!strValue) return 'Date of birth is required';
            const birthDate = new Date(strValue);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();
            if (age < 18) return 'You must be at least 18 years old';
            if (age > 120) return 'Please enter a valid date of birth';
            return null;
          },

          phoneNumber: (value: unknown) => {
            const strValue = value as string;
            if (
              strValue &&
              !/^[+]?[1-9][\d]{0,15}$/.test(strValue.replace(/[\s\-()]/g, ''))
            ) {
              return 'Please enter a valid phone number';
            }
            return null;
          },

          agreeToTerms: (value: unknown) => {
            const boolValue = value as boolean;
            return boolValue
              ? null
              : 'You must agree to the terms and conditions';
          },
        },

        asyncValidators: {
          username: async (value: unknown) => {
            const strValue = value as string;
            if (!strValue || strValue.length < 3) return null;

            this.isCheckingUsername = true;

            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 1000));

            this.isCheckingUsername = false;

            // Simulate some usernames being taken
            const takenUsernames = ['admin', 'test', 'user', 'demo', 'example'];
            return takenUsernames.includes(strValue.toLowerCase())
              ? 'Username is already taken'
              : null;
          },

          email: async (value: unknown) => {
            const strValue = value as string;
            if (!strValue || !strValue.includes('@')) return null;

            this.isCheckingEmail = true;

            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 800));

            this.isCheckingEmail = false;

            // Simulate some emails being taken
            const takenEmails = [
              'admin@example.com',
              'test@example.com',
              'user@example.com',
            ];
            return takenEmails.includes(strValue.toLowerCase())
              ? 'Email address is already registered'
              : null;
          },
        },
      }
    );

  constructor() {
    this.logAction(
      'Form tree initialized with smart progressive enhancement',
      'info'
    );
  }

  // Memoized form state summaries - auto-enabling!
  get formProgress() {
    return this.formTree.memoize('formProgress', () => {
      const fields = Object.keys(this.formTree.unwrap());
      const completed = fields.filter((field) => {
        const value = this.formTree.$[field as keyof UserRegistrationForm]();
        return value !== '' && value !== false;
      });

      return {
        total: fields.length,
        completed: completed.length,
        percentage: Math.round((completed.length / fields.length) * 100),
      };
    });
  }

  get validationSummary() {
    return this.formTree.memoize('validationSummary', () => {
      const errors = this.formTree.errors();
      const totalFields = Object.keys(this.formTree.unwrap()).length;
      const fieldsWithErrors = Object.keys(errors).length;

      return {
        totalFields,
        fieldsWithErrors,
        validFields: totalFields - fieldsWithErrors,
        isValid: fieldsWithErrors === 0,
      };
    });
  }

  async onSubmit() {
    try {
      this.logAction('Form submission started', 'info');

      await this.formTree.submit(async (values) => {
        // Simulate form submission with progress tracking
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log('Form submitted successfully:', values);
        this.logAction('Form submitted successfully', 'success');

        // Use batch update for resetting - auto-enabling!
        this.formTree.batchUpdate(() => {
          this.resetForm();
        });

        alert('Registration successful!');

        return { success: true };
      });
    } catch (error) {
      console.error('Form submission failed:', error);
      this.logAction('Form submission failed', 'error');
    }
  }

  async validateForm() {
    this.logAction('Manual validation triggered', 'info');
    await this.formTree.validate();

    // Clear validation summary cache to refresh
    this.formTree.clearCache(['validationSummary']);
  }

  // Batch update sample data - showcasing auto-enabling batching
  fillSampleData() {
    this.formTree.batchUpdate(() => {
      this.formTree.setValues({
        username: 'johndoe123',
        email: 'john.doe@example.com',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1 (555) 123-4567',
        dateOfBirth: '1990-01-15',
        agreeToTerms: true,
      });
    });

    this.logAction('Sample data filled with batch update', 'info');
    this.formTree.clearCache(); // Refresh all cached values
  }

  resetForm() {
    this.formTree.reset();
    this.logAction('Form reset', 'info');
    this.formTree.clearCache(); // Clear all cached values
  }

  markFieldAsTouched(field: string) {
    // Mark the field as touched in the form tree
    this.formTree.touched.update((t) => ({ ...t, [field]: true }));
    this.logAction(`Field ${field} marked as touched`, 'info');
  }

  async onUsernameChange() {
    const username = this.formTree.$.username();
    if (username && username.length >= 3) {
      await this.formTree.validate();
      this.formTree.invalidatePattern(['validationSummary', 'formProgress']);
    }
  }

  async onEmailChange() {
    const email = this.formTree.$.email();
    if (email && email.includes('@')) {
      await this.formTree.validate();
      this.formTree.invalidatePattern(['validationSummary']);
    }
  }

  async onPasswordChange() {
    // Validate both password and confirm password when password changes
    await this.formTree.validate('password');
    const confirmPassword = this.formTree.$.confirmPassword();
    if (confirmPassword) {
      await this.formTree.validate('confirmPassword');
    }
    this.formTree.invalidatePattern(['validationSummary']);
  }

  async onConfirmPasswordChange() {
    // Validate confirm password when it changes
    await this.formTree.validate('confirmPassword');
    this.formTree.invalidatePattern(['validationSummary']);
  }

  // Enhanced field validation with auto-enabling cache management
  hasFieldError(field: string): boolean {
    const error = this.formTree.getFieldError(field)();
    return !!error;
  }

  getFieldError(field: string): string | undefined {
    return this.formTree.getFieldError(field)();
  }

  hasAsyncFieldError(field: string): boolean {
    const asyncErrors = this.formTree.asyncErrors();
    return !!asyncErrors[field];
  }

  getAsyncFieldError(field: keyof UserRegistrationForm): string | undefined {
    const asyncErrors = this.formTree.asyncErrors();
    return asyncErrors[field];
  }

  // Clear form caches for performance demonstration
  clearFormCaches() {
    this.formTree.clearCache();
    this.logAction('All form caches cleared', 'info');
  }

  // Get form tree metrics to show auto-enabled features
  getFormMetrics() {
    const metrics = this.formTree.getMetrics();
    this.logAction('Form metrics retrieved', 'info');
    return metrics;
  }

  private logAction(action: string, status: 'info' | 'success' | 'error') {
    this.submissionLog.unshift({
      timestamp: new Date(),
      action,
      status,
    });

    // Keep only last 10 entries
    if (this.submissionLog.length > 10) {
      this.submissionLog = this.submissionLog.slice(0, 10);
    }
  }

  clearSubmissionLog() {
    this.submissionLog = [];
  }

  trackByIndex(index: number): number {
    return index;
  }
  getCurrentValues(): Partial<UserRegistrationForm> {
    const values = this.formTree.unwrap();
    // Don't show passwords in the display
    return {
      ...values,
      password: values.password ? '***' : '',
      confirmPassword: values.confirmPassword ? '***' : '',
    };
  }

  formTreeCode = `// Form Tree with Smart Progressive Enhancement
import { createFormTree, validators } from 'signal-tree';

// Auto-enabling validation and caching!
const formTree = createFormTree({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
}, {
  validators: {
    username: (value) => {
      if (!value) return 'Username is required';
      if (value.length < 3) return 'Too short';
      return null;
    },
    email: validators.email(),
    password: (value) => {
      if (!value) return 'Password required';
      if (value.length < 8) return 'Too short';
      return null;
    },
    confirmPassword: (value) => {
      const password = formTree.$.password();
      return value !== password ? 'Passwords do not match' : null;
    }
  },
  asyncValidators: {
    username: async (value) => {
      const response = await checkUsername(value);
      return response.exists ? 'Username taken' : null;
    }
  }
});

// Access with $ shorthand
formTree.$.username.set('newuser');

// Batch updates auto-enable
formTree.batchUpdate(() => {
  formTree.setValues({
    username: 'john',
    email: 'john@example.com'
  });
});

// Memoized validation summary
const summary = formTree.memoize('summary', () => ({
  isValid: Object.keys(formTree.errors()).length === 0,
  errorCount: Object.keys(formTree.errors()).length
}));`;
}

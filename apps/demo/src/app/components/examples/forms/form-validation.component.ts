import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold text-gray-800 mb-6">
        📝 Form Validation Demo
      </h1>

      <div class="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div class="flex items-center mb-2">
          <span class="text-orange-600 mr-2">💡</span>
          <h3 class="font-semibold text-orange-800">What This Demonstrates</h3>
        </div>
        <p class="text-orange-700 text-sm">
          Form trees provide comprehensive validation with synchronous and
          asynchronous validators, field-level error handling, and reactive form
          state management.
        </p>
      </div>

      <!-- Form Status Overview -->
      <div class="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="formTree.valid() ? 'text-green-600' : 'text-red-600'"
          >
            {{ formTree.valid() ? '✅' : '❌' }}
          </div>
          <div class="text-sm text-gray-600">Form Valid</div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="formTree.dirty() ? 'text-blue-600' : 'text-gray-400'"
          >
            {{ formTree.dirty() ? '📝' : '📄' }}
          </div>
          <div class="text-sm text-gray-600">
            {{ formTree.dirty() ? 'Modified' : 'Pristine' }}
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="
              formTree.submitting() ? 'text-yellow-600' : 'text-gray-400'
            "
          >
            {{ formTree.submitting() ? '⏳' : '💤' }}
          </div>
          <div class="text-sm text-gray-600">
            {{ formTree.submitting() ? 'Submitting' : 'Ready' }}
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div class="text-2xl text-purple-600 mb-2">
            {{ getErrorCount() }}
          </div>
          <div class="text-sm text-gray-600">Validation Errors</div>
        </div>
      </div>

      <!-- Registration Form -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-6">
          👤 User Registration Form
        </h2>

        <form (ngSubmit)="onSubmit()" class="space-y-6">
          <!-- Personal Information -->
          <div class="border-b border-gray-200 pb-6">
            <h3 class="text-lg font-medium text-gray-800 mb-4">
              Personal Information
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  for="firstName"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  First Name *
                </label>
                <input
                  id="firstName"
                  [(ngModel)]="formTree.state.firstName"
                  (blur)="markFieldAsTouched('firstName')"
                  name="firstName"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('firstName')"
                  [class.border-green-500]="
                    formTree.isFieldValid('firstName')()
                  "
                  placeholder="Enter your first name"
                />
                <div
                  *ngIf="hasFieldError('firstName')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('firstName') }}
                </div>
              </div>

              <div>
                <label
                  for="lastName"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Last Name *
                </label>
                <input
                  id="lastName"
                  [(ngModel)]="formTree.state.lastName"
                  (blur)="markFieldAsTouched('lastName')"
                  name="lastName"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('lastName')"
                  [class.border-green-500]="formTree.isFieldValid('lastName')()"
                  placeholder="Enter your last name"
                />
                <div
                  *ngIf="hasFieldError('lastName')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('lastName') }}
                </div>
              </div>

              <div>
                <label
                  for="dateOfBirth"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Date of Birth *
                </label>
                <input
                  id="dateOfBirth"
                  type="date"
                  [(ngModel)]="formTree.state.dateOfBirth"
                  (blur)="markFieldAsTouched('dateOfBirth')"
                  name="dateOfBirth"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('dateOfBirth')"
                  [class.border-green-500]="
                    formTree.isFieldValid('dateOfBirth')()
                  "
                />
                <div
                  *ngIf="hasFieldError('dateOfBirth')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('dateOfBirth') }}
                </div>
              </div>

              <div>
                <label
                  for="phoneNumber"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Phone Number
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  [(ngModel)]="formTree.state.phoneNumber"
                  (blur)="markFieldAsTouched('phoneNumber')"
                  name="phoneNumber"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('phoneNumber')"
                  [class.border-green-500]="
                    formTree.isFieldValid('phoneNumber')()
                  "
                  placeholder="+1 (555) 123-4567"
                />
                <div
                  *ngIf="hasFieldError('phoneNumber')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('phoneNumber') }}
                </div>
              </div>
            </div>
          </div>

          <!-- Account Information -->
          <div class="border-b border-gray-200 pb-6">
            <h3 class="text-lg font-medium text-gray-800 mb-4">
              Account Information
            </h3>

            <div class="space-y-4">
              <div>
                <label
                  for="username"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Username *
                  <span
                    *ngIf="isCheckingUsername"
                    class="text-blue-600 text-xs ml-1"
                  >
                    (checking availability...)
                  </span>
                </label>
                <input
                  id="username"
                  [(ngModel)]="formTree.state.username"
                  (blur)="markFieldAsTouched('username')"
                  (input)="onUsernameChange()"
                  name="username"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="
                    hasFieldError('username') || hasAsyncFieldError('username')
                  "
                  [class.border-green-500]="
                    formTree.isFieldValid('username')() &&
                    !hasAsyncFieldError('username')
                  "
                  placeholder="Choose a unique username"
                />
                <div
                  *ngIf="hasFieldError('username')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('username') }}
                </div>
                <div
                  *ngIf="hasAsyncFieldError('username')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getAsyncFieldError('username') }}
                </div>
              </div>

              <div>
                <label
                  for="email"
                  class="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email Address *
                  <span
                    *ngIf="isCheckingEmail"
                    class="text-blue-600 text-xs ml-1"
                  >
                    (checking availability...)
                  </span>
                </label>
                <input
                  id="email"
                  type="email"
                  [(ngModel)]="formTree.state.email"
                  (blur)="markFieldAsTouched('email')"
                  (input)="onEmailChange()"
                  name="email"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="
                    hasFieldError('email') || hasAsyncFieldError('email')
                  "
                  [class.border-green-500]="
                    formTree.isFieldValid('email')() &&
                    !hasAsyncFieldError('email')
                  "
                  placeholder="your.email@example.com"
                />
                <div
                  *ngIf="hasFieldError('email')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getFieldError('email') }}
                </div>
                <div
                  *ngIf="hasAsyncFieldError('email')"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ getAsyncFieldError('email') }}
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    for="password"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Password *
                  </label>
                  <input
                    id="password"
                    type="password"
                    [(ngModel)]="formTree.state.password"
                    (blur)="markFieldAsTouched('password')"
                    (input)="onPasswordChange()"
                    name="password"
                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    [class.border-red-500]="hasFieldError('password')"
                    [class.border-green-500]="
                      formTree.isFieldValid('password')()
                    "
                    placeholder="Choose a strong password"
                  />
                  <div
                    *ngIf="hasFieldError('password')"
                    class="mt-1 text-sm text-red-600"
                  >
                    {{ getFieldError('password') }}
                  </div>
                  <div class="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters with uppercase, lowercase, and
                    number
                  </div>
                </div>

                <div>
                  <label
                    for="confirmPassword"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Confirm Password *
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    [(ngModel)]="formTree.state.confirmPassword"
                    (blur)="markFieldAsTouched('confirmPassword')"
                    (input)="onConfirmPasswordChange()"
                    name="confirmPassword"
                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    [class.border-red-500]="hasFieldError('confirmPassword')"
                    [class.border-green-500]="
                      formTree.isFieldValid('confirmPassword')()
                    "
                    placeholder="Confirm your password"
                  />
                  <div
                    *ngIf="hasFieldError('confirmPassword')"
                    class="mt-1 text-sm text-red-600"
                  >
                    {{ getFieldError('confirmPassword') }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Terms and Conditions -->
          <div>
            <div class="flex items-start">
              <input
                type="checkbox"
                id="agreeToTerms"
                [(ngModel)]="formTree.state.agreeToTerms"
                (change)="markFieldAsTouched('agreeToTerms')"
                name="agreeToTerms"
                class="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded mt-1"
              />
              <label
                for="agreeToTerms"
                class="ml-2 block text-sm text-gray-700"
              >
                I agree to the
                <a href="#" class="text-orange-600 hover:text-orange-700"
                  >Terms and Conditions</a
                >
                and
                <a href="#" class="text-orange-600 hover:text-orange-700"
                  >Privacy Policy</a
                >
                *
              </label>
            </div>
            <div
              *ngIf="hasFieldError('agreeToTerms')"
              class="mt-1 text-sm text-red-600"
            >
              {{ getFieldError('agreeToTerms') }}
            </div>
          </div>

          <!-- Form Actions -->
          <div
            class="flex justify-between items-center pt-6 border-t border-gray-200"
          >
            <div class="flex space-x-3">
              <button
                type="button"
                (click)="validateForm()"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Validate Form
              </button>

              <button
                type="button"
                (click)="fillSampleData()"
                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Fill Sample Data
              </button>

              <button
                type="button"
                (click)="resetForm()"
                class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Reset Form
              </button>
            </div>

            <button
              type="submit"
              [disabled]="!formTree.valid() || formTree.submitting()"
              class="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 transition-colors"
            >
              {{
                formTree.submitting() ? 'Registering...' : 'Register Account'
              }}
            </button>
          </div>
        </form>
      </div>

      <!-- Validation Summary -->
      <div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Current Errors -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">
            🚨 Validation Errors
          </h2>

          <div
            *ngIf="getErrorCount() === 0"
            class="text-center py-8 text-gray-500"
          >
            <div class="text-4xl mb-2">🎉</div>
            <div>No validation errors!</div>
          </div>

          <div *ngIf="getErrorCount() > 0" class="space-y-3">
            <div
              *ngFor="let error of getAllErrors()"
              class="p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <div class="font-medium text-red-800">{{ error.field }}</div>
              <div class="text-sm text-red-600">{{ error.message }}</div>
            </div>
          </div>
        </div>

        <!-- Form State -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">
            📊 Form State
          </h2>

          <div class="space-y-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Current Values</h3>
              <pre
                class="text-xs bg-gray-800 text-green-400 p-3 rounded overflow-x-auto"
                >{{ getCurrentValues() | json }}</pre
              >
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Touched Fields</h3>
              <div class="text-sm text-gray-600">
                {{ Object.keys(formTree.touched()).join(', ') || 'None' }}
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Form Statistics</h3>
              <div class="space-y-1 text-sm">
                <div>
                  <strong>Valid:</strong> {{ formTree.valid() ? 'Yes' : 'No' }}
                </div>
                <div>
                  <strong>Dirty:</strong> {{ formTree.dirty() ? 'Yes' : 'No' }}
                </div>
                <div>
                  <strong>Submitting:</strong>
                  {{ formTree.submitting() ? 'Yes' : 'No' }}
                </div>
                <div><strong>Error Count:</strong> {{ getErrorCount() }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Code Example -->
      <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          💻 Form Tree Setup
        </h2>

        <div class="bg-gray-800 text-gray-300 p-4 rounded-lg overflow-x-auto">
          <pre><code>{{ formTreeCode }}</code></pre>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .container {
        max-width: 1200px;
      }

      code {
        font-family: 'Courier New', monospace;
      }
    `,
  ],
})
export class FormValidationComponent {
  isCheckingUsername = false;
  isCheckingEmail = false;

  Object = Object; // Expose Object to template

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
            const currentPassword = this.formTree.state.password();
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

  async onSubmit() {
    try {
      await this.formTree.submit(async (values) => {
        // Simulate form submission
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log('Form submitted successfully:', values);

        // Reset form after successful submission
        this.resetForm();

        alert('Registration successful!');

        return { success: true };
      });
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  }

  async validateForm() {
    await this.formTree.validate();
  }

  fillSampleData() {
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
  }

  resetForm() {
    this.formTree.reset();
  }

  markFieldAsTouched(field: string) {
    // Mark the field as touched in the form tree
    this.formTree.touched.update((t) => ({ ...t, [field]: true }));
  }

  async onUsernameChange() {
    const username = this.formTree.state.username();
    if (username && username.length >= 3) {
      await this.formTree.validate();
    }
  }

  async onEmailChange() {
    const email = this.formTree.state.email();
    if (email && email.includes('@')) {
      await this.formTree.validate();
    }
  }

  async onPasswordChange() {
    // Validate both password and confirm password when password changes
    await this.formTree.validate('password');
    const confirmPassword = this.formTree.state.confirmPassword();
    if (confirmPassword) {
      await this.formTree.validate('confirmPassword');
    }
  }

  async onConfirmPasswordChange() {
    // Validate confirm password when it changes
    await this.formTree.validate('confirmPassword');
  }

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

  getErrorCount(): number {
    const syncErrors = Object.keys(this.formTree.errors()).length;
    const asyncErrors = Object.keys(this.formTree.asyncErrors()).length;
    return syncErrors + asyncErrors;
  }

  getAllErrors(): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    // Add sync errors
    const syncErrors = this.formTree.errors();
    Object.entries(syncErrors).forEach(([field, message]) => {
      if (message) {
        errors.push({ field, message });
      }
    });

    // Add async errors
    const asyncErrors = this.formTree.asyncErrors();
    Object.entries(asyncErrors).forEach(([field, message]) => {
      if (message) {
        errors.push({ field: `${field} (async)`, message });
      }
    });

    return errors;
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

  formTreeCode = `import { createFormTree, validators, asyncValidators } from 'signal-tree';

const formTree = createFormTree({
  username: '',
  email: '',
  password: '',
  // ... other fields
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
      // Complex password validation...
      return null;
    },
    confirmPassword: (value, formValues) => {
      return value !== formValues?.password
        ? 'Passwords do not match'
        : null;
    }
  },
  asyncValidators: {
    username: async (value) => {
      const response = await checkUsername(value);
      return response.exists ? 'Username taken' : null;
    }
  }
});

// Form submission with validation
await formTree.submit(async (values) => {
  return await submitRegistration(values);
});`;
}

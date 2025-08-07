import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createFormStore, validators } from '@signal-tree';

interface UserRegistrationForm {
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
          Form stores provide comprehensive validation with synchronous and
          asynchronous validators, field-level error handling, and reactive form
          state management.
        </p>
      </div>

      <!-- Form Status Overview -->
      <div class="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="formStore.valid() ? 'text-green-600' : 'text-red-600'"
          >
            {{ formStore.valid() ? '✅' : '❌' }}
          </div>
          <div class="text-sm text-gray-600">Form Valid</div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="formStore.dirty() ? 'text-blue-600' : 'text-gray-400'"
          >
            {{ formStore.dirty() ? '📝' : '📄' }}
          </div>
          <div class="text-sm text-gray-600">
            {{ formStore.dirty() ? 'Modified' : 'Pristine' }}
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-md p-4 text-center">
          <div
            class="text-2xl mb-2"
            [class]="
              formStore.submitting() ? 'text-yellow-600' : 'text-gray-400'
            "
          >
            {{ formStore.submitting() ? '⏳' : '💤' }}
          </div>
          <div class="text-sm text-gray-600">
            {{ formStore.submitting() ? 'Submitting' : 'Ready' }}
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
                  [(ngModel)]="formStore.values.firstName"
                  (blur)="markFieldAsTouched('firstName')"
                  name="firstName"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('firstName')"
                  [class.border-green-500]="
                    formStore.isFieldValid('firstName')()
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
                  [(ngModel)]="formStore.values.lastName"
                  (blur)="markFieldAsTouched('lastName')"
                  name="lastName"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('lastName')"
                  [class.border-green-500]="
                    formStore.isFieldValid('lastName')()
                  "
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
                  [(ngModel)]="formStore.values.dateOfBirth"
                  (blur)="markFieldAsTouched('dateOfBirth')"
                  name="dateOfBirth"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('dateOfBirth')"
                  [class.border-green-500]="
                    formStore.isFieldValid('dateOfBirth')()
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
                  [(ngModel)]="formStore.values.phoneNumber"
                  (blur)="markFieldAsTouched('phoneNumber')"
                  name="phoneNumber"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="hasFieldError('phoneNumber')"
                  [class.border-green-500]="
                    formStore.isFieldValid('phoneNumber')()
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
                  [(ngModel)]="formStore.values.username"
                  (blur)="markFieldAsTouched('username')"
                  (input)="onUsernameChange()"
                  name="username"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="
                    hasFieldError('username') || hasAsyncFieldError('username')
                  "
                  [class.border-green-500]="
                    formStore.isFieldValid('username')() &&
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
                  [(ngModel)]="formStore.values.email"
                  (blur)="markFieldAsTouched('email')"
                  (input)="onEmailChange()"
                  name="email"
                  class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  [class.border-red-500]="
                    hasFieldError('email') || hasAsyncFieldError('email')
                  "
                  [class.border-green-500]="
                    formStore.isFieldValid('email')() &&
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
                    [(ngModel)]="formStore.values.password"
                    (blur)="markFieldAsTouched('password')"
                    name="password"
                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    [class.border-red-500]="hasFieldError('password')"
                    [class.border-green-500]="
                      formStore.isFieldValid('password')()
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
                    [(ngModel)]="formStore.values.confirmPassword"
                    (blur)="markFieldAsTouched('confirmPassword')"
                    name="confirmPassword"
                    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    [class.border-red-500]="hasFieldError('confirmPassword')"
                    [class.border-green-500]="
                      formStore.isFieldValid('confirmPassword')()
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
                [(ngModel)]="formStore.values.agreeToTerms"
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
              [disabled]="!formStore.valid() || formStore.submitting()"
              class="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 transition-colors"
            >
              {{
                formStore.submitting() ? 'Registering...' : 'Register Account'
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
                {{ Object.keys(formStore.touched()).join(', ') || 'None' }}
              </div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-medium text-gray-800 mb-2">Form Statistics</h3>
              <div class="space-y-1 text-sm">
                <div>
                  <strong>Valid:</strong> {{ formStore.valid() ? 'Yes' : 'No' }}
                </div>
                <div>
                  <strong>Dirty:</strong> {{ formStore.dirty() ? 'Yes' : 'No' }}
                </div>
                <div>
                  <strong>Submitting:</strong>
                  {{ formStore.submitting() ? 'Yes' : 'No' }}
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
          💻 Form Store Setup
        </h2>

        <div class="bg-gray-800 text-gray-300 p-4 rounded-lg overflow-x-auto">
          <pre><code>{{ formStoreCode }}</code></pre>
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

  formStore = createFormStore<UserRegistrationForm>(
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
        username: (value) => {
          if (!value) return 'Username is required';
          if (value.length < 3) return 'Username must be at least 3 characters';
          if (!/^[a-zA-Z0-9_]+$/.test(value))
            return 'Username can only contain letters, numbers, and underscores';
          return null;
        },

        email: validators.email(),

        password: (value) => {
          if (!value) return 'Password is required';
          if (value.length < 8) return 'Password must be at least 8 characters';
          if (!/(?=.*[a-z])/.test(value))
            return 'Password must contain at least one lowercase letter';
          if (!/(?=.*[A-Z])/.test(value))
            return 'Password must contain at least one uppercase letter';
          if (!/(?=.*\d)/.test(value))
            return 'Password must contain at least one number';
          return null;
        },

        confirmPassword: (value, formValues) => {
          if (!value) return 'Please confirm your password';
          if (value !== formValues?.password) return 'Passwords do not match';
          return null;
        },

        firstName: validators.required('First name is required'),
        lastName: validators.required('Last name is required'),

        dateOfBirth: (value) => {
          if (!value) return 'Date of birth is required';
          const birthDate = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          if (age < 18) return 'You must be at least 18 years old';
          if (age > 120) return 'Please enter a valid date of birth';
          return null;
        },

        phoneNumber: (value) => {
          if (
            value &&
            !/^[+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-()]/g, ''))
          ) {
            return 'Please enter a valid phone number';
          }
          return null;
        },

        agreeToTerms: (value) => {
          return value ? null : 'You must agree to the terms and conditions';
        },
      },

      asyncValidators: {
        username: async (value) => {
          if (!value || value.length < 3) return null;

          this.isCheckingUsername = true;

          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 1000));

          this.isCheckingUsername = false;

          // Simulate some usernames being taken
          const takenUsernames = ['admin', 'test', 'user', 'demo', 'example'];
          return takenUsernames.includes(value.toLowerCase())
            ? 'Username is already taken'
            : null;
        },

        email: async (value) => {
          if (!value || !value.includes('@')) return null;

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
          return takenEmails.includes(value.toLowerCase())
            ? 'Email address is already registered'
            : null;
        },
      },
    }
  );

  async onSubmit() {
    try {
      await this.formStore.submit(async (values) => {
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
    await this.formStore.validate();
  }

  fillSampleData() {
    this.formStore.setValues({
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
    this.formStore.reset();
  }

  markFieldAsTouched() {
    // This would normally be handled automatically by the form store
    // but we can add custom logic here if needed
  }

  async onUsernameChange() {
    if (
      this.formStore.values.username() &&
      this.formStore.values.username().length >= 3
    ) {
      await this.formStore.validate();
    }
  }

  async onEmailChange() {
    if (
      this.formStore.values.email() &&
      this.formStore.values.email().includes('@')
    ) {
      await this.formStore.validate();
    }
  }

  hasFieldError(field: keyof UserRegistrationForm): boolean {
    const error = this.formStore.getFieldError(field)();
    return !!error;
  }

  getFieldError(field: keyof UserRegistrationForm): string | undefined {
    return this.formStore.getFieldError(field)();
  }

  hasAsyncFieldError(field: keyof UserRegistrationForm): boolean {
    const asyncErrors = this.formStore.asyncErrors();
    return !!asyncErrors[field];
  }

  getAsyncFieldError(field: keyof UserRegistrationForm): string | undefined {
    const asyncErrors = this.formStore.asyncErrors();
    return asyncErrors[field];
  }

  getErrorCount(): number {
    const syncErrors = Object.keys(this.formStore.errors()).length;
    const asyncErrors = Object.keys(this.formStore.asyncErrors()).length;
    return syncErrors + asyncErrors;
  }

  getAllErrors(): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    // Add sync errors
    const syncErrors = this.formStore.errors();
    Object.entries(syncErrors).forEach(([field, message]) => {
      if (message) {
        errors.push({ field, message });
      }
    });

    // Add async errors
    const asyncErrors = this.formStore.asyncErrors();
    Object.entries(asyncErrors).forEach(([field, message]) => {
      if (message) {
        errors.push({ field: `${field} (async)`, message });
      }
    });

    return errors;
  }

  getCurrentValues(): Partial<UserRegistrationForm> {
    const values = this.formStore.values.unwrap();
    // Don't show passwords in the display
    return {
      ...values,
      password: values.password ? '***' : '',
      confirmPassword: values.confirmPassword ? '***' : '',
    };
  }

  formStoreCode = `import { createFormStore, validators, asyncValidators } from 'signal-tree';

const formStore = createFormStore({
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
await formStore.submit(async (values) => {
  return await submitRegistration(values);
});`;
}

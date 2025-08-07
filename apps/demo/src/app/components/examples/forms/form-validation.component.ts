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
});`;
}

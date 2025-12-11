import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

interface FormState {
  fields: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    agreeToTerms: boolean;
  };
  touched: {
    username: boolean;
    email: boolean;
    password: boolean;
    confirmPassword: boolean;
  };
  submitted: boolean;
  submittedData: FormState['fields'] | null;
}

/**
 * Forms Integration Demo
 *
 * Demonstrates SignalTree-based forms with:
 * - Unified state tree for form fields, touch state, and submission
 * - Real-time validation via computed signals
 * - Field-level error messages
 * - Password strength indicator
 * - Demonstrates how SignalTree simplifies complex form state management
 */
@Component({
  selector: 'app-forms-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './forms-demo.component.html',
  styleUrl: './forms-demo.component.scss',
})
export class FormsDemoComponent {
  // Unified form state using SignalTree
  formStore = signalTree<FormState>({
    fields: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false,
    },
    touched: {
      username: false,
      email: false,
      password: false,
      confirmPassword: false,
    },
    submitted: false,
    submittedData: null,
  });

  // Aliases for cleaner template binding
  username = this.formStore.$.fields.username;
  email = this.formStore.$.fields.email;
  password = this.formStore.$.fields.password;
  confirmPassword = this.formStore.$.fields.confirmPassword;
  agreeToTerms = this.formStore.$.fields.agreeToTerms;

  usernameTouched = this.formStore.$.touched.username;
  emailTouched = this.formStore.$.touched.email;
  passwordTouched = this.formStore.$.touched.password;
  confirmPasswordTouched = this.formStore.$.touched.confirmPassword;

  submitted = this.formStore.$.submitted;
  submittedData = this.formStore.$.submittedData;

  // Computed validations
  usernameValid = computed(() => {
    const value = this.username();
    return (
      value.length >= 3 && value.length <= 20 && /^[a-zA-Z0-9_]+$/.test(value)
    );
  });

  emailValid = computed(() => {
    const value = this.email();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  });

  passwordStrength = computed(() => {
    const pass = this.password();
    let strength = 0;
    if (pass.length >= 8) strength++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength++;
    if (/\d/.test(pass)) strength++;
    if (/[^a-zA-Z0-9]/.test(pass)) strength++;
    return strength; // 0-4
  });

  passwordValid = computed(() => this.passwordStrength() >= 3);

  passwordsMatch = computed(() => {
    const pass = this.password();
    const confirm = this.confirmPassword();
    return pass === confirm && pass.length > 0;
  });

  formValid = computed(() => {
    return (
      this.usernameValid() &&
      this.emailValid() &&
      this.passwordValid() &&
      this.passwordsMatch() &&
      this.agreeToTerms()
    );
  });

  submitForm() {
    if (!this.formValid()) {
      // Mark all fields as touched to show errors
      this.usernameTouched.set(true);
      this.emailTouched.set(true);
      this.passwordTouched.set(true);
      this.confirmPasswordTouched.set(true);
      return;
    }

    // Store submitted data and mark as submitted
    const fields = this.formStore.$.fields();
    this.submittedData.set({ ...fields });
    this.submitted.set(true);
  }

  resetForm() {
    // Reset each section of the form state using callable syntax
    this.formStore.$.fields({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false,
    });
    this.formStore.$.touched({
      username: false,
      email: false,
      password: false,
      confirmPassword: false,
    });
    this.submitted.set(false);
    this.submittedData.set(null);
  }

  getPasswordStrengthText(): string {
    const strength = this.passwordStrength();
    if (strength === 0) return 'Too weak';
    if (strength === 1) return 'Weak';
    if (strength === 2) return 'Fair';
    if (strength === 3) return 'Good';
    return 'Strong';
  }

  getPasswordStrengthColor(): string {
    const strength = this.passwordStrength();
    if (strength <= 1) return '#ef4444';
    if (strength === 2) return '#f59e0b';
    if (strength === 3) return '#3b82f6';
    return '#10b981';
  }
}

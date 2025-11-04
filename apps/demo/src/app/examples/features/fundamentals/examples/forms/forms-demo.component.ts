import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface FormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}

/**
 * Forms Integration Demo
 *
 * Demonstrates signal-based forms with:
 * - Real-time validation
 * - Computed form validity
 * - Field-level error messages
 * - Password strength indicator
 */
@Component({
  selector: 'app-forms-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './forms-demo.component.html',
  styleUrl: './forms-demo.component.scss',
})
export class FormsDemoComponent {
  // Form fields
  username = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  agreeToTerms = signal(false);

  // Touch state (for showing errors)
  usernameTouched = signal(false);
  emailTouched = signal(false);
  passwordTouched = signal(false);
  confirmPasswordTouched = signal(false);

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

  // Submission
  submitted = signal(false);
  submittedData = signal<FormData | null>(null);

  submitForm() {
    if (!this.formValid()) {
      // Mark all as touched to show errors
      this.usernameTouched.set(true);
      this.emailTouched.set(true);
      this.passwordTouched.set(true);
      this.confirmPasswordTouched.set(true);
      return;
    }

    const formData: FormData = {
      username: this.username(),
      email: this.email(),
      password: this.password(),
      confirmPassword: this.confirmPassword(),
      agreeToTerms: this.agreeToTerms(),
    };

    this.submittedData.set(formData);
    this.submitted.set(true);
  }

  resetForm() {
    this.username.set('');
    this.email.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.agreeToTerms.set(false);
    this.usernameTouched.set(false);
    this.emailTouched.set(false);
    this.passwordTouched.set(false);
    this.confirmPasswordTouched.set(false);
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

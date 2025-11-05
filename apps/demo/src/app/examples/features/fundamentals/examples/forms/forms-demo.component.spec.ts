import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { FormsDemoComponent } from './forms-demo.component';

describe('FormsDemoComponent', () => {
  let component: FormsDemoComponent;
  let fixture: ComponentFixture<FormsDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsDemoComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FormsDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with empty form fields', () => {
      expect(component.username()).toBe('');
      expect(component.email()).toBe('');
      expect(component.password()).toBe('');
      expect(component.confirmPassword()).toBe('');
      expect(component.agreeToTerms()).toBe(false);
    });

    it('should initialize with form not submitted', () => {
      expect(component.submitted()).toBe(false);
    });
  });

  describe('Username Validation', () => {
    it('should validate minimum length', () => {
      component.username.set('ab');
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(false);
    });

    it('should validate valid username', () => {
      component.username.set('validuser');
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(true);
    });

    it('should handle empty username', () => {
      component.username.set('');
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(false);
    });

    it('should validate username with allowed characters', () => {
      component.username.set('user_name123');
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(true);
    });

    it('should reject username with special characters', () => {
      component.username.set('user@name');
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(false);
    });

    it('should reject username that is too long', () => {
      component.username.set('a'.repeat(21));
      fixture.detectChanges();

      expect(component.usernameValid()).toBe(false);
    });
  });

  describe('Email Validation', () => {
    it('should validate valid email format', () => {
      component.email.set('test@example.com');
      fixture.detectChanges();

      expect(component.emailValid()).toBe(true);
    });

    it('should reject invalid email format', () => {
      component.email.set('invalid-email');
      fixture.detectChanges();

      expect(component.emailValid()).toBe(false);
    });

    it('should handle empty email', () => {
      component.email.set('');
      fixture.detectChanges();

      expect(component.emailValid()).toBe(false);
    });

    it('should validate various email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@example-domain.com',
      ];

      validEmails.forEach((email) => {
        component.email.set(email);
        fixture.detectChanges();
        expect(component.emailValid()).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
      ];

      invalidEmails.forEach((email) => {
        component.email.set(email);
        fixture.detectChanges();
        expect(component.emailValid()).toBe(false);
      });
    });
  });

  describe('Password Validation', () => {
    it('should reject short password', () => {
      component.password.set('Short');
      fixture.detectChanges();

      expect(component.passwordStrength()).toBeLessThan(3);
      expect(component.passwordValid()).toBe(false);
    });

    it('should require mixed case', () => {
      component.password.set('lowercase123');
      fixture.detectChanges();

      expect(component.passwordStrength()).toBeLessThan(3);
    });

    it('should validate strong password', () => {
      component.password.set('StrongPass123!');
      fixture.detectChanges();

      expect(component.passwordValid()).toBe(true);
      expect(component.passwordStrength()).toBe(4);
    });

    it('should handle empty password', () => {
      component.password.set('');
      fixture.detectChanges();

      expect(component.passwordValid()).toBe(false);
      expect(component.passwordStrength()).toBe(0);
    });
  });

  describe('Password Strength Indicator', () => {
    it('should calculate strength score 0 for empty password', () => {
      component.password.set('');
      fixture.detectChanges();

      expect(component.passwordStrength()).toBe(0);
    });

    it('should calculate maximum strength score', () => {
      component.password.set('StrongPass123!');
      fixture.detectChanges();

      expect(component.passwordStrength()).toBe(4);
    });

    it('should provide correct strength text', () => {
      const testCases = [
        { password: '', expected: 'Too weak' },
        { password: 'password', expected: 'Weak' }, // length≥8(1) + no mixed/digit/special = 1
        { password: '12345678', expected: 'Fair' }, // length≥8(1) + digit(1) = 2
        { password: 'Password1', expected: 'Good' }, // length≥8(1) + mixed(1) + digit(1) = 3
        { password: 'StrongPass123!', expected: 'Strong' }, // length≥8(1) + mixed(1) + digit(1) + special(1) = 4
      ];

      testCases.forEach(({ password, expected }) => {
        component.password.set(password);
        fixture.detectChanges();
        expect(component.getPasswordStrengthText()).toBe(expected);
      });
    });

    it('should provide correct strength color', () => {
      component.password.set('StrongPass123!');
      fixture.detectChanges();

      expect(component.getPasswordStrengthColor()).toBe('#10b981');
    });
  });

  describe('Password Match Validation', () => {
    it('should validate matching passwords', () => {
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      fixture.detectChanges();

      expect(component.passwordsMatch()).toBe(true);
    });

    it('should reject non-matching passwords', () => {
      component.password.set('StrongPass123!');
      component.confirmPassword.set('DifferentPass123!');
      fixture.detectChanges();

      expect(component.passwordsMatch()).toBe(false);
    });

    it('should reject empty confirm password', () => {
      component.password.set('StrongPass123!');
      component.confirmPassword.set('');
      fixture.detectChanges();

      expect(component.passwordsMatch()).toBe(false);
    });
  });

  describe('Form Validity', () => {
    it('should be invalid with empty fields', () => {
      expect(component.formValid()).toBe(false);
    });

    it('should be valid with all fields correctly filled', () => {
      component.username.set('testuser');
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      expect(component.formValid()).toBe(true);
    });

    it('should be invalid if any field is invalid', () => {
      component.username.set('testuser');
      component.email.set('invalid-email');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      expect(component.formValid()).toBe(false);
    });

    it('should be invalid if passwords do not match', () => {
      component.username.set('testuser');
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('DifferentPass123!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      expect(component.formValid()).toBe(false);
    });

    it('should be invalid if terms not agreed', () => {
      component.username.set('testuser');
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(false);
      fixture.detectChanges();

      expect(component.formValid()).toBe(false);
    });
  });

  describe('Form Submission', () => {
    it('should submit valid form', () => {
      component.username.set('testuser');
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      component.submitForm();
      fixture.detectChanges();

      expect(component.submitted()).toBe(true);
      expect(component.submittedData()).toBeTruthy();
    });

    it('should not submit invalid form', () => {
      component.username.set('ab'); // Too short
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      component.submitForm();
      fixture.detectChanges();

      expect(component.submitted()).toBe(false);
    });

    it('should reset form after submission', () => {
      component.username.set('testuser');
      component.email.set('test@example.com');
      component.password.set('StrongPass123!');
      component.confirmPassword.set('StrongPass123!');
      component.agreeToTerms.set(true);
      component.submitForm();
      fixture.detectChanges();

      component.resetForm();
      fixture.detectChanges();

      expect(component.username()).toBe('');
      expect(component.email()).toBe('');
      expect(component.password()).toBe('');
      expect(component.confirmPassword()).toBe('');
      expect(component.agreeToTerms()).toBe(false);
      expect(component.submitted()).toBe(false);
    });

    it('should mark fields as touched on invalid submission', () => {
      component.username.set('ab');
      component.email.set('test@example.com');
      component.submitForm();
      fixture.detectChanges();

      expect(component.usernameTouched()).toBe(true);
      expect(component.emailTouched()).toBe(true);
      expect(component.passwordTouched()).toBe(true);
      expect(component.confirmPasswordTouched()).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should handle complete user flow', () => {
      // User fills form
      component.username.set('johndoe');
      component.email.set('john@example.com');
      component.password.set('SecurePass456!');
      component.confirmPassword.set('SecurePass456!');
      component.agreeToTerms.set(true);
      fixture.detectChanges();

      // Verify all validations
      expect(component.usernameValid()).toBe(true);
      expect(component.emailValid()).toBe(true);
      expect(component.passwordValid()).toBe(true);
      expect(component.passwordsMatch()).toBe(true);
      expect(component.formValid()).toBe(true);
      expect(component.passwordStrength()).toBe(4);

      // Submit form
      component.submitForm();
      fixture.detectChanges();
      expect(component.submitted()).toBe(true);

      // Reset form
      component.resetForm();
      fixture.detectChanges();
      expect(component.formValid()).toBe(false);
      expect(component.submitted()).toBe(false);
    });
  });
});

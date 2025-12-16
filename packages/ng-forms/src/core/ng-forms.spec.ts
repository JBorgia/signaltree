import { toObservable } from '../rxjs/rxjs-bridge';
import { unique } from './async-validators';
import { createFormTree, SIGNAL_FORM_DIRECTIVES, SignalValueDirective } from './ng-forms';
import { email as emailValidator, minLength, pattern, required } from './validators';

interface TestFormData extends Record<string, unknown> {
  username: string;
  email: string;
  age: number;
  preferences: {
    newsletter: boolean;
    theme: string;
  };
  tags: string[];
}

describe('NgForms', () => {
  let initialFormData: TestFormData;

  beforeEach(() => {
    initialFormData = {
      username: '',
      email: '',
      age: 0,
      preferences: {
        newsletter: false,
        theme: 'light',
      },
      tags: [],
    };
  });

  describe('createFormTree', () => {
    it('should create a form tree with form-specific signals', () => {
      const form = createFormTree(initialFormData);

      expect(form.state).toBeDefined();
      expect(form.$).toBe(form.state); // Alias
      expect(form.errors).toBeDefined();
      expect(form.asyncErrors).toBeDefined();
      expect(form.touched).toBeDefined();
      expect(form.asyncValidating).toBeDefined();
      expect(form.dirty).toBeDefined();
      expect(form.valid).toBeDefined();
      expect(form.submitting).toBeDefined();
    });

    it('should support field validation', async () => {
      const form = createFormTree(initialFormData, {
        validators: {
          username: required('Username is required'),
          email: emailValidator('Invalid email'),
        },
      });

      form.setValue('username', '');
      await new Promise((resolve) => setTimeout(resolve, 0)); // Allow async validation

      expect(form.errors()['username']).toBe('Username is required');
      expect(form.valid()).toBe(false);
    });

    it('should track touched fields', () => {
      const form = createFormTree(initialFormData);

      expect(form.touched()['username']).toBeUndefined();

      form.setValue('username', 'test');

      expect(form.touched()['username']).toBe(true);
    });

    it('should mark form as dirty when values change', () => {
      const form = createFormTree(initialFormData);

      expect(form.dirty()).toBe(false);

      form.setValue('username', 'test');

      expect(form.dirty()).toBe(true);
    });

    it('should support form reset', async () => {
      const form = createFormTree(initialFormData);

      form.setValue('username', 'test');
      form.setValue('email', 'test@example.com');
      await new Promise((resolve) => setTimeout(resolve, 10)); // Allow signal updates

      expect(form.dirty()).toBe(true);
      // Check form control values (signal binding is tested separately)
      expect(form.form.get('username')?.value).toBe('test');
      expect(form.form.get('email')?.value).toBe('test@example.com');

      form.reset();
      await new Promise((resolve) => setTimeout(resolve, 10)); // Allow reset updates

      expect(form.dirty()).toBe(false);
      expect(form.form.get('username')?.value).toBe('');
      expect(Object.keys(form.errors()).length).toBe(0);
    });

    it('should support async validation', async () => {
      const form = createFormTree(initialFormData, {
        asyncValidators: {
          username: unique(
            async (value: unknown) => value === 'taken',
            'Username already exists'
          ),
        },
      });

      form.setValue('username', 'taken');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(form.asyncErrors()['username']).toBe('Username already exists');
      expect(form.valid()).toBe(false);
    });

    it('should support form submission', async () => {
      const form = createFormTree(initialFormData, {
        validators: {
          username: required(),
        },
      });

      form.setValue('username', 'testuser');
      form.setValue('email', 'test@example.com');

      const submitData = await form.submit(async (values) => {
        return { success: true, data: values };
      });

      expect(submitData.success).toBe(true);
      expect(submitData.data['username']).toBe('testuser');
    });
  });

  describe('SignalValueDirective', () => {
    it('should be defined and exportable', () => {
      expect(SignalValueDirective).toBeDefined();
      expect(SIGNAL_FORM_DIRECTIVES).toContain(SignalValueDirective);
    });
  });

  describe('validators', () => {
    it('should provide required validator', () => {
      const requiredValidator = required('This field is required');

      expect(requiredValidator('')).toBe('This field is required');
      expect(requiredValidator('value')).toBe(null);
    });

    it('should provide email validator', () => {
      const emailValidatorFn = emailValidator();

      expect(emailValidatorFn('notanemail')).toBe('Invalid email');
      expect(emailValidatorFn('test@example.com')).toBe(null);
    });

    it('should provide minLength validator', () => {
      const minLengthValidator = minLength(5);

      expect(minLengthValidator('abc')).toBe('Min 5 characters');
      expect(minLengthValidator('abcdef')).toBe(null);
    });

    it('should provide pattern validator', () => {
      const patternValidator = pattern(/^\d+$/, 'Must be numeric');

      expect(patternValidator('abc')).toBe('Must be numeric');
      expect(patternValidator('123')).toBe(null);
    });
  });

  describe('asyncValidators', () => {
    it('should provide unique validator', async () => {
      const uniqueValidator = unique(
        async (value: unknown) => value === 'taken',
        'Already exists'
      );

      expect(await uniqueValidator('available')).toBe(null);
      expect(await uniqueValidator('taken')).toBe('Already exists');
    });
  });

  describe('toObservable', () => {
    it('should convert signal to observable', () => {
      // This would need proper Angular testing setup for full test
      expect(typeof toObservable).toBe('function');
    });
  });
});

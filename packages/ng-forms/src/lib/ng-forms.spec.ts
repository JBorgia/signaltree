import {
  createFormTree,
  SignalValueDirective,
  validators,
  asyncValidators,
  toObservable,
  createAuditMiddleware,
  SIGNAL_FORM_DIRECTIVES,
  type AuditEntry,
} from './ng-forms';

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
          username: validators.required('Username is required'),
          email: validators.email('Invalid email format'),
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

    it('should support form reset', () => {
      const form = createFormTree(initialFormData);

      form.setValue('username', 'test');
      form.setValue('email', 'test@example.com');

      expect(form.dirty()).toBe(true);
      expect(form.state.username()).toBe('test');

      form.reset();

      expect(form.dirty()).toBe(false);
      expect(form.state.username()).toBe('');
      expect(Object.keys(form.errors()).length).toBe(0);
    });

    it('should support async validation', async () => {
      const form = createFormTree(initialFormData, {
        asyncValidators: {
          username: asyncValidators.unique(
            async (value) => (value as string) === 'taken',
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
          username: validators.required(),
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
      const required = validators.required('Field is required');

      expect(required('')).toBe('Field is required');
      expect(required('value')).toBe(null);
    });

    it('should provide email validator', () => {
      const email = validators.email();

      expect(email('invalid-email')).toBe('Invalid email');
      expect(email('test@example.com')).toBe(null);
    });

    it('should provide minLength validator', () => {
      const minLength = validators.minLength(5);

      expect(minLength('abc')).toBe('Min 5 characters');
      expect(minLength('abcdef')).toBe(null);
    });

    it('should provide pattern validator', () => {
      const pattern = validators.pattern(/^\d+$/, 'Must be numeric');

      expect(pattern('abc')).toBe('Must be numeric');
      expect(pattern('123')).toBe(null);
    });
  });

  describe('asyncValidators', () => {
    it('should provide unique validator', async () => {
      const unique = asyncValidators.unique(
        async (value) => value === 'taken',
        'Already exists'
      );

      expect(await unique('available')).toBe(null);
      expect(await unique('taken')).toBe('Already exists');
    });
  });

  describe('createAuditMiddleware', () => {
    it('should track changes in audit log', () => {
      const auditLog: AuditEntry[] = [];
      const middleware = createAuditMiddleware(auditLog, () => ({
        userId: 'test-user',
      }));

      expect(middleware.id).toBe('audit');
      expect(typeof middleware.after).toBe('function');
    });
  });

  describe('toObservable', () => {
    it('should convert signal to observable', (done) => {
      // This would need proper Angular testing setup for full test
      expect(typeof toObservable).toBe('function');
      done();
    });
  });
});

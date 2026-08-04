/* eslint-disable @typescript-eslint/no-var-requires */
const { toObservable } = require('../rxjs/rxjs-bridge');
const { unique } = require('./async-validators');
const {
  createFormTree,
  SIGNAL_FORM_DIRECTIVES,
  SignalValueDirective,
} = require('./ng-forms');
const {
  email: emailValidator,
  minLength,
  pattern,
  required,
} = require('./validators');

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
      const form = (createFormTree as any)(initialFormData);

      expect(form.$).toBeDefined();
      expect(form.errors).toBeDefined();
      expect(form.asyncErrors).toBeDefined();
      expect(form.touched).toBeDefined();
      expect(form.asyncValidating).toBeDefined();
      expect(form.dirty).toBeDefined();
      expect(form.valid).toBeDefined();
      expect(form.submitting).toBeDefined();
    });

    it('should support field validation', async () => {
      const form = (createFormTree as any)(initialFormData, {
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

    it('should resolve getFieldError for concrete array-index paths validated via a glob key (regression: fieldErrors was keyed by the literal glob, so per-index lookups always returned undefined)', async () => {
      const form = (createFormTree as any)(
        { phones: [{ value: '' }, { value: '555' }] },
        {
          validators: {
            'phones.*.value': required('Phone is required'),
          },
        }
      );

      form.setValue('phones.0.value', '');
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Summary surface (concrete-keyed) and per-field surface must agree
      expect(form.errors()['phones.0.value']).toBe('Phone is required');
      expect(form.getFieldError('phones.0.value')()).toBe('Phone is required');
      expect(form.getFieldError('phones.1.value')()).toBeUndefined();

      // Error clears reactively through the same lazily-created computed
      form.setValue('phones.0.value', '555-0100');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(form.getFieldError('phones.0.value')()).toBeUndefined();
    });

    it('should track touched fields', () => {
      const form = (createFormTree as any)(initialFormData);

      expect(form.touched()['username']).toBeUndefined();

      form.setValue('username', 'test');

      expect(form.touched()['username']).toBe(true);
    });

    it('should mark form as dirty when values change', () => {
      const form = (createFormTree as any)(initialFormData);

      expect(form.dirty()).toBe(false);

      form.setValue('username', 'test');

      expect(form.dirty()).toBe(true);
    });

    it('should set a nested field via a dotted path (regression: getSignalAtPath used to bail on NodeAccessor branches, which are typeof "function")', () => {
      const form = (createFormTree as any)(initialFormData);

      form.setValue('preferences.theme', 'dark');

      expect(form.$.preferences.theme()).toBe('dark');
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
      const form = (createFormTree as any)(initialFormData, {
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
      const form = (createFormTree as any)(initialFormData, {
        validators: {
          username: required(),
        },
      });

      form.setValue('username', 'testuser');
      form.setValue('email', 'test@example.com');

      const submitData = await form.submit(async (values: any) => {
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
      // Same rule as @signaltree/core — a bare "@" is not enough
      expect(emailValidatorFn('a@b')).toBe('Invalid email');
      expect(emailValidatorFn('@@')).toBe('Invalid email');
      expect(emailValidatorFn('with spaces@example.com')).toBe('Invalid email');
      // Empty passes — emptiness is required()'s job
      expect(emailValidatorFn('')).toBe(null);
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

describe('createFormTree field-error lookup hardening', () => {
  const inheritedNames = [
    'toString',
    'constructor',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    '__proto__',
  ];

  it('never returns an Object.prototype member where a Signal is expected', () => {
    const form = (createFormTree as any)(
      { username: '' },
      { validators: { username: required('Username is required') } }
    );

    for (const name of inheritedNames) {
      const sync = form.getFieldError(name);
      const async = form.getFieldAsyncError(name);
      // Must be callable signals returning undefined — not inherited methods.
      expect(typeof sync).toBe('function');
      expect(typeof async).toBe('function');
      expect(sync()).toBeUndefined();
      expect(async()).toBeUndefined();
    }
  });

  it('still resolves a field genuinely named like a prototype member', async () => {
    const form = (createFormTree as any)(
      { toString: '' },
      { validators: { toString: required('toString is required') } }
    );

    form.setValue('toString', '');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(form.getFieldError('toString')()).toBe('toString is required');
  });

  it('does not grow the cache for paths no validator covers', () => {
    const form = (createFormTree as any)(
      { username: '' },
      { validators: { username: required() } }
    );

    for (let i = 0; i < 500; i++) {
      form.getFieldError(`rows.${i}.value`);
    }

    // Uncovered paths share one constant signal instead of caching per path.
    expect(Object.keys(form.fieldErrors).length).toBeLessThan(10);
  });

  it('caches per concrete path when a glob validator covers it', () => {
    const form = (createFormTree as any)(
      { phones: [{ value: '' }] },
      { validators: { 'phones.*.value': required('Phone is required') } }
    );

    const first = form.getFieldError('phones.0.value');
    const again = form.getFieldError('phones.0.value');
    expect(first).toBe(again); // stable identity for template bindings
  });

  it('releases cached path signals on destroy()', () => {
    const form = (createFormTree as any)(
      { phones: [{ value: '' }] },
      { validators: { 'phones.*.value': required() } }
    );

    for (let i = 0; i < 50; i++) form.getFieldError(`phones.${i}.value`);
    expect(Object.keys(form.fieldErrors).length).toBeGreaterThan(0);

    form.destroy();
    expect(Object.keys(form.fieldErrors).length).toBe(0);
  });
});

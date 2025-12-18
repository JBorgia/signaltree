import {
  SecurityValidator,
  SecurityPresets,
  type SecurityEvent,
} from './security-validator';

describe('SecurityValidator', () => {
  describe('Prototype Pollution Prevention', () => {
    it('should block __proto__ key', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      expect(() => validator.validateKey('__proto__')).toThrow(
        '[SignalTree Security] Dangerous key "__proto__" is not allowed'
      );
    });

    it('should block constructor key', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      expect(() => validator.validateKey('constructor')).toThrow(
        '[SignalTree Security] Dangerous key "constructor" is not allowed'
      );
    });

    it('should block prototype key', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      expect(() => validator.validateKey('prototype')).toThrow(
        '[SignalTree Security] Dangerous key "prototype" is not allowed'
      );
    });

    it('should allow safe keys', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      expect(() => validator.validateKey('normalKey')).not.toThrow();
      expect(() => validator.validateKey('user')).not.toThrow();
      expect(() => validator.validateKey('data')).not.toThrow();
    });

    it('should allow dangerous keys when protection is disabled', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: false,
      });

      expect(() => validator.validateKey('__proto__')).not.toThrow();
      expect(() => validator.validateKey('constructor')).not.toThrow();
      expect(() => validator.validateKey('prototype')).not.toThrow();
    });

    it('should support custom dangerous keys', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        customDangerousKeys: ['admin', 'root'],
      });

      expect(() => validator.validateKey('admin')).toThrow(
        '[SignalTree Security] Dangerous key "admin" is not allowed'
      );
      expect(() => validator.validateKey('root')).toThrow(
        '[SignalTree Security] Dangerous key "root" is not allowed'
      );
      expect(() => validator.validateKey('user')).not.toThrow();
    });

    it('should emit security events when blocking keys', () => {
      const events: SecurityEvent[] = [];
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        onSecurityEvent: (event) => events.push(event),
      });

      expect(() => validator.validateKey('__proto__')).toThrow();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'dangerous-key-blocked',
        key: '__proto__',
        reason: expect.stringContaining('prototype pollution'),
      });
      expect(events[0].timestamp).toBeGreaterThan(0);
    });

    it('should check if a key is dangerous without throwing', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      expect(validator.isDangerousKey('__proto__')).toBe(true);
      expect(validator.isDangerousKey('constructor')).toBe(true);
      expect(validator.isDangerousKey('prototype')).toBe(true);
      expect(validator.isDangerousKey('normalKey')).toBe(false);
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize script tags in strict mode', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      const malicious = '<script>alert("xss")</script>';
      const sanitized = validator.validateValue(malicious);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toBe('');
    });

    it('should sanitize event handlers in strict mode', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      const malicious = '<img src="x" onerror="alert(1)">';
      const sanitized = validator.validateValue(malicious);

      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('<img');
    });

    it('should sanitize javascript: URLs', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      const malicious = '<a href="javascript:alert(1)">click</a>';
      const sanitized = validator.validateValue(malicious);

      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('<a');
    });

    it('should sanitize iframe tags', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      const malicious = '<iframe src="evil.com"></iframe>';
      const sanitized = validator.validateValue(malicious);

      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('</iframe>');
    });

    it('should remove all HTML tags in strict mode', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      const html = '<div><p>Hello <b>World</b></p></div>';
      const sanitized = validator.validateValue(html);

      expect(sanitized).toBe('Hello World');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should allow safe HTML in permissive mode', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'permissive',
      });

      const html = '<div><p>Hello <b>World</b></p></div>';
      const sanitized = validator.validateValue(html);

      // Permissive mode allows safe HTML
      expect(sanitized).toContain('<div>');
      expect(sanitized).toContain('<b>');
    });

    it('should block dangerous patterns even in permissive mode', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'permissive',
      });

      const malicious = '<div><script>alert("xss")</script></div>';
      const sanitized = validator.validateValue(malicious);

      // Dangerous script should be removed
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');

      // But safe HTML should remain
      expect(sanitized).toContain('<div>');
    });

    it('should not sanitize when XSS prevention is disabled', () => {
      const validator = new SecurityValidator({
        preventXSS: false,
      });

      const html = '<script>alert("xss")</script>';
      const result = validator.validateValue(html);

      expect(result).toBe(html); // Unchanged
    });

    it('should not sanitize non-string values', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      expect(validator.validateValue(123)).toBe(123);
      expect(validator.validateValue(true)).toBe(true);
      expect(validator.validateValue(null)).toBe(null);
      expect(validator.validateValue(undefined)).toBe(undefined);
      expect(validator.validateValue({ key: 'value' })).toEqual({
        key: 'value',
      });
    });

    it('should emit security events when blocking XSS', () => {
      const events: SecurityEvent[] = [];
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
        onSecurityEvent: (event) => events.push(event),
      });

      const malicious = '<script>alert("xss")</script>';
      validator.validateValue(malicious);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'xss-attempt-blocked',
        value: malicious,
        reason: expect.stringContaining('Dangerous HTML pattern'),
      });
    });
  });

  describe('Combined Validation', () => {
    it('should validate both key and value', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      // Should throw on dangerous key
      expect(() =>
        validator.validateKeyValue('__proto__', '<script>alert(1)</script>')
      ).toThrow('[SignalTree Security] Dangerous key "__proto__"');

      // Should sanitize value on safe key
      const result = validator.validateKeyValue('user', '<b>Name</b>');
      expect(result).toBe('Name');
    });

    it('should allow safe key-value pairs', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        preventXSS: true,
      });

      expect(validator.validateKeyValue('name', 'John')).toBe('John');
      expect(validator.validateKeyValue('age', 30)).toBe(30);
    });
  });

  describe('Configuration', () => {
    it('should expose current configuration', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        preventXSS: true,
        sanitizationMode: 'strict',
        customDangerousKeys: ['admin'],
      });

      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(true);
      expect(config.sanitizationMode).toBe('strict');
      expect(config.customDangerousKeys).toEqual(['admin']);
    });

    it('should use default values when not specified', () => {
      const validator = new SecurityValidator();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(false);
      expect(config.sanitizationMode).toBe('strict');
      expect(config.customDangerousKeys).toEqual([]);
    });
  });

  describe('Security Presets', () => {
    it('should create strict preset with all protections', () => {
      const validator = SecurityPresets.strict();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(true);
      expect(config.preventFunctions).toBe(true);
      expect(config.sanitizationMode).toBe('strict');
    });

    it('should create standard preset with core protections', () => {
      const validator = SecurityPresets.standard();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(false);
      expect(config.preventFunctions).toBe(true);
    });

    it('should create permissive preset with only prototype pollution prevention', () => {
      const validator = SecurityPresets.permissive();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(false);
      expect(config.preventFunctions).toBe(false);
    });

    it('should create disabled preset with no protections', () => {
      const validator = SecurityPresets.disabled();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(false);
      expect(config.preventXSS).toBe(false);
      expect(config.preventFunctions).toBe(false);
    });
  });

  describe('Function Value Prevention', () => {
    it('should block function values by default', () => {
      const validator = new SecurityValidator();

      expect(() =>
        validator.validateValue(() => {
          return 42;
        })
      ).toThrow('[SignalTree Security] Function values are not allowed');
    });

    it('should block named functions', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      function myFunction() {
        return 42;
      }

      expect(() => validator.validateValue(myFunction)).toThrow(
        'Function values are not allowed'
      );
    });

    it('should block arrow functions', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      expect(() => validator.validateValue((x: number) => x * 2)).toThrow(
        'Function values are not allowed'
      );
    });

    it('should block async functions', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      expect(() =>
        validator.validateValue(async () => {
          return 42;
        })
      ).toThrow('Function values are not allowed');
    });

    it('should block class constructors', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      class MyClass {}

      expect(() => validator.validateValue(MyClass)).toThrow(
        'Function values are not allowed'
      );
    });

    it('should provide helpful error message for functions', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      try {
        validator.validateValue(() => 'test');
        fail('Should have thrown');
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain('serialized');
        expect(err.message).toContain('time-travel');
        expect(err.message).toContain('persistence');
        expect(err.message).toContain(
          'Store function references outside the tree'
        );
      }
    });

    it('should emit security event when blocking functions', () => {
      const events: SecurityEvent[] = [];
      const validator = new SecurityValidator({
        preventFunctions: true,
        onSecurityEvent: (event) => events.push(event),
      });

      try {
        validator.validateValue(() => 42);
      } catch {
        // Expected
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'function-value-blocked',
        reason: expect.stringContaining('serializable'),
      });
    });

    it('should allow functions when preventFunctions is disabled', () => {
      const validator = new SecurityValidator({ preventFunctions: false });

      const fn = () => 42;
      const result = validator.validateValue(fn);

      expect(result).toBe(fn);
      expect(typeof result).toBe('function');
    });

    it('should allow non-function values when preventFunctions is enabled', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      expect(validator.validateValue(42)).toBe(42);
      expect(validator.validateValue('string')).toBe('string');
      expect(validator.validateValue(true)).toBe(true);
      expect(validator.validateValue(null)).toBe(null);
      expect(validator.validateValue({ key: 'value' })).toEqual({
        key: 'value',
      });
      expect(validator.validateValue([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should work with validateKeyValue for functions', () => {
      const validator = new SecurityValidator({ preventFunctions: true });

      expect(() =>
        validator.validateKeyValue('handler', () => {
          return 42;
        })
      ).toThrow('Function values are not allowed');
    });
  });

  describe('Security Presets', () => {
    it('should create strict preset with all protections', () => {
      const validator = SecurityPresets.strict();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(true);
      expect(config.sanitizationMode).toBe('strict');
    });

    it('should create permissive preset with only prototype pollution prevention', () => {
      const validator = SecurityPresets.permissive();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(true);
      expect(config.preventXSS).toBe(false);
    });

    it('should create disabled preset with no protections', () => {
      const validator = SecurityPresets.disabled();
      const config = validator.getConfig();

      expect(config.preventPrototypePollution).toBe(false);
      expect(config.preventXSS).toBe(false);
    });
  });

  describe('Real-world Attack Scenarios', () => {
    it('should prevent prototype pollution via JSON.parse', () => {
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
      });

      // Simulate malicious JSON payload
      const maliciousJSON = '{"__proto__": {"isAdmin": true}}';
      const parsed = JSON.parse(maliciousJSON);

      // Should throw when trying to use the dangerous key
      expect(() => {
        for (const key in parsed) {
          validator.validateKey(key);
        }
      }).toThrow();
    });

    it('should prevent XSS via user input', () => {
      const validator = new SecurityValidator({
        preventXSS: true,
        sanitizationMode: 'strict',
      });

      // Simulate malicious user input
      const userInput = 'Hello <img src=x onerror=alert(document.cookie)>';
      const safe = validator.validateValue(userInput);

      expect(safe).toBe('Hello ');
      expect(safe).not.toContain('onerror');
      expect(safe).not.toContain('alert');
    });

    it('should handle multiple attack vectors', () => {
      const events: SecurityEvent[] = [];
      const validator = new SecurityValidator({
        preventPrototypePollution: true,
        preventXSS: true,
        sanitizationMode: 'strict',
        customDangerousKeys: ['admin', 'root'],
        onSecurityEvent: (event) => events.push(event),
      });

      // Try prototype pollution
      expect(() => validator.validateKey('__proto__')).toThrow();

      // Try custom dangerous key
      expect(() => validator.validateKey('admin')).toThrow();

      // Try XSS
      const xss = validator.validateValue('<script>alert(1)</script>');
      expect(xss).toBe('');

      // Should have logged all attempts
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'dangerous-key-blocked')).toBe(true);
      expect(events.some((e) => e.type === 'xss-attempt-blocked')).toBe(true);
    });
  });
});

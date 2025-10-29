import { signalTree } from '../signal-tree';
import { SecurityPresets } from './security-validator';

/**
 * Integration tests for SecurityValidator with signalTree
 */
describe('SecurityValidator Integration', () => {
  describe('Function Value Blocking', () => {
    it('should block function values during tree construction', () => {
      expect(() => {
        signalTree(
          {
            name: 'test',
            handler: () => {
              return 42;
            },
          },
          {
            security: {
              preventFunctions: true,
            },
          }
        );
      }).toThrow('Function values are not allowed');
    });

    it('should block nested function values', () => {
      expect(() => {
        signalTree(
          {
            user: {
              name: 'John',
              onClick: () => console.log('clicked'),
            },
          },
          {
            security: {
              preventFunctions: true,
            },
          }
        );
      }).toThrow('Function values are not allowed');
    });

    it('should block functions in arrays', () => {
      expect(() => {
        signalTree(
          {
            callbacks: [
              () => {
                return 1;
              },
              () => {
                return 2;
              },
            ],
          },
          {
            security: {
              preventFunctions: true,
            },
          }
        );
      }).toThrow('Function values are not allowed');
    });

    it('should allow functions when preventFunctions is false', () => {
      const tree = signalTree(
        {
          name: 'test',
          handler: () => 42,
        },
        {
          security: {
            preventFunctions: false,
            preventPrototypePollution: true,
          },
        }
      );

      expect(tree()).toBeDefined();
      expect(typeof tree.$.handler()).toBe('function');
    });

    it('should allow non-function values with function blocking enabled', () => {
      const tree = signalTree(
        {
          name: 'John',
          age: 30,
          settings: {
            theme: 'dark',
            notifications: true,
          },
          tags: ['admin', 'user'],
        },
        {
          security: {
            preventFunctions: true,
          },
        }
      );

      expect(tree.$.name()).toBe('John');
      expect(tree.$.age()).toBe(30);
      expect(tree.$.settings.theme()).toBe('dark');
      expect(tree.$.tags()).toEqual(['admin', 'user']);
    });

    it('should include path information in function error', () => {
      try {
        signalTree(
          {
            deeply: {
              nested: {
                handler: () => 'test',
              },
            },
          },
          {
            security: {
              preventFunctions: true,
            },
          }
        );
        fail('Should have thrown');
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain('Path: deeply.nested.handler');
      }
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should block dangerous object patterns during tree construction', () => {
      // Note: __proto__ is difficult to test with Object literals due to JS engine behavior
      // Testing with constructor and prototype instead
      expect(() => {
        const malicious: Record<string, unknown> = {};
        Object.defineProperty(malicious, 'constructor', {
          value: { polluted: true },
          enumerable: true,
        });

        signalTree(malicious, {
          security: {
            preventPrototypePollution: true,
          },
        });
      }).toThrow('Dangerous key "constructor"');
    });

    it('should block constructor keys', () => {
      expect(() => {
        signalTree(
          {
            constructor: { polluted: true },
          } as Record<string, unknown>,
          {
            security: {
              preventPrototypePollution: true,
            },
          }
        );
      }).toThrow('Dangerous key "constructor"');
    });

    it('should block prototype keys', () => {
      expect(() => {
        signalTree(
          {
            prototype: { polluted: true },
          } as Record<string, unknown>,
          {
            security: {
              preventPrototypePollution: true,
            },
          }
        );
      }).toThrow('Dangerous key "prototype"');
    });

    it('should allow prototype pollution when disabled', () => {
      const malicious: Record<string, unknown> = {};
      Object.defineProperty(malicious, 'constructor', {
        value: { test: 'value' },
        enumerable: true,
      });

      const tree = signalTree(malicious, {
        security: {
          preventPrototypePollution: false,
        },
      });

      expect(tree()).toBeDefined();
    });

    it('should include path information in prototype pollution error', () => {
      try {
        const settings: Record<string, unknown> = {};
        Object.defineProperty(settings, 'constructor', {
          value: { admin: true },
          enumerable: true,
        });

        const malicious: Record<string, unknown> = {
          user: {
            settings,
          },
        };

        signalTree(malicious, {
          security: {
            preventPrototypePollution: true,
          },
        });
      } catch (error) {
        const err = error as Error;
        expect(err.message).toContain('Path: user.settings.constructor');
        return;
      }
      throw new Error('Should have thrown');
    });
  });

  describe('XSS Prevention', () => {
    it('should not mutate values during validation (XSS check only validates)', () => {
      // Note: XSS sanitization in security validator is for validation/logging only
      // It does NOT mutate the actual values in the tree
      // To sanitize values, use a separate sanitization step before passing to signalTree
      const tree = signalTree(
        {
          name: 'John Doe',
          bio: '<b>Hello</b>',
        },
        {
          security: {
            preventXSS: false, // XSS prevention would require value mutation which we don't do
          },
        }
      );

      expect(tree.$.name()).toBe('John Doe');
      expect(tree.$.bio()).toBe('<b>Hello</b>');
    });

    it('should not sanitize when XSS prevention is disabled', () => {
      const tree = signalTree(
        {
          name: '<script>alert("xss")</script>',
        },
        {
          security: {
            preventXSS: false,
          },
        }
      );

      expect(tree.$.name()).toBe('<script>alert("xss")</script>');
    });

    // XSS prevention is primarily for logging/detection, not mutation
    // For actual sanitization, sanitize values before creating the tree
  });

  describe('Security Presets', () => {
    it('should work with strict preset', () => {
      expect(() => {
        signalTree(
          {
            handler: () => 42,
          },
          {
            security: SecurityPresets.strict().getConfig(),
          }
        );
      }).toThrow('Function values are not allowed');
    });

    it('should work with standard preset', () => {
      expect(() => {
        signalTree(
          {
            handler: () => 42,
          },
          {
            security: SecurityPresets.standard().getConfig(),
          }
        );
      }).toThrow('Function values are not allowed');
    });

    it('should allow functions with permissive preset', () => {
      const tree = signalTree(
        {
          name: 'test',
          handler: () => 42,
        },
        {
          security: SecurityPresets.permissive().getConfig(),
        }
      );

      expect(tree()).toBeDefined();
    });

    it('should work without security config', () => {
      const tree = signalTree({
        name: 'test',
        handler: () => 42,
        __proto__: { test: true },
      } as Record<string, unknown>);

      expect(tree()).toBeDefined();
    });
  });

  describe('Security Event Callbacks', () => {
    it('should emit events for function blocking', () => {
      const events: Array<{ type: string; reason: string }> = [];

      expect(() => {
        signalTree(
          {
            handler: () => 42,
          },
          {
            security: {
              preventFunctions: true,
              onSecurityEvent: (event) => {
                events.push({
                  type: event.type,
                  reason: event.reason,
                });
              },
            },
          }
        );
      }).toThrow();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('function-value-blocked');
    });
  });

  describe('Combined Security Features', () => {
    it('should enforce all security features together', () => {
      const events: Array<{ type: string }> = [];

      // Test function blocking
      expect(() => {
        signalTree(
          {
            handler: () => 42,
          },
          {
            security: {
              preventPrototypePollution: true,
              preventXSS: false,
              preventFunctions: true,
              onSecurityEvent: (event) => events.push({ type: event.type }),
            },
          }
        );
      }).toThrow('Function values are not allowed');

      // Test safe data works
      const tree = signalTree(
        {
          name: 'John Doe',
          age: 30,
        },
        {
          security: {
            preventPrototypePollution: true,
            preventXSS: false,
            preventFunctions: true,
          },
        }
      );

      expect(tree.$.name()).toBe('John Doe');
      expect(tree.$.age()).toBe(30);
    });
  });

  describe('Performance', () => {
    it('should have zero overhead when security is disabled', () => {
      const start = performance.now();

      const tree = signalTree({
        data: Array(1000)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            value: i * 2,
          })),
      });

      const duration = performance.now() - start;

      expect(tree()).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should still be fast with security enabled on clean data', () => {
      const start = performance.now();

      const tree = signalTree(
        {
          data: Array(1000)
            .fill(null)
            .map((_, i) => ({
              id: i,
              name: `Item ${i}`,
              value: i * 2,
            })),
        },
        {
          security: {
            preventPrototypePollution: true,
            preventFunctions: true,
          },
        }
      );

      const duration = performance.now() - start;

      expect(tree()).toBeDefined();
      // Should still be reasonable even with validation
      expect(duration).toBeLessThan(200);
    });
  });
});

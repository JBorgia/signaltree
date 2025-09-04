import { TestBed } from '@angular/core/testing';

import { signalTree } from './signal-tree';

/**
 * Recursive Typing Tests for SignalTree
 * Tests the MAGIC recursive pattern that achieves perfect type inference
 */

describe('SignalTree Recursive Typing Magic', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should achieve perfect type recursion like signal-store pattern', () => {
    // The MAGIC: Complex nested structure that tests the recursive pattern
    const complexState = {
      user: {
        id: 1,
        profile: {
          name: 'John',
          age: 30,
          preferences: {
            theme: 'dark' as 'light' | 'dark',
            notifications: true,
            settings: {
              autoSave: true,
              language: 'en',
              advanced: {
                debugMode: false,
                apiTimeout: 5000,
              },
            },
          },
        },
      },
      app: {
        version: '1.0.0',
        config: {
          debug: false,
          maxUsers: 100,
        },
      },
    };

    const tree = signalTree(complexState);

    // 🎯 THE MAGIC: Perfect type preservation at every recursive level

    // Level 1: Root properties
    expect(tree.state.user.id()).toBe(1);
    expect(tree.state.app.version()).toBe('1.0.0');

    // Level 2: Nested objects
    expect(tree.state.user.profile.name()).toBe('John');
    expect(tree.state.user.profile.age()).toBe(30);
    expect(tree.state.app.config.debug()).toBe(false);
    expect(tree.state.app.config.maxUsers()).toBe(100);

    // Level 3: Deep nesting
    expect(tree.state.user.profile.preferences.theme()).toBe('dark');
    expect(tree.state.user.profile.preferences.notifications()).toBe(true);

    // Level 4: Very deep nesting
    expect(tree.state.user.profile.preferences.settings.autoSave()).toBe(true);
    expect(tree.state.user.profile.preferences.settings.language()).toBe('en');

    // Level 5: Maximum depth recursion
    expect(
      tree.state.user.profile.preferences.settings.advanced.debugMode()
    ).toBe(false);
    expect(
      tree.state.user.profile.preferences.settings.advanced.apiTimeout()
    ).toBe(5000);
  });

  it('should handle type-safe updates with perfect recursion', () => {
    const state = {
      user: {
        profile: {
          settings: {
            theme: 'dark' as 'light' | 'dark',
            advanced: {
              debugMode: false,
            },
          },
        },
      },
    };

    const tree = signalTree(state);

    // Type-safe updates should work at any depth
    tree.state.user.profile.settings.theme.set('light');
    tree.state.user.profile.settings.advanced.debugMode.set(true);

    expect(tree.state.user.profile.settings.theme()).toBe('light');
    expect(tree.state.user.profile.settings.advanced.debugMode()).toBe(true);
  });

  it('should handle primitive types correctly', () => {
    const primitiveState = {
      stringValue: 'hello',
      numberValue: 42,
      booleanValue: true,
      nullValue: null,
      undefinedValue: undefined,
    };

    const tree = signalTree(primitiveState);

    expect(tree.state.stringValue()).toBe('hello');
    expect(tree.state.numberValue()).toBe(42);
    expect(tree.state.booleanValue()).toBe(true);
    expect(tree.state.nullValue()).toBe(null);
    expect(tree.state.undefinedValue()).toBe(undefined);
  });

  it('should handle arrays as primitive signals', () => {
    const arrayState = {
      numbers: [1, 2, 3],
      strings: ['a', 'b', 'c'],
      nested: {
        moreArrays: [true, false],
      },
    };

    const tree = signalTree(arrayState);

    expect(tree.state.numbers()).toEqual([1, 2, 3]);
    expect(tree.state.strings()).toEqual(['a', 'b', 'c']);
    expect(tree.state.nested.moreArrays()).toEqual([true, false]);

    // Array updates should work
    tree.state.numbers.set([4, 5, 6]);
    expect(tree.state.numbers()).toEqual([4, 5, 6]);
  });

  it('should handle built-in objects as primitives', () => {
    const builtInState = {
      date: new Date('2024-01-01'),
      regex: /test/g,
      nested: {
        anotherDate: new Date('2024-12-31'),
      },
    };

    const tree = signalTree(builtInState);

    // Built-in objects should be treated as primitive values (not recursed)
    expect(tree.state.date()).toEqual(new Date('2024-01-01'));
    expect(tree.state.regex()).toEqual(/test/g);
    expect(tree.state.nested.anotherDate()).toEqual(new Date('2024-12-31'));
  });

  // 🎯 THE GRAND IDEA: Initiation defines structure, then perfect type inference forever
  describe('THE GRAND IDEA: Structure Definition and Type Inference', () => {
    it('should define structure at initiation and maintain perfect typing forever', () => {
      // 🎪 INITIATION DEFINES THE STRUCTURE
      const initialState = {
        user: {
          id: 1,
          profile: {
            name: 'John',
            settings: {
              theme: 'dark' as 'light' | 'dark',
              level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
              preferences: {
                notifications: true,
                language: 'en' as 'en' | 'es' | 'fr',
                advanced: {
                  debugMode: false,
                  timeout: 5000,
                  features: ['auth', 'dashboard'] as const,
                },
              },
            },
          },
        },
        app: {
          version: '1.0.0',
          metadata: {
            created: new Date('2024-01-01'),
            tags: ['prod', 'stable'] as const,
          },
        },
      };

      const tree = signalTree(initialState);

      // 🎯 FROM INITIATION FORWARD: Perfect type inference at every level

      // Level 1: Root access with perfect typing
      expect(tree.state.user.id()).toBe(1);
      expect(tree.state.app.version()).toBe('1.0.0');

      // Level 2: Nested objects maintain structure
      expect(tree.state.user.profile.name()).toBe('John');
      expect(tree.state.app.metadata.created()).toEqual(new Date('2024-01-01'));

      // Level 3: Deep nesting preserves exact literal types
      expect(tree.state.user.profile.settings.theme()).toBe('dark');
      expect(tree.state.user.profile.settings.level()).toBe('beginner');

      // Level 4: Very deep nesting maintains type safety
      expect(tree.state.user.profile.settings.preferences.notifications()).toBe(
        true
      );
      expect(tree.state.user.profile.settings.preferences.language()).toBe(
        'en'
      );

      // Level 5: Maximum depth with perfect type preservation
      expect(
        tree.state.user.profile.settings.preferences.advanced.debugMode()
      ).toBe(false);
      expect(
        tree.state.user.profile.settings.preferences.advanced.timeout()
      ).toBe(5000);
      expect(
        tree.state.user.profile.settings.preferences.advanced.features()
      ).toEqual(['auth', 'dashboard']);

      // Arrays and const assertions preserved
      expect(tree.state.app.metadata.tags()).toEqual(['prod', 'stable']);
    });

    it('should maintain type safety for all operations after initiation', () => {
      const state = {
        config: {
          mode: 'development' as 'development' | 'production' | 'test',
          settings: {
            debug: false,
            performance: {
              caching: true,
              timeout: 3000,
              retries: 3,
            },
          },
        },
        status: 'active' as 'active' | 'inactive' | 'pending',
      };

      const tree = signalTree(state);

      // ✅ Type-safe reads at any depth
      const mode: 'development' | 'production' | 'test' =
        tree.state.config.mode();
      const debug: boolean = tree.state.config.settings.debug();
      const caching: boolean = tree.state.config.settings.performance.caching();
      const timeout: number = tree.state.config.settings.performance.timeout();
      const status: 'active' | 'inactive' | 'pending' = tree.state.status();

      expect(mode).toBe('development');
      expect(debug).toBe(false);
      expect(caching).toBe(true);
      expect(timeout).toBe(3000);
      expect(status).toBe('active');

      // ✅ Type-safe updates at any depth
      tree.state.config.mode.set('production');
      tree.state.config.settings.debug.set(true);
      tree.state.config.settings.performance.caching.set(false);
      tree.state.config.settings.performance.timeout.set(5000);
      tree.state.status.set('inactive');

      // ✅ Verify updates maintained type safety
      expect(tree.state.config.mode()).toBe('production');
      expect(tree.state.config.settings.debug()).toBe(true);
      expect(tree.state.config.settings.performance.caching()).toBe(false);
      expect(tree.state.config.settings.performance.timeout()).toBe(5000);
      expect(tree.state.status()).toBe('inactive');
    });

    it('should handle complex real-world state structures with perfect inference', () => {
      // 🎪 Real-world example: E-commerce application state
      const ecommerceState = {
        auth: {
          user: {
            id: 'user-123',
            email: 'user@example.com',
            roles: ['customer', 'premium'] as const,
            profile: {
              firstName: 'John',
              lastName: 'Doe',
              preferences: {
                currency: 'USD' as 'USD' | 'EUR' | 'GBP',
                language: 'en' as 'en' | 'es' | 'fr' | 'de',
                notifications: {
                  email: true,
                  sms: false,
                  push: true,
                },
              },
            },
          },
          session: {
            token: 'jwt-token-here',
            expiresAt: new Date('2024-12-31'),
            refreshToken: 'refresh-token',
          },
        },
        cart: {
          items: [
            { id: 'item-1', name: 'Product 1', price: 29.99, quantity: 2 },
            { id: 'item-2', name: 'Product 2', price: 49.99, quantity: 1 },
          ],
          total: 109.97,
          currency: 'USD' as 'USD' | 'EUR' | 'GBP',
          discounts: ['SAVE10', 'PREMIUM'] as const,
        },
        ui: {
          loading: false,
          modal: {
            isOpen: false,
            type: null as 'checkout' | 'login' | 'error' | null,
            data: {} as Record<string, unknown>,
          },
          notifications: [
            {
              id: 'notif-1',
              type: 'success' as 'success' | 'error' | 'warning',
              message: 'Item added to cart',
            },
          ],
        },
      };

      const tree = signalTree(ecommerceState);

      // 🎯 Perfect type inference at every level of a complex real-world structure

      // Auth section - deep nesting with exact types
      expect(tree.state.auth.user.id()).toBe('user-123');
      expect(tree.state.auth.user.roles()).toEqual(['customer', 'premium']);
      expect(tree.state.auth.user.profile.preferences.currency()).toBe('USD');
      expect(
        tree.state.auth.user.profile.preferences.notifications.email()
      ).toBe(true);
      expect(tree.state.auth.session.expiresAt()).toEqual(
        new Date('2024-12-31')
      );

      // Cart section - arrays and complex objects
      expect(tree.state.cart.items()).toHaveLength(2);
      expect(tree.state.cart.total()).toBe(109.97);
      expect(tree.state.cart.discounts()).toEqual(['SAVE10', 'PREMIUM']);

      // UI section - nullable types and unions
      expect(tree.state.ui.loading()).toBe(false);
      expect(tree.state.ui.modal.type()).toBe(null);
      expect(tree.state.ui.notifications()).toHaveLength(1);

      // 🎯 Type-safe updates throughout the complex structure
      tree.state.auth.user.profile.preferences.currency.set('EUR');
      tree.state.cart.total.set(99.97);
      tree.state.ui.loading.set(true);
      tree.state.ui.modal.type.set('checkout');

      expect(tree.state.auth.user.profile.preferences.currency()).toBe('EUR');
      expect(tree.state.cart.total()).toBe(99.97);
      expect(tree.state.ui.loading()).toBe(true);
      expect(tree.state.ui.modal.type()).toBe('checkout');
    });

    it('should preserve exact literal types and const assertions', () => {
      const stateWithLiterals = {
        status: 'loading' as 'idle' | 'loading' | 'success' | 'error',
        theme: 'dark' as const,
        permissions: ['read', 'write', 'admin'] as const,
        config: {
          level: 'debug' as 'info' | 'warn' | 'error' | 'debug',
          features: {
            experimental: true,
            beta: ['feature-a', 'feature-b'] as const,
            stable: ['core', 'auth', 'ui'] as const,
          },
        },
        metadata: {
          version: '2.1.0' as const,
          environment: 'production' as 'development' | 'staging' | 'production',
        },
      };

      const tree = signalTree(stateWithLiterals);

      // ✅ Exact literal types preserved
      const status: 'idle' | 'loading' | 'success' | 'error' =
        tree.state.status();
      const theme: 'dark' = tree.state.theme();
      const permissions = tree.state.permissions(); // Arrays return as arrays, not exact tuples
      const level: 'info' | 'warn' | 'error' | 'debug' =
        tree.state.config.level();
      const beta = tree.state.config.features.beta(); // Arrays return as arrays
      const version: '2.1.0' = tree.state.metadata.version();

      expect(status).toBe('loading');
      expect(theme).toBe('dark');
      expect(permissions).toEqual(['read', 'write', 'admin']);
      expect(level).toBe('debug');
      expect(beta).toEqual(['feature-a', 'feature-b']);
      expect(version).toBe('2.1.0');

      // ✅ Type-safe updates with exact literal constraints
      tree.state.status.set('success');
      tree.state.config.level.set('error');
      tree.state.metadata.environment.set('staging');

      expect(tree.state.status()).toBe('success');
      expect(tree.state.config.level()).toBe('error');
      expect(tree.state.metadata.environment()).toBe('staging');
    });

    it('should handle mixed data types and maintain structure integrity', () => {
      const mixedState = {
        primitives: {
          string: 'hello',
          number: 42,
          boolean: true,
          nullValue: null,
          undefinedValue: undefined,
        },
        arrays: {
          numbers: [1, 2, 3],
          strings: ['a', 'b', 'c'],
          mixed: [1, 'two', true, null] as const,
          nested: [
            [1, 2],
            [3, 4],
          ] as const,
        },
        objects: {
          simple: { key: 'value' },
          nested: {
            level1: {
              level2: {
                deep: 'value',
              },
            },
          },
        },
        builtIns: {
          date: new Date('2024-01-01'),
          regex: /pattern/gi,
          map: new Map([['key', 'value']]),
          set: new Set([1, 2, 3]),
        },
        functions: {
          arrow: () => 'arrow',
          regular: function () {
            return 'regular';
          },
        },
      };

      const tree = signalTree(mixedState);

      // 🎯 All data types handled correctly with proper structure preservation

      // Primitives
      expect(tree.state.primitives.string()).toBe('hello');
      expect(tree.state.primitives.number()).toBe(42);
      expect(tree.state.primitives.boolean()).toBe(true);
      expect(tree.state.primitives.nullValue()).toBe(null);
      expect(tree.state.primitives.undefinedValue()).toBe(undefined);

      // Arrays (treated as primitives)
      expect(tree.state.arrays.numbers()).toEqual([1, 2, 3]);
      expect(tree.state.arrays.mixed()).toEqual([1, 'two', true, null]);
      expect(tree.state.arrays.nested()).toEqual([
        [1, 2],
        [3, 4],
      ]);

      // Objects (recursively signalified)
      expect(tree.state.objects.simple.key()).toBe('value');
      expect(tree.state.objects.nested.level1.level2.deep()).toBe('value');

      // Built-ins (treated as primitives)
      expect(tree.state.builtIns.date()).toEqual(new Date('2024-01-01'));
      expect(tree.state.builtIns.regex()).toEqual(/pattern/gi);
      expect(tree.state.builtIns.map()).toEqual(new Map([['key', 'value']]));
      expect(tree.state.builtIns.set()).toEqual(new Set([1, 2, 3]));

      // Functions (treated as primitives)
      expect(tree.state.functions.arrow()()).toBe('arrow');
      expect(tree.state.functions.regular()()).toBe('regular');

      // ✅ Updates work for all types
      tree.state.primitives.string.set('updated');
      tree.state.arrays.numbers.set([4, 5, 6]);
      tree.state.objects.simple.key.set('updated-value');
      tree.state.objects.nested.level1.level2.deep.set('updated-deep');

      expect(tree.state.primitives.string()).toBe('updated');
      expect(tree.state.arrays.numbers()).toEqual([4, 5, 6]);
      expect(tree.state.objects.simple.key()).toBe('updated-value');
      expect(tree.state.objects.nested.level1.level2.deep()).toBe(
        'updated-deep'
      );
    });
  });

  // 🚀 EXTREME DEPTH TESTING - PUSH THE LIMITS
  describe('EXTREME DEPTH: Testing Beyond Previous Limits', () => {
    it('should handle 10+ levels of nesting with perfect type inference', () => {
      // 🎯 10-LEVEL DEEP NESTING - Most extreme test yet
      const extremeDepthState = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: {
                        level9: {
                          level10: {
                            deepValue: 'extreme-depth-value',
                            deepNumber: 999,
                            deepBoolean: true,
                            deepArray: ['a', 'b', 'c'] as const,
                            deepLiteral: 'success' as
                              | 'pending'
                              | 'success'
                              | 'error',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tree = signalTree(extremeDepthState);

      // 🔥 10-LEVEL ACCESS WITH PERFECT TYPE SAFETY
      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepValue()
      ).toBe('extreme-depth-value');

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepNumber()
      ).toBe(999);

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepBoolean()
      ).toBe(true);

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepArray()
      ).toEqual(['a', 'b', 'c']);

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepLiteral()
      ).toBe('success');

      // 🔥 10-LEVEL UPDATES WITH TYPE SAFETY
      tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepValue.set(
        'updated-extreme-depth'
      );

      tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepLiteral.set(
        'error'
      );

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepValue()
      ).toBe('updated-extreme-depth');

      expect(
        tree.state.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deepLiteral()
      ).toBe('error');
    });

    it('should handle complex branching at extreme depths', () => {
      // 🌳 COMPLEX TREE STRUCTURE - Multiple branches at deep levels
      const complexBranchingState = {
        root: {
          branch1: {
            subbranch1a: {
              leaf1a1: {
                value: 'branch1-leaf1',
                metadata: {
                  created: new Date('2024-01-01'),
                  tags: ['tag1', 'tag2'] as const,
                  config: {
                    enabled: true,
                    priority: 'high' as 'low' | 'medium' | 'high',
                    details: {
                      nested: {
                        veryDeep: {
                          ultimate: 'branch1-ultimate-value',
                        },
                      },
                    },
                  },
                },
              },
            },
            subbranch1b: {
              leaf1b1: {
                value: 'branch1-leaf2',
                settings: {
                  theme: 'dark' as 'light' | 'dark',
                  advanced: {
                    performance: {
                      caching: true,
                      optimization: {
                        level: 'aggressive' as 'none' | 'basic' | 'aggressive',
                        details: {
                          compression: true,
                          minification: {
                            enabled: true,
                            level: 5,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          branch2: {
            subbranch2a: {
              leaf2a1: {
                data: {
                  array: [1, 2, 3, 4, 5],
                  object: {
                    nested: {
                      veryNested: {
                        extremelyNested: {
                          deepestValue: 'branch2-deepest',
                          numbers: [100, 200, 300] as const,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tree = signalTree(complexBranchingState);

      // 🔥 COMPLEX BRANCHING ACCESS - Multiple paths at extreme depth

      // Branch 1 - Path A
      expect(tree.state.root.branch1.subbranch1a.leaf1a1.value()).toBe(
        'branch1-leaf1'
      );

      expect(
        tree.state.root.branch1.subbranch1a.leaf1a1.metadata.config.priority()
      ).toBe('high');

      expect(
        tree.state.root.branch1.subbranch1a.leaf1a1.metadata.config.details.nested.veryDeep.ultimate()
      ).toBe('branch1-ultimate-value');

      // Branch 1 - Path B
      expect(
        tree.state.root.branch1.subbranch1b.leaf1b1.settings.advanced.performance.optimization.level()
      ).toBe('aggressive');

      expect(
        tree.state.root.branch1.subbranch1b.leaf1b1.settings.advanced.performance.optimization.details.minification.level()
      ).toBe(5);

      // Branch 2 - Different path
      expect(
        tree.state.root.branch2.subbranch2a.leaf2a1.data.object.nested.veryNested.extremelyNested.deepestValue()
      ).toBe('branch2-deepest');

      expect(
        tree.state.root.branch2.subbranch2a.leaf2a1.data.object.nested.veryNested.extremelyNested.numbers()
      ).toEqual([100, 200, 300]);

      // 🔥 COMPLEX UPDATES ACROSS DIFFERENT BRANCHES
      tree.state.root.branch1.subbranch1a.leaf1a1.metadata.config.details.nested.veryDeep.ultimate.set(
        'updated-ultimate'
      );

      tree.state.root.branch1.subbranch1b.leaf1b1.settings.advanced.performance.optimization.level.set(
        'basic'
      );

      tree.state.root.branch2.subbranch2a.leaf2a1.data.object.nested.veryNested.extremelyNested.deepestValue.set(
        'updated-deepest'
      );

      // Verify all updates
      expect(
        tree.state.root.branch1.subbranch1a.leaf1a1.metadata.config.details.nested.veryDeep.ultimate()
      ).toBe('updated-ultimate');

      expect(
        tree.state.root.branch1.subbranch1b.leaf1b1.settings.advanced.performance.optimization.level()
      ).toBe('basic');

      expect(
        tree.state.root.branch2.subbranch2a.leaf2a1.data.object.nested.veryNested.extremelyNested.deepestValue()
      ).toBe('updated-deepest');
    });

    it('should handle extreme complexity: 12+ levels with multiple data types', () => {
      // 🚀 ABSOLUTE EXTREME - 12+ levels with every data type
      const ultimateComplexState = {
        enterprise: {
          divisions: {
            technology: {
              departments: {
                engineering: {
                  teams: {
                    frontend: {
                      squads: {
                        coreUI: {
                          members: {
                            lead: {
                              profile: {
                                personal: {
                                  identity: {
                                    name: 'John Doe',
                                    id: 'ENG-001',
                                    role: 'tech-lead' as
                                      | 'junior'
                                      | 'senior'
                                      | 'tech-lead'
                                      | 'principal',
                                    status: 'active' as
                                      | 'active'
                                      | 'inactive'
                                      | 'on-leave',
                                    permissions: [
                                      'read',
                                      'write',
                                      'admin',
                                    ] as const,
                                    joinDate: new Date('2020-01-01'),
                                    skills: {
                                      technical: [
                                        'typescript',
                                        'angular',
                                        'rxjs',
                                      ] as const,
                                      leadership: true,
                                      certifications: {
                                        current: [
                                          'aws-solutions-architect',
                                          'typescript-expert',
                                        ] as const,
                                        expired: [] as string[],
                                        metadata: {
                                          lastUpdate: new Date('2024-06-01'),
                                          nextReview: new Date('2025-06-01'),
                                          validationLevel: 'enterprise' as
                                            | 'basic'
                                            | 'professional'
                                            | 'enterprise',
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tree = signalTree(ultimateComplexState);

      // 🔥 12+ LEVEL ACCESS - ULTIMATE DEPTH TEST
      const deepPath =
        tree.state.enterprise.divisions.technology.departments.engineering.teams
          .frontend.squads.coreUI.members.lead.profile.personal.identity;

      expect(deepPath.name()).toBe('John Doe');
      expect(deepPath.id()).toBe('ENG-001');
      expect(deepPath.role()).toBe('tech-lead');
      expect(deepPath.status()).toBe('active');
      expect(deepPath.permissions()).toEqual(['read', 'write', 'admin']);
      expect(deepPath.joinDate()).toEqual(new Date('2020-01-01'));
      expect(deepPath.skills.technical()).toEqual([
        'typescript',
        'angular',
        'rxjs',
      ]);
      expect(deepPath.skills.leadership()).toBe(true);
      expect(deepPath.skills.certifications.current()).toEqual([
        'aws-solutions-architect',
        'typescript-expert',
      ]);
      expect(deepPath.skills.certifications.metadata.validationLevel()).toBe(
        'enterprise'
      );

      // 🔥 ULTIMATE DEPTH UPDATES
      deepPath.role.set('principal');
      deepPath.status.set('on-leave');
      deepPath.skills.leadership.set(false);
      deepPath.skills.certifications.metadata.validationLevel.set(
        'professional'
      );

      // Verify ultimate depth updates
      expect(deepPath.role()).toBe('principal');
      expect(deepPath.status()).toBe('on-leave');
      expect(deepPath.skills.leadership()).toBe(false);
      expect(deepPath.skills.certifications.metadata.validationLevel()).toBe(
        'professional'
      );
    });

    it('should handle recursive self-similar structures at depth', () => {
      // 🔄 RECURSIVE PATTERNS - Self-similar structures
      const recursivePatternState = {
        organization: {
          name: 'Root Org',
          level: 0,
          subOrgs: [
            { id: 'child1', name: 'Child 1' },
            { id: 'child2', name: 'Child 2' },
          ] as const,
          config: {
            settings: {
              theme: 'corporate' as 'basic' | 'corporate' | 'enterprise',
              features: {
                advanced: {
                  analytics: {
                    enabled: true,
                    config: {
                      dashboards: {
                        executive: {
                          widgets: {
                            performance: {
                              metrics: {
                                kpis: {
                                  revenue: {
                                    target: 1000000,
                                    current: 850000,
                                    trend: 'up' as 'up' | 'down' | 'stable',
                                    details: {
                                      breakdown: {
                                        quarterly: {
                                          q1: 200000,
                                          q2: 250000,
                                          q3: 300000,
                                          q4: 100000, // current quarter partial
                                          projections: {
                                            q4Final: 350000,
                                            nextYear: {
                                              total: 1200000,
                                              confidence: 'high' as
                                                | 'low'
                                                | 'medium'
                                                | 'high',
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tree = signalTree(recursivePatternState);

      // 🔥 EXTREME RECURSIVE ACCESS
      const metricsPath =
        tree.state.organization.config.settings.features.advanced.analytics
          .config.dashboards.executive.widgets.performance.metrics.kpis.revenue;

      expect(metricsPath.target()).toBe(1000000);
      expect(metricsPath.current()).toBe(850000);
      expect(metricsPath.trend()).toBe('up');
      expect(metricsPath.details.breakdown.quarterly.q1()).toBe(200000);
      expect(
        metricsPath.details.breakdown.quarterly.projections.q4Final()
      ).toBe(350000);
      expect(
        metricsPath.details.breakdown.quarterly.projections.nextYear.total()
      ).toBe(1200000);
      expect(
        metricsPath.details.breakdown.quarterly.projections.nextYear.confidence()
      ).toBe('high');

      // 🔥 RECURSIVE PATTERN UPDATES
      metricsPath.trend.set('stable');
      metricsPath.details.breakdown.quarterly.q4.set(320000);
      metricsPath.details.breakdown.quarterly.projections.nextYear.confidence.set(
        'medium'
      );

      expect(metricsPath.trend()).toBe('stable');
      expect(metricsPath.details.breakdown.quarterly.q4()).toBe(320000);
      expect(
        metricsPath.details.breakdown.quarterly.projections.nextYear.confidence()
      ).toBe('medium');
    });

    it('should maintain performance with extreme depth and complexity', () => {
      // 🚀 PERFORMANCE TEST - Extreme depth with timing
      const performanceTestState = Array.from({ length: 5 }, (_, i) => ({
        [`section${i}`]: {
          subsection: {
            data: {
              level1: {
                level2: {
                  level3: {
                    level4: {
                      level5: {
                        level6: {
                          level7: {
                            level8: {
                              value: `deep-value-${i}`,
                              index: i,
                              active: i % 2 === 0,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })).reduce((acc, item) => ({ ...acc, ...item }), {});

      const startTime = performance.now();
      const tree = signalTree(performanceTestState);
      const creationTime = performance.now() - startTime;

      // Should create extremely deep structure quickly (< 50ms)
      expect(creationTime).toBeLessThan(50);

      // 🔥 ACCESS PERFORMANCE TEST
      const accessStart = performance.now();

      for (let i = 0; i < 5; i++) {
        const sectionKey = `section${i}` as keyof typeof tree.state;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const section = tree.state[sectionKey] as any;
        const path =
          section.subsection.data.level1.level2.level3.level4.level5.level6
            .level7.level8;
        expect(path.value()).toBe(`deep-value-${i}`);
        expect(path.index()).toBe(i);
        expect(path.active()).toBe(i % 2 === 0);
      }

      const accessTime = performance.now() - accessStart;

      // Should access deep paths quickly (< 10ms total for all 5)
      expect(accessTime).toBeLessThan(10);

      // 🔥 UPDATE PERFORMANCE TEST
      const updateStart = performance.now();

      for (let i = 0; i < 5; i++) {
        const sectionKey = `section${i}` as keyof typeof tree.state;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const section = tree.state[sectionKey] as any;
        const path =
          section.subsection.data.level1.level2.level3.level4.level5.level6
            .level7.level8;
        path.value.set(`updated-deep-value-${i}`);
        path.active.set(!path.active());
      }

      const updateTime = performance.now() - updateStart;

      // Should update deep paths quickly (< 5ms total for all 5)
      expect(updateTime).toBeLessThan(5);

      // Verify updates worked
      for (let i = 0; i < 5; i++) {
        const sectionKey = `section${i}` as keyof typeof tree.state;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const section = tree.state[sectionKey] as any;
        const path =
          section.subsection.data.level1.level2.level3.level4.level5.level6
            .level7.level8;
        expect(path.value()).toBe(`updated-deep-value-${i}`);
        expect(path.active()).toBe(!(i % 2 === 0));
      }
    });
  });
});

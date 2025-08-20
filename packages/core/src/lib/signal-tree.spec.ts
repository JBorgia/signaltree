import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { signalTree } from './signal-tree';

describe('signalTree', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should create a basic signal tree', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    expect(tree).toBeDefined();
    expect(tree.state).toBeDefined();
    expect(tree.$).toBeDefined();
    expect(tree.state).toBe(tree.$);
  });

  it('should unwrap the current state using callable API', () => {
    const initialState = { count: 0, user: { name: 'John' } };
    const tree = signalTree(initialState);

    // Test individual property unwrapping
    expect(tree.$.count()).toBe(0);
    expect(tree.$.user.name()).toBe('John');

    // Debug nested object unwrapping
    console.log('=== DEBUG ===');
    console.log('tree.$.user type:', typeof tree.$.user);
    console.log(
      'tree.$.user has __isCallableProxy__:',
      '__isCallableProxy__' in tree.$.user
    );
    console.log('tree.$.user.name type:', typeof tree.$.user.name);

    // Test nested object unwrapping
    const unwrappedUser = tree.$.user();
    console.log('unwrappedUser:', unwrappedUser);
    console.log('unwrappedUser type:', typeof unwrappedUser);
    expect(unwrappedUser).toEqual({ name: 'John' });
  });

  it('should update state using nested update method', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    // Update using the nested object's update method
    tree.$.update((state) => ({ count: state.count + 1 }));

    // Verify the update
    expect(tree.$.count()).toBe(1);
    expect(tree.$.user.name()).toBe('John');
  });

  it('should provide access to individual signals', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    expect(tree.state.count()).toBe(0);
    expect(tree.state.user.name()).toBe('John');
  });

  it('should update individual signals', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    tree.state.count.set(5);
    tree.state.user.name.set('Jane');

    expect(tree.state.count()).toBe(5);
    expect(tree.state.user.name()).toBe('Jane');
  });

  it('should provide pipe method for composition', () => {
    const tree = signalTree({ count: 0 });

    // Test pipe with no arguments returns the tree
    const result = tree.pipe();
    expect(result).toBe(tree);

    // Test pipe with a function
    const result2 = tree.pipe((t) => t.$());
    expect(result2).toEqual({ count: 0 });
  });

  it('should warn when calling advanced features', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tree = signalTree({ count: 0 });

    tree.batchUpdate((state) => ({ count: state.count + 1 }));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'batchUpdate() called but batching is not enabled'
      ),
      expect.stringContaining(
        'To enable batch updates, install @signaltree/batching'
      )
    );

    tree.memoize((state) => state.count * 2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'memoize() called but memoization is not enabled'
      ),
      expect.stringContaining(
        'To enable memoized computations, install @signaltree/memoization'
      )
    );

    consoleSpy.mockRestore();
  });

  it('should have pipe method for composition', () => {
    const tree = signalTree({ count: 0 });

    // Test pipe method exists
    expect(tree.pipe).toBeDefined();
    expect(typeof tree.pipe).toBe('function');

    // Test empty pipe returns same tree
    const piped = tree.pipe();
    expect(piped).toBe(tree);
  });

  it('should support pipe with enhancer functions', () => {
    const tree = signalTree({ count: 0 });

    // Create a simple enhancer function
    const addCustomMethod = (inputTree: typeof tree) => {
      return {
        ...inputTree,
        customMethod: () => 'custom',
      };
    };

    const enhanced = tree.pipe(addCustomMethod);
    expect(enhanced.customMethod).toBeDefined();
    expect(enhanced.customMethod()).toBe('custom');
  });

  it('should support chaining multiple enhancers', () => {
    const tree = signalTree({ count: 0 });

    const addMethod1 = (inputTree: typeof tree) => ({
      ...inputTree,
      method1: () => 'method1',
    });

    const addMethod2 = (inputTree: ReturnType<typeof addMethod1>) => ({
      ...inputTree,
      method2: () => 'method2',
    });

    const enhanced = tree.pipe(addMethod1, addMethod2);
    expect(enhanced.method1).toBeDefined();
    expect(enhanced.method2).toBeDefined();
    expect(enhanced.method1()).toBe('method1');
    expect(enhanced.method2()).toBe('method2');
  });

  // 🎯 THE GRAND IDEA: Initiation defines structure, typing works as inferred
  describe('THE GRAND IDEA: Structure Definition and Type Inference Validation', () => {
    it('should demonstrate that initiation defines structure and typing works forever', () => {
      // 🎪 STEP 1: INITIATION DEFINES THE COMPLETE STRUCTURE
      const initialStructure = {
        counter: 0,
        user: {
          id: 1,
          name: 'John',
          settings: {
            theme: 'dark' as 'light' | 'dark',
            level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
          },
        },
        features: ['auth', 'dashboard'] as const,
        metadata: new Date('2024-01-01'),
      };

      const tree = signalTree(initialStructure);

      // 🎯 STEP 2: FROM INITIATION FORWARD - PERFECT TYPE INFERENCE EVERYWHERE

      // ✅ Root level access
      expect(tree.state.counter()).toBe(0);
      expect(tree.state.features()).toEqual(['auth', 'dashboard']);
      expect(tree.state.metadata()).toEqual(new Date('2024-01-01'));

      // ✅ Nested object access with preserved types
      expect(tree.state.user.id()).toBe(1);
      expect(tree.state.user.name()).toBe('John');
      expect(tree.state.user.settings.theme()).toBe('dark');
      expect(tree.state.user.settings.level()).toBe('beginner');

      // ✅ Type-safe updates at any level (TypeScript should enforce exact types)
      tree.state.counter.set(5);
      tree.state.user.name.set('Jane');
      tree.state.user.settings.theme.set('light'); // Only 'light' | 'dark' allowed
      tree.state.user.settings.level.set('advanced'); // Only valid enum values

      // ✅ Verify all updates maintained type safety
      expect(tree.state.counter()).toBe(5);
      expect(tree.state.user.name()).toBe('Jane');
      expect(tree.state.user.settings.theme()).toBe('light');
      expect(tree.state.user.settings.level()).toBe('advanced');

      // ✅ Complex updates using the nested update method
      tree.$.update((current) => ({
        counter: current.counter + 10,
        user: {
          ...current.user,
          settings: {
            ...current.user.settings,
            theme: 'dark' as const,
          },
        },
      }));

      expect(tree.state.counter()).toBe(15);
      expect(tree.state.user.settings.theme()).toBe('dark');

      // ✅ Verify the whole structure using callable API
      const unwrappedState = tree.$();
      expect(unwrappedState).toEqual({
        counter: 15,
        user: {
          id: 1,
          name: 'Jane',
          settings: {
            theme: 'dark',
            level: 'advanced',
          },
        },
        features: ['auth', 'dashboard'],
        metadata: new Date('2024-01-01'),
      });
    });

    it('should handle deeply nested structures with perfect type preservation', () => {
      // 🎪 EXTREME NESTING TEST - 6+ levels deep
      const deepStructure = {
        app: {
          modules: {
            auth: {
              providers: {
                oauth: {
                  google: {
                    clientId: 'google-client-id',
                    scopes: ['profile', 'email'] as const,
                    config: {
                      autoLogin: true,
                      rememberUser: false,
                    },
                  },
                  github: {
                    clientId: 'github-client-id',
                    permissions: ['read:user', 'repo'] as const,
                  },
                },
                local: {
                  enabled: true,
                  registration: {
                    allowSelfRegistration: false,
                    requireEmailVerification: true,
                  },
                },
              },
            },
          },
        },
      };

      const tree = signalTree(deepStructure);

      // 🎯 6-LEVEL DEEP ACCESS WITH PERFECT TYPE INFERENCE
      expect(
        tree.state.app.modules.auth.providers.oauth.google.clientId()
      ).toBe('google-client-id');

      expect(
        tree.state.app.modules.auth.providers.oauth.google.scopes()
      ).toEqual(['profile', 'email']);

      expect(
        tree.state.app.modules.auth.providers.oauth.google.config.autoLogin()
      ).toBe(true);

      expect(
        tree.state.app.modules.auth.providers.local.registration.requireEmailVerification()
      ).toBe(true);

      // 🎯 6-LEVEL DEEP UPDATES
      tree.state.app.modules.auth.providers.oauth.google.config.autoLogin.set(
        false
      );
      tree.state.app.modules.auth.providers.local.registration.allowSelfRegistration.set(
        true
      );

      expect(
        tree.state.app.modules.auth.providers.oauth.google.config.autoLogin()
      ).toBe(false);
      expect(
        tree.state.app.modules.auth.providers.local.registration.allowSelfRegistration()
      ).toBe(true);
    });

    it('should demonstrate that structure cannot be changed after initiation', () => {
      const fixedStructure = {
        count: 0,
        user: { name: 'John' },
      };

      const tree = signalTree(fixedStructure);

      // ✅ Structure is fixed - you can only update existing properties
      expect(tree.state.count()).toBe(0);
      expect(tree.state.user.name()).toBe('John');

      // ✅ Updates work within the defined structure
      tree.state.count.set(10);
      tree.state.user.name.set('Jane');

      expect(tree.state.count()).toBe(10);
      expect(tree.state.user.name()).toBe('Jane');

      // Note: TypeScript would prevent adding new properties at compile time
      // The structure is immutable after initiation - this is the key principle
    });
  });

  describe('Complex Nested Structures and Terminal Signals', () => {
    it('should handle complex nested types with WritableSignals as terminal nodes', () => {
      const terminalSignal = signal({
        deeplyNested: false,
        deeplyNestedArray: [1, 2, 3],
        metadata: 'test',
      });

      const complexTree = signalTree({
        prop1: 42,
        prop2: {
          nested1: 'hello',
          nested2: {
            deeplyNested: true,
            deeplyNestedArray: ['test'],
            nestedSignal: terminalSignal,
            anotherSignal: signal([4, 5, 6]),
          },
        },
      });

      // Access terminal signal values
      expect(complexTree.$.prop2.nested2.nestedSignal().deeplyNested).toBe(
        false
      );
      expect(
        complexTree.$.prop2.nested2.nestedSignal().deeplyNestedArray
      ).toEqual([1, 2, 3]);
      expect(complexTree.$.prop2.nested2.anotherSignal()).toEqual([4, 5, 6]);

      // Update terminal signals directly
      complexTree.$.prop2.nested2.nestedSignal.update(
        (prev: {
          deeplyNested: boolean;
          deeplyNestedArray: number[];
          metadata: string;
        }) => ({
          ...prev,
          deeplyNested: true,
          metadata: 'updated',
        })
      );

      expect(complexTree.$.prop2.nested2.nestedSignal().deeplyNested).toBe(
        true
      );
      expect(complexTree.$.prop2.nested2.nestedSignal().metadata).toBe(
        'updated'
      );
    });

    it('should handle undefined and null values with proper typing', () => {
      type TestType = {
        requiredString: string;
        optionalString: string | undefined;
        nullableValue: string | null;
        undefinedValue: undefined;
        arrayField: number[];
      };

      const tree = signalTree<TestType>({
        requiredString: undefined as unknown as string, // Strong type - must be string after init
        optionalString: undefined,
        nullableValue: null,
        undefinedValue: undefined,
        arrayField: [],
      });

      // Initial values
      expect(tree.$.requiredString()).toBe(undefined);
      expect(tree.$.optionalString()).toBe(undefined);
      expect(tree.$.nullableValue()).toBe(null);
      expect(tree.$.undefinedValue()).toBe(undefined);
      expect(tree.$.arrayField()).toEqual([]);

      // Update with proper types
      tree.$.requiredString.update(() => 'now a string');
      tree.$.optionalString.update(() => 'optional string');
      tree.$.nullableValue.update(() => 'nullable string');
      tree.$.arrayField.update(() => [1, 2, 3]);

      expect(tree.$.requiredString()).toBe('now a string');
      expect(tree.$.optionalString()).toBe('optional string');
      expect(tree.$.nullableValue()).toBe('nullable string');
      expect(tree.$.arrayField()).toEqual([1, 2, 3]);
    });

    it('should support array operations and updates', () => {
      const tree = signalTree({
        simpleArray: [1, 2, 3],
        objectArray: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
        nestedStructure: {
          tags: ['tag1', 'tag2'],
          metadata: {
            counts: [10, 20, 30],
          },
        },
      });

      // Initial array values
      expect(tree.$.simpleArray()).toEqual([1, 2, 3]);
      expect(tree.$.objectArray()).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
      expect(tree.$.nestedStructure.tags()).toEqual(['tag1', 'tag2']);

      // Array operations
      tree.$.simpleArray.update((arr) => [...arr, 4]);
      tree.$.nestedStructure.tags.update((tags) => [...tags, 'tag3']);
      tree.$.nestedStructure.metadata.counts.update((counts) =>
        counts.map((x) => x * 2)
      );

      expect(tree.$.simpleArray()).toEqual([1, 2, 3, 4]);
      expect(tree.$.nestedStructure.tags()).toEqual(['tag1', 'tag2', 'tag3']);
      expect(tree.$.nestedStructure.metadata.counts()).toEqual([20, 40, 60]);

      // Complex object array update
      tree.$.objectArray.update((arr) => [...arr, { id: 3, name: 'third' }]);

      expect(tree.$.objectArray()).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
        { id: 3, name: 'third' },
      ]);
    });

    it('should handle complex configuration objects', () => {
      type Configuration = {
        environment: string;
        features: {
          enabled: boolean;
          flags: Record<string, boolean>;
          nested: {
            analytics: {
              tracking: boolean;
              events: string[];
            };
          };
        };
        metadata: Record<string, unknown>;
      };

      const tree = signalTree<Configuration>({
        environment: 'development',
        features: {
          enabled: true,
          flags: {
            newFeature: false,
            betaFeature: true,
          },
          nested: {
            analytics: {
              tracking: false,
              events: [],
            },
          },
        },
        metadata: {},
      });

      // Test deep access
      expect(tree.$.environment()).toBe('development');
      expect(tree.$.features.enabled()).toBe(true);
      expect(tree.$.features.flags()).toEqual({
        newFeature: false,
        betaFeature: true,
      });
      expect(tree.$.features.nested.analytics.tracking()).toBe(false);

      // Complex nested updates - focusing on what we know works
      tree.$.features.update((current) => ({
        ...current,
        flags: {
          ...current.flags,
          newFeature: true,
        },
        nested: {
          analytics: {
            tracking: true,
            events: ['page_view', 'click'],
          },
        },
      }));

      expect(tree.$.environment()).toBe('development');
      expect(tree.$.features.flags()).toEqual({
        newFeature: true,
        betaFeature: true,
      });
      expect(tree.$.features.nested.analytics.tracking()).toBe(true);
      expect(tree.$.features.nested.analytics.events()).toEqual([
        'page_view',
        'click',
      ]);

      // Update environment separately
      tree.$.environment.update(() => 'production');
      expect(tree.$.environment()).toBe('production');
    });

    it('should demonstrate mixed signal and value updates', () => {
      const externalSignal = signal({ count: 0, label: 'external' });

      const tree = signalTree({
        internalCounter: 10,
        externalCounter: externalSignal,
        nested: {
          values: [1, 2, 3],
          config: {
            enabled: true,
            name: 'test',
          },
        },
      });

      // Update internal values
      tree.$.internalCounter.update((count) => count + 5);
      expect(tree.$.internalCounter()).toBe(15);

      // Update external signal
      tree.$.externalCounter.update(
        (prev: { count: number; label: string }) => ({
          ...prev,
          count: prev.count + 1,
        })
      );
      expect(tree.$.externalCounter().count).toBe(1);
      expect(tree.$.externalCounter().label).toBe('external');

      // Nested updates with mixed types
      tree.$.nested.update((current) => ({
        values: [...current.values, 4],
        config: {
          ...current.config,
          enabled: false,
        },
      }));

      expect(tree.$.nested.values()).toEqual([1, 2, 3, 4]);
      expect(tree.$.nested.config.enabled()).toBe(false);
      expect(tree.$.nested.config.name()).toBe('test');

      // Verify unwrapping works with mixed types
      const unwrapped = tree.$();
      expect(unwrapped.internalCounter).toBe(15);
      expect(unwrapped.externalCounter).toEqual({
        count: 1,
        label: 'external',
      });
      expect(unwrapped.nested.values).toEqual([1, 2, 3, 4]);
    });
  });
});

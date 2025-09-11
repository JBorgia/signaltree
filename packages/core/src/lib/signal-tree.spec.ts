import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

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

  it('should unwrap the current state', () => {
    const initialState = { count: 0, user: { name: 'John' } };
    const tree = signalTree(initialState);

    const unwrapped = tree();
    expect(unwrapped).toEqual(initialState);
  });

  it('should update state using update method', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    tree((state) => ({ ...state, count: state.count + 1 }));

    const unwrapped = tree();
    expect(unwrapped.count).toBe(1);
    expect(unwrapped.user.name).toBe('John');
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

  it('supports leaf get and direct .set/.update (callable via transform)', () => {
    const tree = signalTree({
      n: 1,
      user: { name: 'A' },
      items: [] as number[],
    });

    // getter
    expect(tree.$.n()).toBe(1);
    expect(tree.$.user.name()).toBe('A');
    expect(tree.$.items()).toEqual([]);

    // setter (callable form requires transform; direct API used here)
    tree.$.n.set(2);
    tree.$.user.name.set('B');
    tree.$.items.set([1]);

    expect(tree.$.n()).toBe(2);
    expect(tree.$.user.name()).toBe('B');
    expect(tree.$.items()).toEqual([1]);

    // updater
    tree.$.n.update((v) => v + 1);
    tree.$.items.update((arr) => arr.concat(2));

    expect(tree.$.n()).toBe(3);
    expect(tree.$.items()).toEqual([1, 2]);
  });

  it('preserves external writable signals (callable via transform)', () => {
    const external = signal(10);
    const tree = signalTree({ external });

    // getter
    expect(tree.$.external()).toBe(10);
    // setter (callable form requires transform; direct API still available)
    tree.$.external.set(20);
    expect(tree.$.external()).toBe(20);
    // updater
    tree.$.external.update((v: number) => v + 1);
    expect(tree.$.external()).toBe(21);

    // original signal still updates
    external.set(30);
    expect(tree.$.external()).toBe(30);
  });

  it('should provide with method for composition', () => {
    const tree = signalTree({ count: 0 });

    // Test with with no arguments returns the tree
    const result = tree.with();
    expect(result).toBe(tree);

    // Test with with a function
    const result2 = tree.with((t) => t());
    expect(result2).toEqual({ count: 0 });
  });

  it('should warn when calling advanced features', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tree = signalTree({ count: 0 });

    tree.batchUpdate((state) => ({ count: state.count + 1 }));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('batching disabled')
    );

    tree.memoize((state) => state.count * 2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('memoize disabled')
    );

    consoleSpy.mockRestore();
  });

  it('should have with method for composition', () => {
    const tree = signalTree({ count: 0 });

    // Test with method exists
    expect(tree.with).toBeDefined();
    expect(typeof tree.with).toBe('function');

    // Test empty with returns same tree
    const withd = tree.with();
    expect(withd).toBe(tree);
  });

  it('should support with with enhancer functions', () => {
    const tree = signalTree({ count: 0 });

    // Create a simple enhancer function
    const addCustomMethod = (inputTree: typeof tree) => {
      return {
        ...inputTree,
        customMethod: () => 'custom',
      };
    };

    const enhanced = tree.with(addCustomMethod);
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

    const enhanced = tree.with(addMethod1, addMethod2);
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

      // ✅ Complex updates using the update method
      tree((current) => ({
        counter: current.counter + 10,
        user: {
          ...current.user,
          name: 'Jane', // Preserve the name change
          settings: {
            ...current.user.settings,
            theme: 'dark' as const,
            level: 'advanced' as const, // Preserve the level change
          },
        },
        features: current.features,
        metadata: current.metadata,
      }));

      expect(tree.state.counter()).toBe(15);
      expect(tree.state.user.settings.theme()).toBe('dark');

      // ✅ Unwrap maintains the original structure
      const unwrapped = tree();
      expect(unwrapped).toEqual({
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

  // ==============================================
  // COMPREHENSIVE FUNCTIONALITY TESTS
  // ==============================================

  describe('Set and Update Methods', () => {
    it('should provide set method on nested objects', () => {
      const tree = signalTree({
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark', notifications: true },
      });

      // Test set method on individual properties
      tree.state.user.name.set('Jane');
      tree.state.user.age.set(25);
      expect(tree.state.user.name()).toBe('Jane');
      expect(tree.state.user.age()).toBe(25);

      // Test partial update using update on individual property
      tree.state.settings.theme.set('light');
      expect(tree.state.settings.theme()).toBe('light');
      expect(tree.state.settings.notifications()).toBe(true); // Should remain unchanged
    });

    it('should provide update method on nested objects', () => {
      const tree = signalTree({
        counter: { value: 0, step: 1 },
        user: { name: 'John', age: 30 },
      });

      // Test update method
      tree.state.counter((current) => ({
        ...current,
        value: current.value + current.step,
      }));
      expect(tree.state.counter.value()).toBe(1);
      expect(tree.state.counter.step()).toBe(1);

      // Test complex update
      tree.state.user((current) => ({
        ...current,
        age: current.age + 1,
        name: current.name.toUpperCase(),
      }));
      expect(tree.state.user.name()).toBe('JOHN');
      expect(tree.state.user.age()).toBe(31);
    });

    it('should handle set/update on deeply nested structures', () => {
      const tree = signalTree({
        app: {
          user: {
            profile: {
              personal: { name: 'John', age: 30 },
              settings: { theme: 'dark', lang: 'en' },
            },
          },
        },
      });

      // Deep set
      tree.state.app.user.profile.personal({ name: 'Jane', age: 25 });
      expect(tree.state.app.user.profile.personal.name()).toBe('Jane');
      expect(tree.state.app.user.profile.personal.age()).toBe(25);

      // Deep update
      tree.state.app.user.profile.settings((current) => ({
        ...current,
        theme: current.theme === 'dark' ? 'light' : 'dark',
      }));
      expect(tree.state.app.user.profile.settings.theme()).toBe('light');
    });
  });

  describe('Array Handling', () => {
    it('should handle array updates correctly', () => {
      const tree = signalTree({
        items: [1, 2, 3],
        nested: {
          matrix: [
            [1, 2],
            [3, 4],
          ],
          objects: [{ id: 1, name: 'first' }],
        },
      });

      // Update simple array
      tree.state.items.update((arr: number[]) => [...arr, 4, 5]);
      expect(tree.state.items()).toEqual([1, 2, 3, 4, 5]);

      // Update nested array of arrays
      tree.state.nested.matrix.update((matrix: number[][]) => [
        ...matrix,
        [5, 6],
      ]);
      expect(tree.state.nested.matrix()).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      // Update array of objects
      tree.state.nested.objects.update(
        (objects: { id: number; name: string }[]) => [
          ...objects,
          { id: 2, name: 'second' },
        ]
      );
      expect(tree.state.nested.objects()).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ]);
    });
  });

  describe('Primitive Types Support', () => {
    it('should handle all primitive types correctly', () => {
      const tree = signalTree({
        string: 'hello',
        number: 42,
        boolean: true,
        date: new Date('2024-01-01'),
        regex: /test/g,
        null: null,
        array: [1, 2, 3],
        nested: {
          bigint: BigInt(123),
        },
      });

      // Test all types are accessible
      expect(tree.state.string()).toBe('hello');
      expect(tree.state.number()).toBe(42);
      expect(tree.state.boolean()).toBe(true);
      expect(tree.state.date()).toEqual(new Date('2024-01-01'));
      expect(tree.state.regex()).toEqual(/test/g);
      expect(tree.state.null()).toBe(null);
      expect(tree.state.array()).toEqual([1, 2, 3]);
      expect(tree.state.nested.bigint()).toBe(BigInt(123));

      // Test updates work
      tree.state.string.set('world');
      tree.state.number.set(100);
      tree.state.boolean.set(false);

      expect(tree.state.string()).toBe('world');
      expect(tree.state.number()).toBe(100);
      expect(tree.state.boolean()).toBe(false);
    });
  });

  describe('Undefined and Null Handling', () => {
    it('should handle undefined and null values correctly', () => {
      const tree = signalTree({
        optional: undefined as string | undefined,
        nullable: null as string | null,
        mixed: null as string | null | undefined,
        nested: {
          optional: undefined as number | undefined,
          nullable: null as boolean | null,
        },
      });

      // Test initial values
      expect(tree.state.optional()).toBe(undefined);
      expect(tree.state.nullable()).toBe(null);
      expect(tree.state.mixed()).toBe(null);

      // Test updates from undefined/null
      tree.state.optional.set('now defined');
      tree.state.nullable.set('now not null');
      tree.state.nested.optional.set(123);
      tree.state.nested.nullable.set(true);

      expect(tree.state.optional()).toBe('now defined');
      expect(tree.state.nullable()).toBe('now not null');
      expect(tree.state.nested.optional()).toBe(123);
      expect(tree.state.nested.nullable()).toBe(true);
    });
  });

  describe('Deep Nesting Support', () => {
    it('should handle very deep nesting (6+ levels)', () => {
      const tree = signalTree({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    value: 'deep value',
                    array: [1, 2, 3],
                  },
                },
              },
            },
          },
        },
      });

      // Test deep access
      const deepValue =
        tree.state.level1.level2.level3.level4.level5.level6.value();
      expect(deepValue).toBe('deep value');

      // Test deep updates
      tree.state.level1.level2.level3.level4.level5.level6.value.set(
        'updated deep value'
      );
      tree.state.level1.level2.level3.level4.level5.level6.array.update(
        (arr: number[]) => [...arr, 4, 5]
      );

      expect(tree.state.level1.level2.level3.level4.level5.level6.value()).toBe(
        'updated deep value'
      );
      expect(
        tree.state.level1.level2.level3.level4.level5.level6.array()
      ).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Multiple Instances Independence', () => {
    it('should maintain independence between multiple signal tree instances', () => {
      const tree1 = signalTree({ count: 1, name: 'tree1' });
      const tree2 = signalTree({ count: 2, name: 'tree2' });

      // Test initial independence
      expect(tree1.state.count()).toBe(1);
      expect(tree2.state.count()).toBe(2);

      // Test updates don't affect other instances
      tree1.state.count.set(10);
      tree2.state.count.set(20);

      expect(tree1.state.count()).toBe(10);
      expect(tree2.state.count()).toBe(20);
      expect(tree1.state.name()).toBe('tree1');
      expect(tree2.state.name()).toBe('tree2');
    });
  });

  describe('Signal Preservation', () => {
    it('should preserve existing signals behavior in initial state (identity may differ due to callable wrapper)', () => {
      const existingSignal = signal('signal value');
      const existingNestedSignal = signal({ deep: 'signal object' });

      const tree = signalTree({
        normalValue: 'normal',
        existingSignal,
        nested: {
          normalNested: 'nested normal',
          existingNestedSignal,
        },
      });

      // Test that values are accessible
      expect(tree.state.normalValue()).toBe('normal');
      expect(tree.state.existingSignal()).toBe('signal value');
      expect(tree.state.nested.normalNested()).toBe('nested normal');
      expect(tree.state.nested.existingNestedSignal()).toEqual({
        deep: 'signal object',
      });

      // Identity preserved for existing signals (no runtime wrapping)
      expect(tree.state.existingSignal).toBe(existingSignal);
      expect('set' in tree.state.existingSignal).toBe(true);
      expect(tree.state.nested.existingNestedSignal).toBe(existingNestedSignal);
      expect('set' in tree.state.nested.existingNestedSignal).toBe(true);
    });
  });

  describe('Unwrap Functionality', () => {
    it('should unwrap signal trees correctly', () => {
      const tree = signalTree({
        simple: 'string',
        number: 42,
        nested: {
          deep: {
            value: 'nested string',
            array: [1, 2, 3],
          },
        },
        array: ['a', 'b', 'c'],
      });

      // Test full unwrap
      const fullUnwrap = tree();
      expect(fullUnwrap).toEqual({
        simple: 'string',
        number: 42,
        nested: {
          deep: {
            value: 'nested string',
            array: [1, 2, 3],
          },
        },
        array: ['a', 'b', 'c'],
      });

      // Test unwrapped objects don't have signal methods
      expect(typeof fullUnwrap.simple).toBe('string');
      expect(typeof fullUnwrap.number).toBe('number');
      expect(Array.isArray(fullUnwrap.array)).toBe(true);
    });
  });

  describe('Type Safety and Strict Interfaces', () => {
    it('should work with strict TypeScript interfaces', () => {
      interface StrictInterface {
        id: number;
        name: string;
        metadata: {
          created: Date;
          tags: readonly string[];
        };
      }

      const tree = signalTree<StrictInterface>({
        id: 1,
        name: 'Test',
        metadata: {
          created: new Date('2024-01-01'),
          tags: ['tag1', 'tag2'] as const,
        },
      });

      // All operations should be type-safe
      expect(tree.state.id()).toBe(1);
      expect(tree.state.name()).toBe('Test');
      expect(tree.state.metadata.created()).toEqual(new Date('2024-01-01'));
      expect(tree.state.metadata.tags()).toEqual(['tag1', 'tag2']);

      // Test updates
      tree.state.id.set(2);
      tree.state.name.set('Updated Test');
      tree.state.metadata.created.set(new Date('2024-02-01'));

      expect(tree.state.id()).toBe(2);
      expect(tree.state.name()).toBe('Updated Test');
      expect(tree.state.metadata.created()).toEqual(new Date('2024-02-01'));
    });
  });

  describe('Performance and Large Objects', () => {
    it('should handle large objects efficiently', () => {
      const largeObject = signalTree({
        data: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [
            `item${i}`,
            { value: i, enabled: i % 2 === 0 },
          ])
        ),
        metadata: {
          count: 50,
          lastUpdated: new Date('2024-01-01'),
        },
      });

      // Test access to large object
      expect(largeObject.state.data['item0'].value()).toBe(0);
      expect(largeObject.state.data['item49'].value()).toBe(49);
      expect(largeObject.state.metadata.count()).toBe(50);

      // Test bulk update
      largeObject.state.metadata.count.set(100);
      expect(largeObject.state.metadata.count()).toBe(100);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle mixed content types correctly', () => {
      const tree = signalTree({
        content: {
          text: 'Sample text',
          html: '<p>HTML content</p>',
          json: { data: 'json data' },
          binary: new Uint8Array([1, 2, 3, 4]),
          map: new Map([
            ['key1', 'value1'],
            ['key2', 'value2'],
          ]),
          setObject: new Set(['item1', 'item2', 'item3']),
        },
      });

      expect(tree.state.content.text()).toBe('Sample text');
      expect(tree.state.content.html()).toBe('<p>HTML content</p>');
      expect(tree.state.content.json.data()).toBe('json data');
      expect(tree.state.content.binary()).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(tree.state.content.map()).toEqual(
        new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ])
      );
      expect(tree.state.content.setObject()).toEqual(
        new Set(['item1', 'item2', 'item3'])
      );
    });

    it('should handle batch operations simulation', () => {
      const tree = signalTree({
        counters: Array.from({ length: 5 }, (_, i) => ({ id: i, value: 0 })),
        status: 'idle' as 'idle' | 'running' | 'complete',
      });

      // Simulate multiple updates
      tree.state.status.set('running');
      tree.state.counters.update((counters: { id: number; value: number }[]) =>
        counters.map((counter) => ({ ...counter, value: counter.value + 1 }))
      );
      tree.state.status.set('complete');

      expect(tree.state.status()).toBe('complete');
      expect(tree.state.counters()).toEqual([
        { id: 0, value: 1 },
        { id: 1, value: 1 },
        { id: 2, value: 1 },
        { id: 3, value: 1 },
        { id: 4, value: 1 },
      ]);
    });
  });
});

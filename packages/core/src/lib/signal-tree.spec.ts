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

    const unwrapped = tree.unwrap();
    expect(unwrapped).toEqual(initialState);
  });

  it('should update state using update method', () => {
    const tree = signalTree({ count: 0, user: { name: 'John' } });

    tree.update((state) => ({ count: state.count + 1 }));

    const unwrapped = tree.unwrap();
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

  it('should provide pipe method for composition', () => {
    const tree = signalTree({ count: 0 });

    // Test pipe with no arguments returns the tree
    const result = tree.pipe();
    expect(result).toBe(tree);

    // Test pipe with a function
    const result2 = tree.pipe((t) => t.unwrap());
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
        'Set batchUpdates: true or install @signaltree/batching'
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

      // ✅ Complex updates using the update method
      tree.update((current) => ({
        counter: current.counter + 10,
        user: {
          // demonstrate sparse deep update: only change level, omit theme (should remain "light")
          settings: {
            level: 'advanced' as const,
          },
        },
      }));

      expect(tree.state.counter()).toBe(15);
      // Theme remains whatever was previously set (light) because we omitted it in sparse update
      expect(tree.state.user.settings.theme()).toBe('light');

      // ✅ Unwrap maintains the original structure
      const unwrapped = tree.unwrap();
      expect(unwrapped).toEqual({
        counter: 15,
        user: {
          id: 1,
          name: 'Jane',
          settings: {
            theme: 'light',
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
});

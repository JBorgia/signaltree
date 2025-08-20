import { signal } from './adapter';
import { signalTree } from './signal-tree';

describe('SignalTree Callable API', () => {
  it('should support callable unwrapping at root level', () => {
    const initialState = { count: 0, user: { name: 'John' } };
    const tree = signalTree(initialState);

    // Test callable unwrapping
    const unwrapped = tree.$();
    expect(unwrapped).toEqual({ count: 0, user: { name: 'John' } });
  });

  it('should support callable unwrapping at nested levels', () => {
    const initialState = {
      user: {
        profile: {
          name: 'John',
          settings: { theme: 'dark' },
        },
      },
    };
    const tree = signalTree(initialState);

    // Test nested callable unwrapping
    const userUnwrapped = tree.$.user();
    expect(userUnwrapped).toEqual({
      profile: {
        name: 'John',
        settings: { theme: 'dark' },
      },
    });

    const profileUnwrapped = tree.$.user.profile();
    expect(profileUnwrapped).toEqual({
      name: 'John',
      settings: { theme: 'dark' },
    });

    const settingsUnwrapped = tree.$.user.profile.settings();
    expect(settingsUnwrapped).toEqual({ theme: 'dark' });
  });

  it('should support update method at all levels', () => {
    const initialState = {
      count: 0,
      user: {
        name: 'John',
        profile: { age: 30 },
      },
    };
    const tree = signalTree(initialState);

    // Test root level update
    tree.$.update((state) => ({ count: state.count + 1 }));
    expect(tree.$.count()).toBe(1);

    // Test nested update
    tree.$.user.update((user) => ({ name: user.name + ' Doe' }));
    expect(tree.$.user.name()).toBe('John Doe');

    // Test deeply nested update
    tree.$.user.profile.update((profile) => ({ age: profile.age + 1 }));
    expect(tree.$.user.profile.age()).toBe(31);
  });

  it('should handle pre-existing signals correctly', () => {
    const existingSignal = signal([1, 2, 3]);
    const initialState = {
      data: existingSignal,
      count: 0,
    };
    const tree = signalTree(initialState);

    // Pre-existing signal should not be double-wrapped
    expect(tree.$.data).toBe(existingSignal);
    expect(tree.$.data()).toEqual([1, 2, 3]);

    // Should be able to update the existing signal
    tree.$.data.set([4, 5, 6]);
    expect(tree.$.data()).toEqual([4, 5, 6]);
  });

  it('should maintain type safety with complex nested structures', () => {
    const complexState = {
      user: {
        id: 1,
        profile: {
          name: 'John',
          settings: {
            theme: 'dark' as 'light' | 'dark',
            notifications: true,
          },
        },
      },
      metadata: new Date('2024-01-01'),
    };

    const tree = signalTree(complexState);

    // Test type-safe access
    const userId: number = tree.$.user.id();
    const userName: string = tree.$.user.profile.name();
    const theme: 'light' | 'dark' = tree.$.user.profile.settings.theme();
    const notifications: boolean = tree.$.user.profile.settings.notifications();
    const metadata: Date = tree.$.metadata();

    expect(userId).toBe(1);
    expect(userName).toBe('John');
    expect(theme).toBe('dark');
    expect(notifications).toBe(true);
    expect(metadata).toEqual(new Date('2024-01-01'));

    // Test type-safe updates
    tree.$.user.profile.settings.theme.set('light');
    expect(tree.$.user.profile.settings.theme()).toBe('light');
  });

  it('should support backward compatibility with tree.unwrap()', () => {
    const initialState = { count: 0, user: { name: 'John' } };
    const tree = signalTree(initialState);

    // Old API should still work
    const unwrapped = tree.unwrap();
    expect(unwrapped).toEqual({ count: 0, user: { name: 'John' } });

    // New API should produce same result
    const newUnwrapped = tree.$();
    expect(newUnwrapped).toEqual(unwrapped);
  });

  it('should support backward compatibility with tree.update()', () => {
    const initialState = { count: 0, user: { name: 'John' } };
    const tree = signalTree(initialState);

    // Old API should still work
    tree.update((state) => ({ count: state.count + 1 }));
    expect(tree.$.count()).toBe(1);

    // New API should work too
    tree.$.update((state) => ({ count: state.count + 1 }));
    expect(tree.$.count()).toBe(2);
  });

  it('should interleave update() and set() across nested branches (mixed behavior)', () => {
    const initial = {
      a: { b: { c: 1, d: 2 }, x: 100 },
      meta: { flag: true },
    };
    const tree = signalTree(initial);

    tree.$.update((s) => ({
      a: { x: s.a.x + 1 },
      meta: { flag: !s.meta.flag },
    }));
    expect(tree.$.a.x()).toBe(101);
    expect(tree.$.meta.flag()).toBe(false);

    tree.$.a.b.c.set(10);
    tree.$.a.update((a) => ({ b: { d: a.b.d + 3 } }));
    tree.$.a.b.update((b) => ({ c: b.c + 10 }));

    expect(tree.$()).toEqual({
      a: { b: { c: 20, d: 5 }, x: 101 },
      meta: { flag: false },
    });
  });

  it('should apply overlapping async updates (simulated concurrency)', async () => {
    const tree = signalTree({ value: 0, log: [] as number[] });

    const first = (async () => {
      await new Promise((r) => setTimeout(r, 25));
      tree.$.update((s) => ({ value: s.value + 1, log: [...s.log, 1] }));
    })();

    const second = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      tree.$.update((s) => ({ value: s.value + 2, log: [...s.log, 2] }));
    })();

    await Promise.all([first, second]);

    expect(tree.$.value()).toBe(3);
    expect(tree.$.log()).toEqual([2, 1]);
  });
});

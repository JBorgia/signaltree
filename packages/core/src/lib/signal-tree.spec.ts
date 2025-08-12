import { TestBed } from '@angular/core/testing';
import { signalTree } from './signaltree';

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
});

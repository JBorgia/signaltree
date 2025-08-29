import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import {
  withAsync,
  enableAsync,
  withHighPerformanceAsync,
  withRetry,
  withTimeout,
  withCancellation,
  withDebounce,
} from './async';

describe('Async', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should enhance tree with async capabilities', () => {
    const tree = signalTree({ count: 0 }).with(withAsync());

    expect(tree.asyncAction).toBeDefined();
    expect(tree.loadData).toBeDefined();
    expect(tree.submitForm).toBeDefined();
  });

  it('should create and execute async actions', async () => {
    const tree = signalTree({ count: 0, result: null as number | null }).with(
      withAsync()
    );

    const asyncOperation = tree.asyncAction(
      async (input: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return input * 2;
      },
      {
        onStart: () => ({ count: -1 }),
        onSuccess: (result) => ({ result }),
      }
    );

    expect(asyncOperation.pending()).toBe(false);
    expect(asyncOperation.error()).toBe(null);
    expect(asyncOperation.result()).toBe(null);

    const promise = asyncOperation.execute(5);
    expect(asyncOperation.pending()).toBe(true);
    expect(tree.unwrap().count).toBe(-1); // onStart was called

    const result = await promise;
    expect(result).toBe(10);
    expect(asyncOperation.pending()).toBe(false);
    expect(asyncOperation.result()).toBe(10);
    expect(tree.unwrap().result).toBe(10); // onSuccess was called
  });

  it('should handle async action errors', async () => {
    const tree = signalTree({ error: null as string | null }).with(withAsync());

    const asyncOperation = tree.asyncAction(
      async () => {
        throw new Error('Test error');
      },
      {
        onError: (error) => ({ error: error.message }),
      }
    );

    try {
      await asyncOperation.execute(undefined);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Test error');
    }

    expect(asyncOperation.pending()).toBe(false);
    expect(asyncOperation.error()?.message).toBe('Test error');
    expect(tree.unwrap().error).toBe('Test error'); // onError was called
  });

  it('should call onComplete hook regardless of success or failure', async () => {
    const tree = signalTree({ completed: false as boolean }).with(withAsync());

    const onComplete = jest.fn(() => ({ completed: true as boolean }));

    // Test successful completion
    const successOperation = tree.asyncAction(async () => 'success', {
      onComplete,
    });

    await successOperation.execute(undefined);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(tree.unwrap().completed).toBe(true);

    // Reset and test failed completion
    tree.update(() => ({ completed: false }));
    onComplete.mockClear();

    const failOperation = tree.asyncAction(
      async () => {
        throw new Error('fail');
      },
      { onComplete }
    );

    try {
      await failOperation.execute(undefined);
    } catch {
      // Expected to fail
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(tree.unwrap().completed).toBe(true);
  });

  it('should work with loadData convenience method', async () => {
    const tree = signalTree({
      data: null as { users: string[] } | null,
      loading: false as boolean,
    }).with(withAsync());

    const loadAction = tree.loadData(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { users: ['Alice', 'Bob'] };
      },
      {
        onStart: () => ({ loading: true as boolean }),
        onSuccess: (result) => ({ data: result, loading: false as boolean }),
      }
    );

    expect(loadAction.pending()).toBe(false);

    const promise = loadAction.execute();
    expect(loadAction.pending()).toBe(true);
    expect(tree.unwrap().loading).toBe(true);

    const result = await promise;
    expect(result).toEqual({ users: ['Alice', 'Bob'] });
    expect(loadAction.pending()).toBe(false);
    expect(tree.unwrap().data).toEqual({ users: ['Alice', 'Bob'] });
    expect(tree.unwrap().loading).toBe(false);
  });

  it('should work with submitForm convenience method', async () => {
    const tree = signalTree({
      submitting: false as boolean,
      submitResult: null as { id: number; name: string } | null,
    }).with(withAsync());

    const submitAction = tree.submitForm(
      async (formData: { name: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id: 1, ...formData };
      },
      {
        onStart: () => ({ submitting: true as boolean }),
        onSuccess: (result) => ({
          submitResult: result,
          submitting: false as boolean,
        }),
      }
    );

    const result = await submitAction.execute({ name: 'John' });
    expect(result).toEqual({ id: 1, name: 'John' });
    expect(tree.unwrap().submitResult).toEqual({ id: 1, name: 'John' });
    expect(tree.unwrap().submitting).toBe(false);
  });

  it('should work with enableAsync convenience function', () => {
    const tree = signalTree({ count: 0 }).with(enableAsync());
    expect(tree.asyncAction).toBeDefined();
  });

  it('should work with high performance async', () => {
    const tree = signalTree({ count: 0 }).with(withHighPerformanceAsync());
    expect(tree.asyncAction).toBeDefined();
  });

  it('should disable async when enabled is false', () => {
    const tree = signalTree({ count: 0 }).with(withAsync({ enabled: false }));

    // Should not have enhanced the tree
    expect(tree.loadData).toBeUndefined();
    expect(tree.submitForm).toBeUndefined();
  });

  describe('Utility Functions', () => {
    it('should retry failed operations', async () => {
      let attemptCount = 0;

      const operation = withRetry(
        async (input: number) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error(`Attempt ${attemptCount} failed`);
          }
          return input * 2;
        },
        3,
        10
      );

      const result = await operation(5);
      expect(result).toBe(10);
      expect(attemptCount).toBe(3);
    });

    it('should timeout operations that take too long', async () => {
      const operation = withTimeout(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      }, 50);

      try {
        await operation(undefined);
        fail('Should have timed out');
      } catch (error) {
        expect((error as Error).message).toContain('timed out');
      }
    });

    it('should support operation cancellation', async () => {
      const { execute, cancel, cancelled } = withCancellation(
        async (input: number, signal: AbortSignal) => {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
          return input * 2;
        }
      );

      expect(cancelled()).toBe(false);

      const promise = execute(5);

      // Cancel after a short delay
      setTimeout(() => cancel(), 10);

      try {
        await promise;
        fail('Should have been cancelled');
      } catch (error) {
        expect((error as Error).message).toBe('Operation was cancelled');
        expect(cancelled()).toBe(true);
      }
    });

    it('should debounce operations', async () => {
      let executionCount = 0;

      const operation = withDebounce(async (input: number) => {
        executionCount++;
        return input * 2;
      }, 50);

      // Fire multiple operations quickly
      const promises = [operation(1), operation(2), operation(3)];

      // Wait for the operations
      try {
        await Promise.all(promises);
      } catch {
        // Expected - earlier promises should be rejected
      }

      // Wait for the debounce timeout to complete
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Only the last operation should have executed
      expect(executionCount).toBe(1);

      // Wait a bit more and try the final operation
      const finalResult = await operation(4);
      expect(finalResult).toBe(8);
      expect(executionCount).toBe(2);
    });
  });
});

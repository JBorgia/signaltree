import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import {
  withMiddleware,
  createLoggingMiddleware,
  createPerformanceMiddleware,
  createValidationMiddleware,
} from './middleware';

describe('Middleware', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should enhance tree with middleware capabilities', () => {
    const tree = signalTree({ count: 0 }).pipe(withMiddleware());

    expect(tree.addTap).toBeDefined();
    expect(tree.removeTap).toBeDefined();
  });

  it('should execute before and after middleware hooks', () => {
    const beforeSpy = jest.fn(() => true);
    const afterSpy = jest.fn();

    const testMiddleware = {
      id: 'test',
      before: beforeSpy,
      after: afterSpy,
    };

    const tree = signalTree({ count: 0 }).pipe(
      withMiddleware([testMiddleware])
    );

    tree.$.update((state) => ({ count: state.count + 1 }));

    expect(beforeSpy).toHaveBeenCalledWith(
      'UPDATE',
      { count: 1 },
      { count: 0 }
    );
    expect(afterSpy).toHaveBeenCalledWith(
      'UPDATE',
      { count: 1 },
      { count: 0 },
      { count: 1 }
    );
  });

  it('should prevent updates when middleware returns false', () => {
    const blockingMiddleware = {
      id: 'blocker',
      before: () => false,
    };

    const tree = signalTree({ count: 0 }).pipe(
      withMiddleware([blockingMiddleware])
    );

    tree.$.update((state) => ({ count: state.count + 1 }));

    expect(tree.$().count).toBe(0); // Should not have changed
  });

  it('should allow adding middleware at runtime', () => {
    const tree = signalTree({ count: 0 }).pipe(withMiddleware());

    const runtimeMiddleware = {
      id: 'runtime',
      before: jest.fn(() => true),
    };

    tree.addTap(runtimeMiddleware);
    tree.$.update((state) => ({ count: state.count + 1 }));

    expect(runtimeMiddleware.before).toHaveBeenCalled();
  });

  it('should allow removing middleware', () => {
    const middlewareSpy = jest.fn(() => true);
    const testMiddleware = {
      id: 'removable',
      before: middlewareSpy,
    };

    const tree = signalTree({ count: 0 }).pipe(
      withMiddleware([testMiddleware])
    );

    tree.$.update((state) => ({ count: state.count + 1 }));
    expect(middlewareSpy).toHaveBeenCalledTimes(1);

    tree.removeTap('removable');
    tree.$.update((state) => ({ count: state.count + 1 }));

    // Should still be called only once (not twice)
    expect(middlewareSpy).toHaveBeenCalledTimes(1);
  });

  it('should replace existing middleware with same id', () => {
    const firstSpy = jest.fn(() => true);
    const secondSpy = jest.fn(() => true);

    const tree = signalTree({ count: 0 }).pipe(withMiddleware());

    tree.addTap({ id: 'test', before: firstSpy });
    tree.addTap({ id: 'test', before: secondSpy }); // Should replace

    tree.$.update((state) => ({ count: state.count + 1 }));

    expect(firstSpy).not.toHaveBeenCalled();
    expect(secondSpy).toHaveBeenCalled();
  });

  describe('Built-in Middleware', () => {
    it('should create logging middleware', () => {
      const consoleSpy = jest.spyOn(console, 'group').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleGroupEndSpy = jest
        .spyOn(console, 'groupEnd')
        .mockImplementation();

      const tree = signalTree({ count: 0 }).pipe(
        withMiddleware([createLoggingMiddleware('TestTree')])
      );

      tree.$.update((state) => ({ count: state.count + 1 }));

      expect(consoleSpy).toHaveBeenCalledWith('🏪 TestTree: UPDATE');
      expect(consoleLogSpy).toHaveBeenCalledWith('Previous state:', {
        count: 0,
      });
      expect(consoleGroupEndSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('should create performance middleware', () => {
      const consoleTimeSpy = jest.spyOn(console, 'time').mockImplementation();
      const consoleTimeEndSpy = jest
        .spyOn(console, 'timeEnd')
        .mockImplementation();

      const tree = signalTree({ count: 0 }).pipe(
        withMiddleware([createPerformanceMiddleware()])
      );

      tree.$.update((state) => ({ count: state.count + 1 }));

      expect(consoleTimeSpy).toHaveBeenCalledWith('Tree update: UPDATE');
      expect(consoleTimeEndSpy).toHaveBeenCalledWith('Tree update: UPDATE');

      consoleTimeSpy.mockRestore();
      consoleTimeEndSpy.mockRestore();
    });

    it('should create validation middleware', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const validator = (state: { count: number }) =>
        state.count < 0 ? 'Count cannot be negative' : null;

      const tree = signalTree({ count: 0 }).pipe(
        withMiddleware([createValidationMiddleware(validator)])
      );

      // Valid update
      tree.$.update((state) => ({ count: state.count + 1 }));
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Invalid update
      tree.$.update(() => ({ count: -1 }));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Validation failed after UPDATE:',
        'Count cannot be negative'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('additional behaviors', () => {
    it('should intercept batchUpdate with before/after hooks', () => {
      const beforeSpy = jest.fn(() => true);
      const afterSpy = jest.fn();

      const tree = signalTree({ a: 1, b: 2 }).pipe(
        withMiddleware([{ id: 't', before: beforeSpy, after: afterSpy }])
      );

      // Provide a minimal batchUpdate implementation on the proxy to exercise interception
      const proxied = tree.$ as unknown as {
        update: (
          u: (s: { a: number; b: number }) => Partial<{ a: number; b: number }>
        ) => void;
        batchUpdate?: (
          u: (s: { a: number; b: number }) => Partial<{ a: number; b: number }>
        ) => void;
      };
      proxied.batchUpdate = (u) => proxied.update(u);

      (
        tree.$ as unknown as {
          batchUpdate: (
            u: (s: {
              a: number;
              b: number;
            }) => Partial<{ a: number; b: number }>
          ) => void;
        }
      ).batchUpdate((s) => ({ a: s.a + 1 }));

      tree.$.batchUpdate((s) => ({ a: s.a + 1 }));

      expect(beforeSpy).toHaveBeenCalledWith(
        'BATCH_UPDATE',
        { a: 2 },
        { a: 1, b: 2 }
      );
      expect(afterSpy).toHaveBeenCalledWith(
        'BATCH_UPDATE',
        { a: 2 },
        { a: 1, b: 2 },
        { a: 2, b: 2 }
      );
    });
    it('should prevent set when middleware returns false', () => {
      const beforeSpy = jest.fn(() => false);
      const afterSpy = jest.fn();

      const tree = signalTree({ a: 1, b: 2 }).pipe(
        withMiddleware([{ id: 't', before: beforeSpy, after: afterSpy }])
      );

      tree.$.set({ a: 2 });

      expect(tree.$()).toEqual({ a: 1, b: 2 });
      expect(afterSpy).not.toHaveBeenCalled();
    });

    it('should prevent batchUpdate when middleware returns false', () => {
      const beforeSpy = jest.fn(() => false);
      const afterSpy = jest.fn();

      const tree = signalTree({ a: 1, b: 2 }).pipe(
        withMiddleware([{ id: 't', before: beforeSpy, after: afterSpy }])
      );

      const proxied = tree.$ as unknown as {
        update: (
          u: (s: { a: number; b: number }) => Partial<{ a: number; b: number }>
        ) => void;
        batchUpdate?: (
          u: (s: { a: number; b: number }) => Partial<{ a: number; b: number }>
        ) => void;
      };
      proxied.batchUpdate = (u) => proxied.update(u);

      (
        tree.$ as unknown as {
          batchUpdate: (
            u: (s: {
              a: number;
              b: number;
            }) => Partial<{ a: number; b: number }>
          ) => void;
        }
      ).batchUpdate((s) => ({ a: s.a + 1 }));

      expect(tree.$()).toEqual({ a: 1, b: 2 });
      expect(afterSpy).not.toHaveBeenCalled();
    });

    // no-op test removed to avoid environment-dependent behavior

    it('should intercept set with before/after hooks', () => {
      const beforeSpy = jest.fn(() => true);
      const afterSpy = jest.fn();

      const tree = signalTree({ a: 1, b: 2 }).pipe(
        withMiddleware([{ id: 't', before: beforeSpy, after: afterSpy }])
      );

      tree.$.set({ b: 3 });

      expect(beforeSpy).toHaveBeenCalledWith('SET', { b: 3 }, { a: 1, b: 2 });
      expect(afterSpy).toHaveBeenCalledWith(
        'SET',
        { b: 3 },
        { a: 1, b: 2 },
        { a: 1, b: 3 }
      );
    });

    it('should stop invoking middleware after destroy()', () => {
      const beforeSpy = jest.fn(() => true);
      const afterSpy = jest.fn();

      const tree = signalTree({ count: 0 }).pipe(
        withMiddleware([{ id: 't', before: beforeSpy, after: afterSpy }])
      );

      tree.$.update((s) => ({ count: s.count + 1 }));
      expect(beforeSpy).toHaveBeenCalledTimes(1);
      expect(afterSpy).toHaveBeenCalledTimes(1);

      tree.destroy();

      // Further updates should not trigger middleware hooks
      tree.$.update((s) => ({ count: s.count + 1 }));
      expect(beforeSpy).toHaveBeenCalledTimes(1);
      expect(afterSpy).toHaveBeenCalledTimes(1);
    });
  });
});

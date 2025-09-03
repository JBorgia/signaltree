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
    const tree = signalTree({ count: 0 }).with(withMiddleware());

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

    const tree = signalTree({ count: 0 }).with(
      withMiddleware([testMiddleware])
    );

    tree((state) => ({ count: state.count + 1 }));

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

    const tree = signalTree({ count: 0 }).with(
      withMiddleware([blockingMiddleware])
    );

    tree((state) => ({ count: state.count + 1 }));

    expect(tree().count).toBe(0); // Should not have changed
  });

  it('should allow adding middleware at runtime', () => {
    const tree = signalTree({ count: 0 }).with(withMiddleware());

    const runtimeMiddleware = {
      id: 'runtime',
      before: jest.fn(() => true),
    };

    tree.addTap(runtimeMiddleware);
    tree((state) => ({ count: state.count + 1 }));

    expect(runtimeMiddleware.before).toHaveBeenCalled();
  });

  it('should allow removing middleware', () => {
    const middlewareSpy = jest.fn(() => true);
    const testMiddleware = {
      id: 'removable',
      before: middlewareSpy,
    };

    const tree = signalTree({ count: 0 }).with(
      withMiddleware([testMiddleware])
    );

    tree((state) => ({ count: state.count + 1 }));
    expect(middlewareSpy).toHaveBeenCalledTimes(1);

    tree.removeTap('removable');
    tree((state) => ({ count: state.count + 1 }));

    // Should still be called only once (not twice)
    expect(middlewareSpy).toHaveBeenCalledTimes(1);
  });

  it('should replace existing middleware with same id', () => {
    const firstSpy = jest.fn(() => true);
    const secondSpy = jest.fn(() => true);

    const tree = signalTree({ count: 0 }).with(withMiddleware());

    tree.addTap({ id: 'test', before: firstSpy });
    tree.addTap({ id: 'test', before: secondSpy }); // Should replace

    tree((state) => ({ count: state.count + 1 }));

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

      const tree = signalTree({ count: 0 }).with(
        withMiddleware([createLoggingMiddleware('TestTree')])
      );

      tree((state) => ({ count: state.count + 1 }));

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

      const tree = signalTree({ count: 0 }).with(
        withMiddleware([createPerformanceMiddleware()])
      );

      tree((state) => ({ count: state.count + 1 }));

      expect(consoleTimeSpy).toHaveBeenCalledWith('Tree update: UPDATE');
      expect(consoleTimeEndSpy).toHaveBeenCalledWith('Tree update: UPDATE');

      consoleTimeSpy.mockRestore();
      consoleTimeEndSpy.mockRestore();
    });

    it('should create validation middleware', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const validator = (state: { count: number }) =>
        state.count < 0 ? 'Count cannot be negative' : null;

      const tree = signalTree({ count: 0 }).with(
        withMiddleware([createValidationMiddleware(validator)])
      );

      // Valid update
      tree((state) => ({ count: state.count + 1 }));
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Invalid update
      tree(() => ({ count: -1 }));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Validation failed after UPDATE:',
        'Count cannot be negative'
      );

      consoleErrorSpy.mockRestore();
    });
  });
});

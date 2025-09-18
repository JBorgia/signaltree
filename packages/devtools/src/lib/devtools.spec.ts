import { signalTree } from '@signaltree/core';

import {
  enableDevTools,
  ModuleMetadata,
  withDevTools,
  withFullDevTools,
  withProductionDevTools,
} from './devtools';

describe('Modular DevTools', () => {
  interface TestState {
    count: number;
    user: { name: string; id: number };
    items: string[];
    [key: string]: unknown;
    [key: number]: unknown;
    [key: symbol]: unknown;
  }

  const initialState: TestState = {
    count: 0,
    user: { name: 'test', id: 1 },
    items: ['a', 'b'],
  };

  beforeEach(() => {
    // Reset any global state
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('withDevTools', () => {
    it('should enhance tree with devtools interface', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      expect(tree.__devTools).toBeDefined();
      expect(tree.__devTools.activityTracker).toBeDefined();
      expect(tree.__devTools.logger).toBeDefined();
      expect(tree.__devTools.metrics).toBeDefined();
    });

    it('should track module composition', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      const modules = ['core', 'batching', 'async'];
      tree.__devTools.trackComposition(modules);

      const metrics = tree.__devTools.metrics();
      expect(metrics.compositionChain).toEqual(modules);
    });

    it('should start and end module profiling', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      const profileId = tree.__devTools.startModuleProfiling('testModule');
      expect(profileId).toContain('testModule');
      expect(profileId).toContain('_');

      // End profiling should not throw
      expect(() => tree.__devTools.endModuleProfiling(profileId)).not.toThrow();
    });

    it('should track activity via activity tracker', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      tree.__devTools.activityTracker.trackMethodCall(
        'testModule',
        'testMethod',
        10
      );

      const moduleActivity =
        tree.__devTools.activityTracker.getModuleActivity('testModule');
      expect(moduleActivity).toBeDefined();
      expect(moduleActivity?.name).toBe('testModule');
      expect(moduleActivity?.operationCount).toBe(1);
      expect(moduleActivity?.averageExecutionTime).toBe(10);
    });

    it('should track errors', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      const error = new Error('Test error');
      tree.__devTools.activityTracker.trackError(
        'testModule',
        error,
        'test context'
      );

      expect(console.error).toHaveBeenCalledWith(
        '❌ [testModule] Error in test context:',
        error
      );
    });

    it('should log composition events', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      const modules = ['core', 'async'];
      tree.__devTools.logger.logComposition(modules, 'with');

      expect(console.log).toHaveBeenCalledWith(
        '🔗 Composition with:',
        'core → async'
      );
    });

    it('should export debug session', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree' })
      );

      const modules = ['core', 'async'];
      tree.__devTools.trackComposition(modules);
      tree.__devTools.activityTracker.trackMethodCall(
        'testModule',
        'testMethod',
        15
      );

      const session = tree.__devTools.exportDebugSession();

      expect(session.metrics).toBeDefined();
      expect(session.modules).toHaveLength(1);
      expect(session.modules[0].name).toBe('testModule');
      expect(session.logs).toBeDefined();
      expect(session.compositionHistory).toHaveLength(1);
      expect(session.compositionHistory[0].chain).toEqual(modules);
    });

    it('should track performance warnings', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree', performanceThreshold: 10 })
      );

      tree.__devTools.logger.logPerformanceWarning(
        'slowModule',
        'slowOperation',
        25,
        10
      );

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️ [slowModule] Slow slowOperation: 25.00ms (threshold: 10ms)'
      );
    });

    it('should connect to DevTools', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'TestTree', enableBrowserDevTools: false })
      );

      tree.__devTools.connectDevTools('TestConnection');

      // Should not connect when browser devtools disabled
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('withDevTools disabled', () => {
    it('should return noop interface when disabled', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ enabled: false })
      );

      expect(tree.__devTools).toBeDefined();

      // Should not throw when calling methods
      expect(() => tree.__devTools.trackComposition(['test'])).not.toThrow();
      expect(() =>
        tree.__devTools.activityTracker.trackMethodCall('test', 'test', 1)
      ).not.toThrow();
      expect(() =>
        tree.__devTools.logger.logComposition(['test'], 'with')
      ).not.toThrow();

      const metrics = tree.__devTools.metrics();
      expect(metrics.totalUpdates).toBe(0);
      expect(Object.keys(metrics.moduleUpdates)).toHaveLength(0);
    });
  });

  describe('convenience functions', () => {
    it('should create basic devtools with enableDevTools', () => {
      const tree = signalTree(initialState).with(enableDevTools('BasicTree'));

      expect(tree.__devTools).toBeDefined();
      expect(tree.__devTools.metrics).toBeDefined();
    });

    it('should create full devtools with withFullDevTools', () => {
      const tree = signalTree(initialState).with(withFullDevTools('FullTree'));

      expect(tree.__devTools).toBeDefined();
      expect(tree.__devTools.activityTracker).toBeDefined();
      expect(tree.__devTools.logger).toBeDefined();
    });

    it('should create production devtools with withProductionDevTools', () => {
      const tree = signalTree(initialState).with(withProductionDevTools());

      expect(tree.__devTools).toBeDefined();
      // Production devtools should still have the interface but with minimal logging
      expect(tree.__devTools.metrics).toBeDefined();
    });
  });

  describe('performance tracking', () => {
    it('should track update performance', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'PerfTree' })
      );

      const initialMetrics = tree.__devTools.metrics();
      expect(initialMetrics.totalUpdates).toBe(0);

      // Perform an update
      tree((state: TestState) => ({
        ...state,
        count: state.count + 1,
      }));

      // Should track the update
      const updatedMetrics = tree.__devTools.metrics();
      expect(updatedMetrics.totalUpdates).toBe(1);
      expect(updatedMetrics.moduleUpdates['core']).toBe(1);
    });

    it('should warn on slow updates', () => {
      const tree = signalTree(initialState).with(
        withDevTools({
          treeName: 'SlowTree',
          performanceThreshold: 0, // Very low threshold to trigger warning
        })
      );

      tree((state: TestState) => ({
        ...state,
        count: state.count + 1,
      }));

      // Should have logged a performance warning
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('logging functionality', () => {
    it('should disable logging when enableLogging is false', () => {
      const tree = signalTree(initialState).with(
        withDevTools({
          treeName: 'NoLogTree',
          enableLogging: false,
        })
      );

      tree.__devTools.logger.logComposition(['test'], 'with');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should export logs', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'LogTree' })
      );

      tree.__devTools.logger.logComposition(['module1', 'module2'], 'with');
      tree.__devTools.logger.logMethodExecution(
        'module1',
        'method1',
        [],
        'result'
      );

      const logs = tree.__devTools.logger.exportLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].type).toBe('composition');
      expect(logs[1].type).toBe('method');
    });
  });

  describe('module activity tracking', () => {
    it('should track multiple modules', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'MultiModuleTree' })
      );

      tree.__devTools.activityTracker.trackMethodCall('module1', 'method1', 10);
      tree.__devTools.activityTracker.trackMethodCall('module2', 'method2', 20);

      const allModules = tree.__devTools.activityTracker.getAllModules();
      expect(allModules).toHaveLength(2);

      const module1 = allModules.find(
        (m: ModuleMetadata) => m.name === 'module1'
      );
      const module2 = allModules.find(
        (m: ModuleMetadata) => m.name === 'module2'
      );

      expect(module1?.averageExecutionTime).toBe(10);
      expect(module2?.averageExecutionTime).toBe(20);
    });

    it('should update average execution time correctly', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'AvgTree' })
      );

      tree.__devTools.activityTracker.trackMethodCall('module1', 'method1', 10);
      tree.__devTools.activityTracker.trackMethodCall('module1', 'method2', 20);

      const module =
        tree.__devTools.activityTracker.getModuleActivity('module1');
      expect(module?.operationCount).toBe(2);
      expect(module?.averageExecutionTime).toBe(15); // (10 + 20) / 2
    });

    it('should track errors per module', () => {
      const tree = signalTree(initialState).with(
        withDevTools({ treeName: 'ErrorTree' })
      );

      tree.__devTools.activityTracker.trackMethodCall('module1', 'method1', 10);
      tree.__devTools.activityTracker.trackError('module1', new Error('test'));

      const module =
        tree.__devTools.activityTracker.getModuleActivity('module1');
      expect(module?.errorCount).toBe(1);
    });
  });
});

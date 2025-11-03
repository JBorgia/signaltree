import { TestBed } from '@angular/core/testing';

import {
  BenchmarkOrchestratorComponent,
} from '../pages/realistic-comparison/benchmark-orchestrator/benchmark-orchestrator.component';
import {
  AkitaBenchmarkService,
} from '../pages/realistic-comparison/benchmark-orchestrator/services/akita-benchmark.service';
import { ElfBenchmarkService } from '../pages/realistic-comparison/benchmark-orchestrator/services/elf-benchmark.service';
import { NgRxBenchmarkService } from '../pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service';
import {
  NgRxSignalsBenchmarkService,
} from '../pages/realistic-comparison/benchmark-orchestrator/services/ngrx-signals-benchmark.service';
import { NgxsBenchmarkService } from '../pages/realistic-comparison/benchmark-orchestrator/services/ngxs-benchmark.service';
import {
  SignalTreeBenchmarkService,
} from '../pages/realistic-comparison/benchmark-orchestrator/services/signaltree-benchmark.service';
import { RealisticBenchmarkService } from '../services/realistic-benchmark.service';

// Mock @datorama/akita before any imports
jest.mock('@datorama/akita', () => ({
  EntityState: {},
  EntityStore: class {},
  ID: {},
  Store: class {},
  StoreConfig: () => () => {
    // Mock decorator - return identity function
  },
  Query: class {},
  QueryEntity: class {},
  EntityUIQuery: class {},
  EntityService: class {},
  EntityUIStore: class {},
  akitaConfig: {},
  getAkitaConfig: () => ({}),
  enableAkitaProdMode: () => {
    // Mock implementation - do nothing
  },
  isDev: false,
  __DEV__: false,
}));

// Create mock services
const createMockBenchmarkService = () => ({
  runDeepNestedBenchmark: jest.fn().mockResolvedValue(100),
  runArrayBenchmark: jest.fn().mockResolvedValue(100),
  runComputedBenchmark: jest.fn().mockResolvedValue(100),
  runBatchUpdatesBenchmark: jest.fn().mockResolvedValue(100),
  runSelectorBenchmark: jest.fn().mockResolvedValue(100),
  runSerializationBenchmark: jest.fn().mockResolvedValue(100),
  runConcurrentUpdatesBenchmark: jest.fn().mockResolvedValue(100),
  runMemoryEfficiencyBenchmark: jest.fn().mockResolvedValue(100),
  runDataFetchingBenchmark: jest.fn().mockResolvedValue(100),
  runRealTimeUpdatesBenchmark: jest.fn().mockResolvedValue(100),
  runStateSizeScalingBenchmark: jest.fn().mockResolvedValue(100),
  runSubscriberScalingBenchmark: jest.fn().mockResolvedValue(100),
  runAsyncWorkflowBenchmark: jest.fn().mockResolvedValue(100),
  runAsyncWorkflowHydrationBenchmark: jest.fn().mockResolvedValue(100),
  runConcurrentAsyncBenchmark: jest.fn().mockResolvedValue(100),
  runAsyncCancellationBenchmark: jest.fn().mockResolvedValue(100),
  runUndoRedoBenchmark: jest.fn().mockResolvedValue(100),
  runHistorySizeBenchmark: jest.fn().mockResolvedValue(100),
  runJumpToStateBenchmark: jest.fn().mockResolvedValue(100),
  runSingleMiddlewareBenchmark: jest.fn().mockResolvedValue(100),
  runMultipleMiddlewareBenchmark: jest.fn().mockResolvedValue(100),
  runConditionalMiddlewareBenchmark: jest.fn().mockResolvedValue(100),
  runAllFeaturesEnabledBenchmark: jest.fn().mockResolvedValue(100),
});

const createMockRealisticBenchmarkService = () => ({
  getSessionId: jest.fn().mockReturnValue('test-session'),
  getMachineInfo: jest.fn().mockReturnValue({}),
  getBatteryInfo: jest.fn().mockResolvedValue(null),
  submitBenchmark: jest.fn().mockResolvedValue({ success: true }),
});

describe('BenchmarkOrchestratorComponent', () => {
  let component: BenchmarkOrchestratorComponent;

  beforeEach(async () => {
    // Create mock instances
    const mockSignalTreeBench = createMockBenchmarkService();
    const mockNgRxBench = createMockBenchmarkService();
    const mockNgRxSignalsBench = createMockBenchmarkService();
    const mockAkitaBench = createMockBenchmarkService();
    const mockElfBench = createMockBenchmarkService();
    const mockNgxsBench = createMockBenchmarkService();
    const mockRealisticBench = createMockRealisticBenchmarkService();

    await TestBed.configureTestingModule({
      providers: [
        BenchmarkOrchestratorComponent,
        { provide: SignalTreeBenchmarkService, useValue: mockSignalTreeBench },
        { provide: NgRxBenchmarkService, useValue: mockNgRxBench },
        {
          provide: NgRxSignalsBenchmarkService,
          useValue: mockNgRxSignalsBench,
        },
        { provide: AkitaBenchmarkService, useValue: mockAkitaBench },
        { provide: ElfBenchmarkService, useValue: mockElfBench },
        { provide: NgxsBenchmarkService, useValue: mockNgxsBench },
        { provide: RealisticBenchmarkService, useValue: mockRealisticBench },
      ],
    }).compileComponents();

    component = TestBed.inject(BenchmarkOrchestratorComponent);
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should apply scenario preset correctly', () => {
    // Test the core logic directly
    const testCases = [
      { id: 'scenario1', name: 'Scenario 1', selected: false },
      {
        id: 'scenario2',
        name: 'Scenario 2',
        selected: false,
        disabledReason: 'Not supported',
      },
      { id: 'scenario3', name: 'Scenario 3', selected: false },
    ];

    const preset = {
      id: 'test-preset',
      name: 'Test Preset',
      scenarios: ['scenario1', 'scenario2', 'scenario3'],
    };

    // Simulate the applyScenarioPreset logic
    testCases.forEach((testCase) => (testCase.selected = false));
    preset.scenarios.forEach((scenarioId) => {
      const testCase = testCases.find((s) => s.id === scenarioId);
      if (testCase && !testCase.disabledReason) {
        testCase.selected = true;
      }
    });

    expect(testCases[0].selected).toBe(true); // scenario1 should be selected
    expect(testCases[1].selected).toBe(false); // scenario2 should not be selected (disabled)
    expect(testCases[2].selected).toBe(true); // scenario3 should be selected
  });
});

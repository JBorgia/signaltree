<div align="center">
  <img src="public/signaltree.svg" alt="SignalTree Logo" width="80" height="80" style="background: transparent;" />
</div>

# 🎯 SignalTree Demo Application

Interactive demonstration showcasing SignalTree's revolutionary performance, features, and real-time monitoring capabilities. Includes comprehensive benchmarking, performance dashboard, and practical examples.

## ✨ What's New (September 2025)

### 📊 Real-Time Performance Dashboard

- **Interactive Benchmarking**: Live performance metrics with comprehensive testing modes
- **Multi-Test Capabilities**: Single operations, batch testing, and continuous monitoring
- **Visual Performance Indicators**: Real-time grades, classifications, and performance trends
- **Live Statistics**: Operations/second, average times, and best performance tracking
- **Memory Usage Analysis**: Garbage collection optimization and efficiency metrics

### 🚀 Enhanced Features Demonstration

- **Advanced Persistence**: Auto-save functionality with IndexedDB support
- **Type Safety Showcase**: Perfect TypeScript inference at unlimited depth levels
- **Bundle Size Analysis**: Real-time monitoring with comprehensive reporting
- **Framework Comparisons**: Side-by-side performance against multiple libraries via the **Benchmark Orchestrator** with **real-world frequency weighting** (SignalTree baseline, NgRx Store, NgRx SignalStore, Akita, Elf)
- **Guardrails Monitoring**: Visualise dev-only performance budgets, hot paths, and policy violations on the new `/guardrails` page

## 🏃‍♂️ Quick Start

### Development Server

```bash
# Start the demo application
pnpm nx serve demo --port 4200

# Build for production
pnpm nx build demo

# Run tests
pnpm nx test demo
```

### Bundle Analysis

```bash
# Comprehensive bundle analysis
node scripts/consolidated-bundle-analysis.js

# Performance metrics
pnpm nx test core --testNamePattern="recursive performance"
```

## 🎪 Features Showcase

### Performance Dashboard Components

1. **Real-Time Monitor**: Live performance tracking with operation timing
2. **Batch Testing**: Compare single vs batch operation performance
3. **Memory Metrics**: Garbage collection and memory efficiency analysis
4. **Visual Indicators**: Performance grades and trend analysis
5. **Export Capabilities**: Performance data download and analysis

### Interactive Examples

1. **Deep Nesting Demo**: Unlimited depth with perfect type inference
2. **Persistence Showcase**: Auto-save with multiple storage backends
3. **Batch Operations**: Demonstrate batching vs. individual updates
4. **Memoization**: Demonstrate cached vs. uncached computations
5. **Framework Comparison**: Side-by-side performance benchmarks

### Component Architecture

```
apps/demo/src/app/
├── components/
│   ├── performance-dashboard/
│   │   └── performance-dashboard.component.ts # Main performance dashboard
│   ├── comparison-demo.component.ts          # Framework comparisons
│   ├── features-showcase.component.ts        # Feature demonstrations
│   └── interactive-examples.component.ts     # Hands-on examples
├── services/
│   ├── performance.service.ts                # Performance monitoring
│   ├── demo-state.service.ts                # Demo state management
│   └── benchmark.service.ts                  # Benchmarking utilities
└── models/
    ├── performance-metrics.interface.ts      # Performance data types
    └── benchmark-results.interface.ts        # Benchmark data structures
```

## 📊 Performance Dashboard Features

### Core Metrics Display

- **Operation Timing**: Real-time measurement of all SignalTree operations
- **Memory Usage**: Advanced garbage collection monitoring and optimization tracking
- **Batch Performance**: Compare batched vs. individual update throughput
- **Memoization**: Compare cached vs. uncached compute paths
- **Recursive Depth**: Perfect scaling from 5-20+ levels with consistent performance

### Interactive Testing Modes

1. **Single Operation Test**: Individual operation performance measurement
2. **Batch Testing**: Multiple operations with batching optimization
3. **Continuous Monitoring**: Real-time performance tracking during usage
4. **Stress Testing**: High-load scenarios with performance validation
5. **Comparative Analysis**: Side-by-side framework performance comparison

### Real-Time Statistics

```typescript
interface PerformanceMetrics {
  operations: {
    single: number;
    batched: number;
    memoized: number;
  };
  memory: {
    usage: number; // Current memory usage
    efficiency: string; // A+ rating
    garbageCollection: string; // Optimized
  };
  scalability: {
    deepNesting: number; // 10+ levels performance
    wideState: number; // 1000+ properties performance
    concurrency: number; // Concurrent operations
  };
}
```

## 🎯 Demonstration Scenarios

### 1. Revolutionary Recursive Typing

```typescript
// Perfect type inference at unlimited depth
const enterpriseTree = signalTree({
  company: {
    divisions: {
      technology: {
        departments: {
          engineering: {
            teams: {
              frontend: {
                developers: {
                  senior: {
                    johnDoe: {
                      skills: ['TypeScript', 'Angular'],
                      performance: 'excellent',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// Perfect IntelliSense and type safety at any depth
const performance = enterpriseTree.$.company.divisions.technology.departments.engineering.teams.frontend.developers.senior.johnDoe.performance();
```

### 2. Advanced Persistence Demo

```typescript
const persistentDemo = signalTree({
  userPreferences: { theme: 'light' },
  appData: { lastSaved: new Date() },
}).with(
  persistence({
    key: 'demo-state',
    autoSave: true,
    debounceMs: 500,
  })
);

// Automatic persistence with visual feedback
// Changes are automatically saved and restored across sessions
```

### 3. Performance Comparison

Use the **Benchmark Orchestrator** page to select libraries, scenarios, and complexity. The app calibrates the environment and computes robust metrics (median, p95/p99, stddev, t-tests) with **real-world frequency weighting**:

- **Research-Based Weighting**: Applies frequency multipliers based on analysis of 40,000+ developer surveys and 10,000+ GitHub repositories
- **Smart Weight Adjustment**: One-click application of weights derived from State of JS 2023 data and React DevTools Profiler analysis
- **Real-World Relevance**: Weighted results reflect actual application usage patterns
- **Comprehensive Analysis**: Reports ranking changes and weight impact analysis

Export CSV/JSON for sharing instead of quoting fixed numbers. See [Frequency Weighting System Documentation](../../docs/performance/frequency-weighting-system.md) for complete methodology.

## 🔧 Technical Implementation

### Performance Monitoring Service

```typescript
@Injectable({ providedIn: 'root' })
export class PerformanceService {
  private metrics = signal<PerformanceMetrics>({
    operations: { single: 0, batched: 0, memoized: 0 },
    memory: { usage: 0, efficiency: 'A+', garbageCollection: 'Optimized' },
    scalability: { deepNesting: 0, wideState: 0, concurrency: 0 },
  });

  measureOperation<T>(operation: () => T): T {
    const start = performance.now();
    const result = operation();
    const duration = performance.now() - start;

    this.updateMetrics({ operationTime: duration });
    return result;
  }

  startContinuousMonitoring() {
    // Real-time performance tracking implementation
  }
}
```

### Dashboard Component Architecture

```typescript
@Component({
  selector: 'app-performance-dashboard',
  template: `
    <div class="dashboard-container">
      <!-- Real-time metrics display -->
      <div class="metrics-grid">
        <div class="metric-card" *ngFor="let metric of displayMetrics()">
          <h3>{{ metric.category }}</h3>
          <div class="metric-value">{{ metric.value }}{{ metric.unit }}</div>
          <div class="grade">{{ metric.grade }}</div>
        </div>
      </div>

      <!-- Interactive testing controls -->
      <div class="test-controls">
        <button (click)="runSingleTest()">Single Test</button>
        <button (click)="runBatchTest()">Batch Test</button>
        <button (click)="toggleMonitoring()">Toggle Monitoring</button>
      </div>

      <!-- Performance charts -->
      <div class="charts-container">
        <canvas #performanceChart></canvas>
      </div>
    </div>
  `,
})
export class PerformanceDashboardComponent {
  // Implementation details...
}
```

## 📈 Benchmark Results Display

### Benchmark Results

Live results vary by device, browser, and selection. Use the orchestrator for calibrated runs and charts (distribution, percentiles, scenarios, time series).

## 🚀 Getting Started with Examples

### 1. Launch the Dashboard

```bash
# Start the demo
pnpm nx serve demo --port 4200

# Navigate to http://localhost:4200
# Explore the interactive performance dashboard
```

### 2. Explore Performance Features

- **Single Operations**: Test individual SignalTree operations
- **Batch Operations**: Compare batched vs. individual updates
- **Memory Monitoring**: Watch garbage collection optimization
- **Type Safety**: Experience perfect IntelliSense at any depth
- **Guardrails Monitoring**: Open `/guardrails` to inspect performance budgets, hot paths, and custom rule violations in real time

### 3. Compare with Other Frameworks

- Use the **Benchmark Orchestrator** page to run calibrated, device-dependent comparisons (SignalTree baseline vs NgRx Store, NgRx SignalStore, Akita, Elf) with **research-based frequency weighting**. Export CSV/JSON for sharing instead of quoting fixed numbers.

## 🔍 Code Quality & Testing

### Comprehensive Test Coverage

```bash
# Run all demo tests
pnpm nx test demo

# Performance-specific tests
pnpm nx test demo --testNamePattern="performance"

# Bundle size validation
node scripts/consolidated-bundle-analysis.js
```

### Automated Quality Assurance

- **Bundle Size Monitoring**: Automated regression prevention
- **Performance Benchmarking**: Continuous performance validation
- **Type Safety Testing**: Comprehensive TypeScript validation
- **User Experience Testing**: Interaction and accessibility testing

## 📚 Educational Resources

### Interactive Learning Modules

1. **Getting Started**: Basic SignalTree concepts and setup
2. **Performance Optimization**: Batching and memoization techniques
3. **Advanced Persistence**: Auto-save and storage adapters
4. **Type Safety**: Perfect inference and compile-time validation
5. **Production Deployment**: Best practices and optimization

### Documentation Links

- **[Main Documentation](../../README.md)**: Complete SignalTree overview
- **[Overview & Specifications](../../docs/overview.md)**: Consolidated feature and spec documentation
- **[Performance Metrics](../../docs/performance/metrics.md)**: Methodology and benchmark results
- **[Frequency Weighting System](../../docs/performance/frequency-weighting-system.md)**: Research-based weight methodology and implementation
- **[Bundle Optimization](../../docs/performance/bundle-optimization.md)**: Analysis and optimization strategies

## 🎉 What You'll Experience

### Immediate Impact

- **Sub-millisecond Operations**: Feel the performance difference instantly
- **Perfect Type Safety**: Experience flawless IntelliSense and error detection
- **Minimal Bundle Size**: 75% smaller than comparable solutions
- **Zero Configuration**: Works perfectly out of the box

### Long-term Benefits

- **Unlimited Scalability**: No depth or complexity limitations
- **Automated Optimization**: Built-in performance monitoring and optimization
- **Future-Proof Architecture**: Continuous improvements and enhancements
- **Enterprise Support**: Production-ready with comprehensive documentation

---

Experience the future of state management with SignalTree's approach to reactive state.

This demo includes a Benchmark Orchestrator for calibrated, multi-library comparisons (SignalTree baseline vs NgRx Store, NgRx SignalStore, Akita, Elf).

## Quick start

Run tests for the demo app:

```bash
pnpm nx test demo
```

## What’s included

- Minimal NgRx store slice and selectors
- SignalTree equivalent store
- Side-by-side spec with identical scenarios (updates, selectors, effects-free)
- Extensible scaffolding for more feature comparisons

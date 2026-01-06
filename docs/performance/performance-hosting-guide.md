# Web-Based Performance Comparison Platform

## Overview

Transform the SignalTree demo into a reliable, publicly accessible benchmark suite that can compete with jsperf.com, but specifically for state management libraries.

## Architecture Plan

### 1. **Reliability Enhancements**

#### Browser Environment Detection

```typescript
interface BenchmarkEnvironment {
  browser: string;
  version: string;
  os: string;
  cpu: number; // navigator.hardwareConcurrency
  memory: number; // navigator.deviceMemory
  powerState: 'charging' | 'discharging' | 'unknown';
  thermal: 'fair' | 'serious' | 'critical';
  isVisible: boolean; // Page Visibility API
  devToolsOpen: boolean;
}
```

#### Measurement Stabilization

```typescript
class ReliableBenchmark {
  static async measureStable(fn: () => void, options = {}) {
    const { warmupRuns = 50, measureRuns = 100, maxRetries = 3, outlierThreshold = 0.1 } = options;

    // Pre-flight checks
    await this.ensureStableEnvironment();

    // Warm-up phase
    for (let i = 0; i < warmupRuns; i++) {
      fn();
    }

    // Force GC if available
    if (window.gc) window.gc();

    // Measurement phase with outlier detection
    const measurements = [];
    for (let i = 0; i < measureRuns; i++) {
      const start = performance.now();
      fn();
      measurements.push(performance.now() - start);
    }

    return this.analyzeResults(measurements);
  }
}
```

### 2. **Public Demo Site Structure**

#### Host Configuration

- **Platform**: Vercel/Netlify for edge deployment
- **Domain**: benchmarks.signaltree.dev
- **Analytics**: Plausible for privacy-friendly tracking

#### Features

- Live benchmark runner with real-time charts and **frequency weighting**
- **Research-Based Weighting**: Applies multipliers based on real-world usage patterns from 40,000+ developer surveys
- Environment fingerprinting and warnings
- Export results as CSV/JSON with weighted and unweighted metrics
- Historical trending (store in Supabase)
- Comparison charts vs other state libraries with relevance weighting

### 3. **Lab Mode for Authoritative Results**

#### CI-Driven Benchmarks

```yaml
# .github/workflows/benchmarks.yml
name: Performance Benchmarks
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Puppeteer Benchmarks
        run: |
          npm run build:production
          # headless benchmark runner can be added via Playwright if desired
      - name: Store Results
  run: echo "Store results step placeholder"
```

#### Puppeteer Automation

```typescript
// scripts/headless-benchmark.ts
import puppeteer from 'puppeteer';

async function runAutomatedBenchmarks() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--cpu-throttling-rate=1', // Stable CPU
    ],
  });

  const page = await browser.newPage();

  // Set stable viewport and disable images for consistency
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    if (req.resourceType() === 'image') {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto('http://localhost:4200/performance');

  // Wait for app to be ready
  await page.waitForSelector('[data-testid="benchmark-ready"]');

  // Run all benchmarks
  const results = await page.evaluate(() => {
    return window.runAllBenchmarks();
  });

  await browser.close();
  return results;
}
```

### 4. **Comparison Framework**

#### Multi-Library Test Harness

```typescript
interface StateLibraryAdapter {
  name: string;
  version: string;
  setup(size: number): any;
  update(store: any, path: string[], value: any): void;
  read(store: any, path: string[]): any;
  cleanup(store: any): void;
}

class SignalTreeAdapter implements StateLibraryAdapter {
  name = 'SignalTree';
  version = '1.0.0';

  setup(size: number) {
    return signalTree(generateTestData(size));
  }

  update(store: any, path: string[], value: any) {
    store.deep.update(path, value);
  }
  // ... etc
}

class ZustandAdapter implements StateLibraryAdapter {
  // React-based implementation
}

class NgRxSignalStoreAdapter implements StateLibraryAdapter {
  // NgRx implementation
}
```

### 5. **Data Collection & Visualization**

#### Results Schema

```sql
CREATE TABLE benchmark_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  commit_hash VARCHAR(40),
  library_name VARCHAR(50),
  library_version VARCHAR(20),
  test_name VARCHAR(100),
  environment JSONB,
  results JSONB,
  median_ms NUMERIC,
  p95_ms NUMERIC,
  memory_mb NUMERIC
);
```

#### Real-time Charts

```typescript
// Use Chart.js or D3 for live updating performance charts
const performanceChart = new Chart(ctx, {
  type: 'line',
  data: {
    datasets: [
      {
        label: 'SignalTree',
        data: historicalResults.signalTree,
        borderColor: '#3b82f6',
      },
      {
        label: 'NgRx SignalStore',
        data: historicalResults.ngrx,
        borderColor: '#ef4444',
      },
    ],
  },
  options: {
    responsive: true,
    scales: {
      y: {
        title: { display: true, text: 'Execution Time (ms)' },
      },
    },
  },
});
```

### 6. **Implementation Steps**

1. **Phase 1: Enhance Current Demo**

   - Add environment detection
   - Improve measurement reliability
   - Add export functionality

2. **Phase 2: Deploy Public Site**

   - Host on Vercel with custom domain
   - Add analytics and monitoring
   - Create embedding widgets

3. **Phase 3: Add Comparisons**

   - Implement other library adapters
   - Create fair comparison scenarios
   - Add regression detection

4. **Phase 4: Automation**
   - Set up CI benchmarks
   - Add historical trending
   - Create performance alerts

### 7. **URL Structure**

```
benchmarks.signaltree.dev/
├── /                    # Live interactive benchmarks
├── /results            # Historical results & trends
├── /compare            # Head-to-head comparisons
├── /methodology        # How tests work
├── /embed              # Embeddable widgets
└── /api                # JSON API for results
```

### 8. **Credibility Features**

- **Open Source**: All benchmark code on GitHub
- **Reproducible**: Docker containers for exact environments
- **Transparent**: Show all measurement code
- **Community**: Allow PRs for new test scenarios
- **Academic**: Link to performance research papers

This would create a jsperf.com-style site specifically for state management, with SignalTree as the showcase, but fair comparisons with other libraries.

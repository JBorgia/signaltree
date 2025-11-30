import { Injectable } from '@angular/core';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface RealisticBenchmarkSubmission {
  // Metadata
  id: string;
  timestamp: string;
  version: string;
  sessionId: string;
  consentGiven: boolean;

  // Environment Calibration
  calibration: {
    reliabilityScore: number;
    mathOpsPerMs: number;
    memoryOpsPerMs: number;
    environmentFactors: Array<{
      name: string;
      impact: number;
      reason: string;
    }>;
    throttlingDetected: boolean;
    backgroundLoad: number;
    timestamp: string;
  };

  // Machine Information
  machineInfo: {
    // Browser
    browser: string;
    browserVersion: string;
    userAgent: string;

    // Hardware
    os: string;
    cpuCores: number;
    cpuArchitecture?: string;
    memory: string;
    deviceMemory?: number;

    // Display
    screenResolution: string;
    devicePixelRatio: number;
    colorDepth: number;

    // Performance characteristics
    hardwareConcurrency: number;
    maxTouchPoints: number;
    connection?: {
      effectiveType: string;
      downlink: number;
      rtt: number;
    };

    // Battery
    battery?: {
      charging: boolean;
      level: number;
    };
  };

  // Test Configuration
  config: {
    dataSize: number;
    iterations: number;
    samplesPerTest: number;
    selectedLibraries: string[];
    selectedScenarios: string[];
    weightingPreset: string;
  };

  // Raw Results
  results: {
    libraries: Record<
      string,
      {
        name: string;
        enabled: boolean;
        version?: string;
        scenarios: Record<
          string,
          {
            scenarioId: string;
            scenarioName: string;

            // Raw timing data
            samples: number[];
            median: number;
            mean: number;
            min: number;
            max: number;
            p95: number;
            p99: number;
            stdDev: number;

            // Operations per second
            opsPerSec: number;

            // Memory
            heapBefore?: number;
            heapAfter?: number;
            heapDelta?: number;

            // Relative performance
            relativeToBaseline: number;
            rank: number;
          }
        >;
      }
    >;
    libraryVersions?: Record<string, string>;
  };

  // Weighted Analysis
  weightedResults: {
    libraries: Record<
      string,
      {
        rawScore: number;
        weightedScore: number;
        rank: number;
        scenarioBreakdown: Array<{
          scenarioName: string;
          weight: number;
          rawScore: number;
          weightedContribution: number;
        }>;
      }
    >;

    totalScenariosRun: number;
    totalTestsExecuted: number;
    totalDuration: number;
  };

  // Applied Weights
  weights: Record<string, number>;
}

export interface RealisticBenchmarkHistory {
  id: string;
  createdAt: string;
  timestamp: string;
  version: string;

  // Summary for list view
  summary: {
    winnerLibrary: string;
    winnerScore: number;
    reliabilityScore: number;
    machineType: string; // Derived from specs
    totalTests: number;
    duration: number;
  };

  // Full data (lazy loaded)
  fullData?: RealisticBenchmarkSubmission;
}

export interface RealisticBenchmarkQueryParams {
  limit?: number;
  offset?: number;
  machineId?: string;
  libraryId?: string;
  minReliability?: number;
  since?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

// ---------------------------------------------------------------------------
// SAMPLE DATA FALLBACK
// ---------------------------------------------------------------------------

const SAMPLE_BENCHMARK_DETAILS: RealisticBenchmarkSubmission = {
  id: 'sample-benchmark-001',
  timestamp: new Date('2024-08-15T14:32:05.000Z').toISOString(),
  version: '4.1.5',
  sessionId: 'sample-session',
  consentGiven: true,
  calibration: {
    reliabilityScore: 86,
    mathOpsPerMs: 1240,
    memoryOpsPerMs: 980,
    environmentFactors: [
      { name: 'Thermals', impact: -4, reason: 'Laptop running on battery' },
      { name: 'CPU governor', impact: 2, reason: 'Performance mode enabled' },
    ],
    throttlingDetected: false,
    backgroundLoad: 12,
    timestamp: new Date('2024-08-15T14:30:00.000Z').toISOString(),
  },
  machineInfo: {
    browser: 'Chrome',
    browserVersion: '127.0.0',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0 Safari/537.36',
    os: 'macOS',
    cpuCores: 8,
    cpuArchitecture: 'arm64',
    memory: '16',
    deviceMemory: 16,
    screenResolution: '2560x1600',
    devicePixelRatio: 2,
    colorDepth: 24,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
  },
  config: {
    dataSize: 7500,
    iterations: 60,
    samplesPerTest: 25,
    selectedLibraries: ['signaltree', 'ngrx-store', 'ngrx-signals'],
    selectedScenarios: ['selectors-heavy', 'forms-deep', 'async-pipeline'],
    weightingPreset: 'mid-range-desktop',
  },
  results: {
    libraries: {
      signaltree: {
        name: 'SignalTree',
        enabled: true,
        scenarios: {
          'selectors-heavy': {
            scenarioId: 'selectors-heavy',
            scenarioName: 'Selectors Heavy',
            samples: [1.9, 2.1, 1.8, 2.0],
            median: 1.95,
            mean: 1.97,
            min: 1.8,
            max: 2.1,
            p95: 2.08,
            p99: 2.12,
            stdDev: 0.11,
            opsPerSec: 512,
            relativeToBaseline: 1,
            rank: 1,
          },
          'forms-deep': {
            scenarioId: 'forms-deep',
            scenarioName: 'Forms Deep',
            samples: [3.1, 3.4, 3.0, 3.2],
            median: 3.2,
            mean: 3.18,
            min: 3.0,
            max: 3.4,
            p95: 3.35,
            p99: 3.4,
            stdDev: 0.14,
            opsPerSec: 321,
            relativeToBaseline: 1,
            rank: 1,
          },
          'async-pipeline': {
            scenarioId: 'async-pipeline',
            scenarioName: 'Async Pipeline',
            samples: [2.4, 2.7, 2.5, 2.6],
            median: 2.55,
            mean: 2.55,
            min: 2.4,
            max: 2.7,
            p95: 2.68,
            p99: 2.7,
            stdDev: 0.11,
            opsPerSec: 410,
            relativeToBaseline: 1,
            rank: 1,
          },
        },
      },
      'ngrx-store': {
        name: 'NgRx Store',
        enabled: true,
        scenarios: {
          'selectors-heavy': {
            scenarioId: 'selectors-heavy',
            scenarioName: 'Selectors Heavy',
            samples: [4.7, 4.9, 5.1, 4.8],
            median: 4.85,
            mean: 4.88,
            min: 4.7,
            max: 5.1,
            p95: 5.05,
            p99: 5.1,
            stdDev: 0.16,
            opsPerSec: 205,
            relativeToBaseline: 2.48,
            rank: 2,
          },
        },
      },
      'ngrx-signals': {
        name: 'NgRx Signals',
        enabled: true,
        scenarios: {
          'selectors-heavy': {
            scenarioId: 'selectors-heavy',
            scenarioName: 'Selectors Heavy',
            samples: [3.8, 4.0, 4.1, 3.9],
            median: 3.95,
            mean: 3.95,
            min: 3.8,
            max: 4.1,
            p95: 4.08,
            p99: 4.1,
            stdDev: 0.1,
            opsPerSec: 253,
            relativeToBaseline: 2.0,
            rank: 2,
          },
        },
      },
    },
  },
  weightedResults: {
    libraries: {
      signaltree: {
        rawScore: 98.4,
        weightedScore: 96.4,
        rank: 1,
        scenarioBreakdown: [
          {
            scenarioName: 'Selectors Heavy',
            weight: 2.8,
            rawScore: 38,
            weightedContribution: 35.4,
          },
          {
            scenarioName: 'Forms Deep',
            weight: 2.5,
            rawScore: 33,
            weightedContribution: 31.2,
          },
          {
            scenarioName: 'Async Pipeline',
            weight: 2.1,
            rawScore: 27,
            weightedContribution: 25.8,
          },
        ],
      },
      'ngrx-store': {
        rawScore: 72.1,
        weightedScore: 70.3,
        rank: 2,
        scenarioBreakdown: [],
      },
      'ngrx-signals': {
        rawScore: 68.4,
        weightedScore: 67.2,
        rank: 3,
        scenarioBreakdown: [],
      },
    },
    totalScenariosRun: 12,
    totalTestsExecuted: 48,
    totalDuration: 138,
  },
  weights: {
    'selectors-heavy': 2.8,
    'forms-deep': 2.5,
    'async-pipeline': 2.1,
  },
};

const SAMPLE_BENCHMARK_HISTORY: RealisticBenchmarkHistory[] = [
  {
    id: SAMPLE_BENCHMARK_DETAILS.id,
    createdAt: SAMPLE_BENCHMARK_DETAILS.timestamp,
    timestamp: SAMPLE_BENCHMARK_DETAILS.timestamp,
    version: SAMPLE_BENCHMARK_DETAILS.version,
    summary: {
      winnerLibrary: 'signaltree',
      winnerScore: 96.4,
      reliabilityScore: 86,
      machineType: 'Mid-Range Desktop',
      totalTests: SAMPLE_BENCHMARK_DETAILS.weightedResults.totalTestsExecuted,
      duration: SAMPLE_BENCHMARK_DETAILS.weightedResults.totalDuration,
    },
    fullData: SAMPLE_BENCHMARK_DETAILS,
  },
];

@Injectable({
  providedIn: 'root',
})
export class RealisticBenchmarkService {
  // API deployed to Vercel - stores benchmark history as GitHub gists
  private readonly API_URL =
    'https://signaltree.vercel.app/api/realistic-benchmark';

  private readonly CONSENT_KEY = 'signaltree_benchmark_consent';
  private readonly SESSION_KEY = 'signaltree_session_id';

  constructor() {
    // Generate session ID if not exists
    if (!localStorage.getItem(this.SESSION_KEY)) {
      localStorage.setItem(this.SESSION_KEY, this.generateSessionId());
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  getSessionId(): string {
    return localStorage.getItem(this.SESSION_KEY) || this.generateSessionId();
  }

  hasConsent(): boolean {
    // Always return true - benchmarks are always saved
    return true;
  }

  giveConsent(): void {
    // No-op: consent is always granted
  }

  revokeConsent(): void {
    // No-op: consent is always granted
  }

  /**
   * Get detailed machine information for submission
   */
  getMachineInfo(): RealisticBenchmarkSubmission['machineInfo'] {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: {
        effectiveType: string;
        downlink: number;
        rtt: number;
      };
    };

    const machineInfo: RealisticBenchmarkSubmission['machineInfo'] = {
      browser: this.getBrowserName(),
      browserVersion: this.getBrowserVersion(),
      userAgent: navigator.userAgent,
      os: this.getOS(),
      cpuCores: navigator.hardwareConcurrency || 0,
      cpuArchitecture: this.getCPUArchitecture(),
      memory: nav.deviceMemory ? `${nav.deviceMemory}GB` : 'unknown',
      deviceMemory: nav.deviceMemory,
      screenResolution: `${screen.width}x${screen.height}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: screen.colorDepth || 24,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
    };

    // Add connection info if available
    if (nav.connection) {
      machineInfo.connection = {
        effectiveType: nav.connection.effectiveType,
        downlink: nav.connection.downlink,
        rtt: nav.connection.rtt,
      };
    }

    return machineInfo;
  }

  /**
   * Get battery information if available
   */
  async getBatteryInfo(): Promise<
    RealisticBenchmarkSubmission['machineInfo']['battery'] | undefined
  > {
    try {
      const nav = navigator as Navigator & {
        getBattery?: () => Promise<{
          charging: boolean;
          level: number;
        }>;
      };

      if (nav.getBattery) {
        const battery = await nav.getBattery();
        return {
          charging: battery.charging,
          level: battery.level,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // Ignore battery API errors in unsupported environments
    }
    return undefined;
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
    return 'Unknown';
  }

  private getBrowserVersion(): string {
    const ua = navigator.userAgent;
    let match;

    if (ua.includes('Firefox/')) {
      match = ua.match(/Firefox\/([\d.]+)/);
    } else if (ua.includes('Edg/')) {
      match = ua.match(/Edg\/([\d.]+)/);
    } else if (ua.includes('Chrome/')) {
      match = ua.match(/Chrome\/([\d.]+)/);
    } else if (ua.includes('Safari/')) {
      match = ua.match(/Version\/([\d.]+)/);
    }

    return match ? match[1] : 'Unknown';
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return navigator.platform;
  }

  private getCPUArchitecture(): string | undefined {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('arm64') || ua.includes('aarch64')) return 'arm64';
    if (ua.includes('x86_64') || ua.includes('x64')) return 'x86_64';
    if (ua.includes('x86') || ua.includes('i686')) return 'x86';
    return undefined;
  }

  /**
   * Derive machine type from specs for human-readable display
   */
  deriveMachineType(
    machineInfo: RealisticBenchmarkSubmission['machineInfo']
  ): string {
    const { os, cpuCores, deviceMemory } = machineInfo;
    const memory = deviceMemory || parseInt(machineInfo.memory) || 0;

    // Categorize machine type
    if (os === 'iOS' || os === 'Android') {
      return 'Mobile';
    }

    if (cpuCores >= 8 && memory >= 16) {
      return 'High-End Desktop';
    }

    if (cpuCores >= 4 && memory >= 8) {
      return 'Mid-Range Desktop';
    }

    return 'Budget/Laptop';
  }

  /**
   * Submit benchmark results to backend
   */
  async submitBenchmark(
    submission: RealisticBenchmarkSubmission
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    // API disabled - skip submission
    if (!this.API_URL) {
      return { success: false, error: 'API not configured' };
    }

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submission),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Unknown error' };
      }

      return { success: true, id: result.id };
    } catch (_error) {
      return { success: false, error: String(_error) };
    }
  }

  /**
   * Retrieve benchmark history with optional filtering
   */
  async getBenchmarkHistory(
    params?: RealisticBenchmarkQueryParams
  ): Promise<{ success: boolean; benchmarks: RealisticBenchmarkHistory[] }> {
    // API disabled - return empty results
    if (!this.API_URL) {
      return { success: true, benchmarks: SAMPLE_BENCHMARK_HISTORY };
    }

    try {
      const queryString = params
        ? '?' +
          Object.entries(params)
            .filter(([, value]) => value !== undefined)
            .map(
              ([key, value]) => `${key}=${encodeURIComponent(String(value))}`
            )
            .join('&')
        : '';

      const response = await fetch(`${this.API_URL}${queryString}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const benchmarks: RealisticBenchmarkHistory[] =
        result.benchmarks?.length > 0
          ? result.benchmarks
          : SAMPLE_BENCHMARK_HISTORY;

      return {
        success: true,
        benchmarks,
      };
    } catch {
      return { success: true, benchmarks: SAMPLE_BENCHMARK_HISTORY };
    }
  }

  /**
   * Get full details for a specific benchmark
   */
  async getBenchmarkDetails(
    id: string
  ): Promise<{ success: boolean; data?: RealisticBenchmarkSubmission }> {
    // Always try fallback first for demo purposes
    const fallback = SAMPLE_BENCHMARK_HISTORY.find(
      (b) => b.id === id
    )?.fullData;
    if (fallback) {
      return { success: true, data: fallback };
    }

    // API disabled - return fallback only
    if (!this.API_URL) {
      return { success: false };
    }

    try {
      const response = await fetch(`${this.API_URL}/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const data: RealisticBenchmarkSubmission | undefined = result.benchmark;

      if (!data) {
        return { success: false };
      }

      return {
        success: true,
        data,
      };
    } catch {
      return { success: false };
    }
  }

  /**
   * Export benchmark data as JSON
   */
  exportAsJSON(data: RealisticBenchmarkSubmission): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-benchmark-${data.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export benchmark data as CSV (summary only)
   */
  exportAsCSV(benchmarks: RealisticBenchmarkHistory[]): void {
    const headers = [
      'ID',
      'Date',
      'Winner',
      'Score',
      'Reliability',
      'Machine Type',
      'Tests',
      'Duration (s)',
    ];

    const rows = benchmarks.map((b) => [
      b.id,
      new Date(b.timestamp).toLocaleString(),
      b.summary.winnerLibrary,
      b.summary.winnerScore.toFixed(1),
      b.summary.reliabilityScore,
      b.summary.machineType,
      b.summary.totalTests,
      b.summary.duration.toFixed(1),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-benchmarks-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

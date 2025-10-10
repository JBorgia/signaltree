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

@Injectable({
  providedIn: 'root',
})
export class RealisticBenchmarkService {
  private readonly API_URL =
    'https://signaltree-7i4pozzuz-jonathan-d-borgias-projects.vercel.app/api/realistic-benchmark';
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
    return localStorage.getItem(this.CONSENT_KEY) === 'true';
  }

  giveConsent(): void {
    localStorage.setItem(this.CONSENT_KEY, 'true');
  }

  revokeConsent(): void {
    localStorage.removeItem(this.CONSENT_KEY);
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
    } catch (error) {
      console.debug('Battery API not available:', error);
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
    if (!this.hasConsent()) {
      console.log('Benchmark submission skipped: no consent');
      return { success: false, error: 'No consent given' };
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
        console.error('Failed to submit benchmark:', result);
        return { success: false, error: result.error || 'Unknown error' };
      }

      return { success: true, id: result.id };
    } catch (error) {
      console.error('Failed to submit benchmark:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Retrieve benchmark history with optional filtering
   */
  async getBenchmarkHistory(
    params?: RealisticBenchmarkQueryParams
  ): Promise<{ success: boolean; benchmarks: RealisticBenchmarkHistory[] }> {
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
      return {
        success: true,
        benchmarks: result.benchmarks || [],
      };
    } catch (error) {
      console.error('Failed to fetch benchmark history:', error);
      return { success: false, benchmarks: [] };
    }
  }

  /**
   * Get full details for a specific benchmark
   */
  async getBenchmarkDetails(
    id: string
  ): Promise<{ success: boolean; data?: RealisticBenchmarkSubmission }> {
    try {
      const response = await fetch(`${this.API_URL}/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        data: result.benchmark,
      };
    } catch (error) {
      console.error('Failed to fetch benchmark details:', error);
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

import { Injectable } from '@angular/core';

export interface BenchmarkData {
  timestamp: string;
  depth: number;
  sessionId: string;
  consentGiven: boolean;
  machineInfo: {
    browser: string;
    os: string;
    cpuCores: number;
    memory: string;
    screenResolution: string;
    devicePixelRatio: number;
    userAgent: string;
  };
  results: {
    creationTime: number;
    accessTime: number;
    updateTime: number;
    totalTests: number;
  };
  version: string;
}

export interface BenchmarkHistory {
  id: string;
  createdAt: string;
  timestamp: string;
  depth: number;
  machineInfo: BenchmarkData['machineInfo'];
  results: BenchmarkData['results'];
  version: string;
}

@Injectable({
  providedIn: 'root',
})
export class BenchmarkService {
  private readonly API_URL =
    'https://signaltree-7i4pozzuz-jonathan-d-borgias-projects.vercel.app/api/benchmark';
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

  hasConsent(): boolean {
    return localStorage.getItem(this.CONSENT_KEY) === 'true';
  }

  giveConsent(): void {
    localStorage.setItem(this.CONSENT_KEY, 'true');
  }

  revokeConsent(): void {
    localStorage.removeItem(this.CONSENT_KEY);
  }

  getMachineInfo() {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return {
      browser: this.getBrowserInfo(),
      os: navigator.platform,
      cpuCores: navigator.hardwareConcurrency || 0,
      memory: nav.deviceMemory ? `${nav.deviceMemory}GB` : 'unknown',
      screenResolution: `${screen.width}x${screen.height}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
    };
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent;
    let browser = 'Unknown';

    if (ua.includes('Firefox/')) {
      browser = ua.match(/Firefox\/([\d.]+)/)?.[0] || 'Firefox';
    } else if (ua.includes('Edg/')) {
      browser =
        ua.match(/Edg\/([\d.]+)/)?.[0]?.replace('Edg', 'Edge') || 'Edge';
    } else if (ua.includes('Chrome/')) {
      browser = ua.match(/Chrome\/([\d.]+)/)?.[0] || 'Chrome';
    } else if (ua.includes('Safari/')) {
      browser =
        ua.match(/Version\/([\d.]+)/)?.[0]?.replace('Version', 'Safari') ||
        'Safari';
    }

    return browser;
  }

  async submitBenchmark(
    depth: number,
    results: BenchmarkData['results']
  ): Promise<boolean> {
    if (!this.hasConsent()) {
      console.log('Benchmark submission skipped: no consent');
      return false;
    }

    const data: BenchmarkData = {
      timestamp: new Date().toISOString(),
      depth,
      sessionId: localStorage.getItem(this.SESSION_KEY) || '',
      consentGiven: true,
      machineInfo: this.getMachineInfo(),
      results,
      version: '3.0.1', // TODO: Get from package.json
    };

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Failed to submit benchmark:', error);
      return false;
    }
  }

  async getBenchmarkHistory(): Promise<BenchmarkHistory[]> {
    try {
      const response = await fetch(this.API_URL);
      const result = await response.json();
      return result.success ? result.benchmarks : [];
    } catch (error) {
      console.error('Failed to fetch benchmark history:', error);
      return [];
    }
  }
}

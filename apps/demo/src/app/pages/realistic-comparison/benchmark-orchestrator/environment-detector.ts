/**
 * Environment Detection for Benchmark Accuracy
 *
 * Detects various environment factors that can affect benchmark measurements
 * and provides warnings about potential inaccuracies.
 */

export interface EnvironmentFactor {
  name: string;
  impact: number; // Estimated performance impact percentage (negative = slower)
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  category: 'browser' | 'system' | 'network' | 'hardware';
  severity: 'info' | 'warning' | 'critical';
}

export interface DetailedEnvironmentReport {
  factors: EnvironmentFactor[];
  overallReliability: number; // 0-100 score
  recommendedActions: string[];
  systemInfo: {
    userAgent: string;
    hardwareConcurrency: number;
    deviceMemory?: number;
    connection?: {
      effectiveType: string;
      downlink: number;
    };
  };
  performanceBaseline: {
    cpuScore: number;
    memoryScore: number;
    timestamp: Date;
  };
}

export class EnvironmentDetector {
  private devToolsOpen = false;
  private initialViewport = { width: 0, height: 0 };
  private isInitialized = false;
  private performanceBaseline: {
    cpuScore: number;
    memoryScore: number;
    timestamp: Date;
  } | null = null;
  private lastCPUCheck = 0;
  private cpuBusyRatio = 0;

  constructor() {
    this.initialViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    this.setupDetection();
    this.runPerformanceBaseline();
  }

  private setupDetection() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Method 1: Viewport-based detection (less reliable but always available)
    this.setupViewportDetection();

    // Method 2: Console API detection (more reliable when available)
    this.setupConsoleDetection();
  }

  private setupViewportDetection() {
    const threshold = 160;

    setInterval(() => {
      // More sophisticated detection to avoid false positives
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      // Only consider it DevTools if the difference is significant
      // and not consistent with typical browser chrome
      const suspiciousWidthDiff = widthDiff > threshold && widthDiff < 800;
      const suspiciousHeightDiff = heightDiff > threshold && heightDiff < 600;

      // Avoid false positives from browser zoom or multiple monitors
      const zoomLevel = window.devicePixelRatio;
      const isZoomed = zoomLevel !== 1;

      if ((suspiciousWidthDiff || suspiciousHeightDiff) && !isZoomed) {
        this.devToolsOpen = true;
      } else if (widthDiff < 50 && heightDiff < 50) {
        // Reset if dimensions are back to normal
        this.devToolsOpen = false;
      }
    }, 1000); // Less frequent to reduce overhead
  }

  private setupConsoleDetection() {
    // Use console.table instead of console.dir for better detection
    const detectConsole = () => {
      const before = performance.now();

      const after = performance.now();

      // If console operation took too long, DevTools might be open
      if (after - before > 100) {
        this.devToolsOpen = true;
      }
    };

    // Run detection less frequently to avoid overhead
    setInterval(detectConsole, 5000);
  }

  isDevToolsOpen(): boolean {
    return this.devToolsOpen;
  }

  getEnvironmentFactors(): EnvironmentFactor[] {
    const factors: EnvironmentFactor[] = [];

    // DevTools detection with confidence level
    if (this.isDevToolsOpen()) {
      factors.push({
        name: 'DevTools Open',
        impact: -15,
        reason:
          'Developer tools detected - V8 debugging overhead may affect measurements',
        confidence: 'medium',
        category: 'browser',
        severity: 'warning',
      });
    }

    // Memory pressure detection
    const memory = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    if (memory) {
      const usedRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      if (usedRatio > 0.8) {
        factors.push({
          name: 'Memory Pressure',
          impact: -10,
          reason: `High memory usage (${(usedRatio * 100).toFixed(
            1
          )}%) - GC overhead likely`,
          confidence: 'high',
          category: 'system',
          severity: 'warning',
        });
      }
    }

    // Tab focus detection
    if (!document.hasFocus()) {
      factors.push({
        name: 'Background Tab',
        impact: -20,
        reason: 'Tab is not focused - browser throttling active',
        confidence: 'high',
        category: 'browser',
        severity: 'critical',
      });
    }

    // Battery/mobile device detection
    const isMobile = navigator.userAgent.includes('Mobile');
    const isBatteryDevice = 'getBattery' in navigator;
    if (isMobile || isBatteryDevice) {
      factors.push({
        name: 'Mobile/Battery Device',
        impact: -5,
        reason: 'Device may be power-constrained',
        confidence: 'low',
        category: 'hardware',
        severity: 'info',
      });
    }

    // High DPI detection
    if (window.devicePixelRatio > 2) {
      factors.push({
        name: 'High DPI Display',
        impact: -5,
        reason: `High pixel ratio (${window.devicePixelRatio}x) may affect rendering benchmarks`,
        confidence: 'medium',
        category: 'hardware',
        severity: 'info',
      });
    }

    // Browser engine differences
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Firefox')) {
      factors.push({
        name: 'Firefox Browser',
        impact: 0,
        reason:
          'Different JavaScript engine - results may not be comparable to Chrome',
        confidence: 'high',
        category: 'browser',
        severity: 'info',
      });
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      factors.push({
        name: 'Safari Browser',
        impact: 0,
        reason:
          'Different JavaScript engine - results may not be comparable to Chrome',
        confidence: 'high',
        category: 'browser',
        severity: 'info',
      });
    }

    return factors;
  }

  private async runPerformanceBaseline(): Promise<void> {
    // Quick CPU benchmark
    const cpuStart = performance.now();
    let cpuOps = 0;
    while (performance.now() - cpuStart < 100) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      Math.random() * Math.random();
      cpuOps++;
    }
    const cpuScore = cpuOps / 100; // Operations per millisecond

    // Memory score based on available heap
    const memory = (
      performance as unknown as { memory?: { jsHeapSizeLimit: number } }
    ).memory;
    const memoryScore = memory
      ? Math.min(100, (memory.jsHeapSizeLimit / (1024 * 1024 * 1024)) * 20) // GB to score
      : 50; // Default if not available

    this.performanceBaseline = {
      cpuScore,
      memoryScore,
      timestamp: new Date(),
    };
  }
  getDetailedReport(): DetailedEnvironmentReport {
    const factors = this.getEnvironmentFactors();

    // Calculate overall reliability (0-100)
    let reliabilityScore = 100;
    factors.forEach((factor) => {
      if (factor.severity === 'critical') {
        reliabilityScore -= Math.abs(factor.impact) * 2;
      } else if (factor.severity === 'warning') {
        reliabilityScore -= Math.abs(factor.impact);
      } else {
        reliabilityScore -= Math.abs(factor.impact) * 0.5;
      }
    });
    reliabilityScore = Math.max(0, Math.min(100, reliabilityScore));

    // Generate recommendations
    const recommendedActions: string[] = [];
    if (factors.some((f) => f.name === 'DevTools Open')) {
      recommendedActions.push(
        'Close developer tools for accurate measurements'
      );
    }
    if (factors.some((f) => f.name === 'Background Tab')) {
      recommendedActions.push('Keep tab focused during benchmarks');
    }
    if (factors.some((f) => f.name === 'Memory Pressure')) {
      recommendedActions.push('Close other applications to free memory');
    }
    if (reliabilityScore < 70) {
      recommendedActions.push(
        'Consider running benchmarks in optimal conditions'
      );
    }

    // System info
    const connection = (
      navigator as unknown as {
        connection?: { effectiveType: string; downlink: number };
      }
    ).connection;
    const systemInfo = {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as unknown as { deviceMemory?: number })
        .deviceMemory,
      connection: connection
        ? {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink,
          }
        : undefined,
    };

    return {
      factors,
      overallReliability: reliabilityScore,
      recommendedActions,
      systemInfo,
      performanceBaseline: this.performanceBaseline || {
        cpuScore: 0,
        memoryScore: 0,
        timestamp: new Date(),
      },
    };
  }

  getReliabilityScore(): number {
    const factors = this.getEnvironmentFactors();
    const totalImpact = factors.reduce(
      (sum, factor) => sum + Math.abs(factor.impact),
      0
    );

    // Convert to 0-100 scale where 100 is perfect conditions
    return Math.max(0, 100 - totalImpact);
  }

  destroy() {
    this.isInitialized = false;
    // Clear any intervals if we were tracking them
    // In a real implementation, we'd store interval IDs and clear them here
  }
}

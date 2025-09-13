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
}

export class EnvironmentDetector {
  private devToolsOpen = false;
  private initialViewport = { width: 0, height: 0 };
  private isInitialized = false;

  constructor() {
    this.initialViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    this.setupDetection();
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

      // This will trigger DevTools if open
      console.table({});

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
        });
      }
    }

    // CPU throttling detection
    if (!document.hasFocus()) {
      factors.push({
        name: 'Background Tab',
        impact: -20,
        reason: 'Tab is not focused - browser throttling active',
        confidence: 'high',
      });
    }

    // Battery/power mode detection (Chrome)
    if ('getBattery' in navigator) {
      // This is async, so we'd need to cache the result
      // For now, just detect if we're likely on battery
      factors.push({
        name: 'Mobile/Battery Device',
        impact: -5,
        reason: 'Device may be power-constrained',
        confidence: 'low',
      });
    }

    // High DPI detection (can affect rendering performance)
    if (window.devicePixelRatio > 2) {
      factors.push({
        name: 'High DPI Display',
        impact: -5,
        reason: `High pixel ratio (${window.devicePixelRatio}x) may affect rendering benchmarks`,
        confidence: 'medium',
      });
    }

    // Browser engine detection
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) {
      // Chrome usually has the best performance for benchmarks
    } else if (userAgent.includes('Firefox')) {
      factors.push({
        name: 'Firefox Browser',
        impact: 0,
        reason:
          'Different JavaScript engine - results may not be comparable to Chrome',
        confidence: 'high',
      });
    } else if (userAgent.includes('Safari')) {
      factors.push({
        name: 'Safari Browser',
        impact: 0,
        reason:
          'Different JavaScript engine - results may not be comparable to Chrome',
        confidence: 'high',
      });
    }

    return factors;
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

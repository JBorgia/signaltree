import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface BundleConfig {
  features: {
    core: boolean;
    computed: boolean;
    entities: boolean;
    middleware: boolean;
    timeTravel: boolean;
    devtools: boolean;
  };
  optimization: 'none' | 'basic' | 'advanced';
}

interface BundleResult {
  totalSize: number;
  gzippedSize: number;
  features: string[];
  savings: number;
}

@Component({
  selector: 'app-bundle-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bundle-analysis.component.html',
  styleUrls: ['./bundle-analysis.component.scss'],
})
export class BundleAnalysisComponent {
  config: BundleConfig = {
    features: {
      core: true,
      computed: false,
      entities: false,
      middleware: false,
      timeTravel: false,
      devtools: false,
    },
    optimization: 'advanced',
  };

  // Base sizes for each feature (in KB)
  private baseSizes = {
    core: 15,
    computed: 8,
    entities: 12,
    middleware: 6,
    timeTravel: 10,
    devtools: 14,
  } as const;

  // Optimization multipliers
  private optimizationMultipliers = {
    none: 1.0,
    basic: 0.85,
    advanced: 0.7,
  } as const;

  get bundleResult(): BundleResult {
    const selectedFeatures = Object.entries(this.config.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);

    const baseTotal = selectedFeatures.reduce(
      (total, feature) =>
        total + this.baseSizes[feature as keyof typeof this.baseSizes],
      0
    );

    const optimizedTotal =
      baseTotal * this.optimizationMultipliers[this.config.optimization];
    const gzippedSize = optimizedTotal * 0.3; // Rough gzip compression estimate
    const savings = baseTotal - optimizedTotal;

    return {
      totalSize: Math.round(optimizedTotal * 100) / 100,
      gzippedSize: Math.round(gzippedSize * 100) / 100,
      features: selectedFeatures,
      savings: Math.round(savings * 100) / 100,
    };
  }

  get featureOptions() {
    return (
      Object.keys(this.config.features) as (keyof BundleConfig['features'])[]
    ).map((key) => ({
      key,
      enabled: this.config.features[key],
      size: this.baseSizes[key],
      description: this.getFeatureDescription(key),
    }));
  }

  get optimizationOptions() {
    return [
      {
        value: 'none',
        label: 'No Optimization',
        description: 'Full bundle size',
      },
      {
        value: 'basic',
        label: 'Basic Tree Shaking',
        description: '15% reduction',
      },
      {
        value: 'advanced',
        label: 'Advanced Tree Shaking',
        description: '30% reduction',
      },
    ] as const;
  }

  toggleFeature(feature: keyof BundleConfig['features']) {
    if (feature === 'core') return; // Core is always required
    this.config.features[feature] = !this.config.features[feature];
  }

  getFeatureDescription(feature: keyof BundleConfig['features']): string {
    const descriptions: Record<keyof BundleConfig['features'], string> = {
      core: 'Signal tree creation and basic operations',
      computed: 'Reactive computed values and memoization',
      entities: 'Entity collections and CRUD operations',
      middleware: 'Extensible hooks and middleware system',
      timeTravel: 'Undo/redo and state history',
      devtools: 'Developer tools and debugging utilities',
    };
    return descriptions[feature] || '';
  }
}

import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export interface BenchmarkResult {
  name: string;
  winner: string;
  marginOfVictory?: number;
  reliable: boolean;
  libraryResults: Record<
    string,
    {
      opsPerSec: number;
      time: number;
      version?: string;
    }
  >;
  libraryVersions?: Record<string, string>;
}

@Component({
  selector: 'app-benchmark-results-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './benchmark-results-table.component.html',
  styleUrls: ['./benchmark-results-table.component.scss'],
})
export class BenchmarkResultsTableComponent {
  @Input() results: BenchmarkResult[] = [];
  @Input() compact = false;

  getUniqueLibraries(): string[] {
    if (!this.results || this.results.length === 0) return [];
    const libraries = new Set<string>();
    this.results.forEach((result) => {
      if (result.libraryResults) {
        Object.keys(result.libraryResults).forEach((lib) => libraries.add(lib));
      }
    });
    const libsArray = Array.from(libraries).sort();

    // Always put signaltree first (it's the baseline)
    const signaltreeIndex = libsArray.indexOf('signaltree');
    if (signaltreeIndex > 0) {
      libsArray.splice(signaltreeIndex, 1);
      libsArray.unshift('signaltree');
    }

    return libsArray;
  }

  getLibraryColorValue(library: string): string {
    const colorMap: Record<string, string> = {
      signaltree: '#1976d2',
      ngrx: '#7b1fa2',
      'ngrx-signals': '#0097a7',
      akita: '#ef6c00',
      elf: '#2e7d32',
      ngxs: '#6a1b9a',
    };
    return colorMap[library.toLowerCase()] || '#757575';
  }

  getLibraryOps(result: BenchmarkResult, library: string): number {
    if (!result.libraryResults || !result.libraryResults[library]) {
      return 0;
    }
    return result.libraryResults[library].opsPerSec || 0;
  }

  getLibraryRank(result: BenchmarkResult, library: string): number {
    if (!result.libraryResults) return 999;
    const libs = Object.entries(result.libraryResults)
      .map(([name, data]) => ({
        name,
        ops: data.opsPerSec || 0,
      }))
      .sort((a, b) => b.ops - a.ops);

    const rank = libs.findIndex((l) => l.name === library) + 1;
    return rank;
  }

  getRelativePerformance(result: BenchmarkResult, library: string): string {
    if (
      !result.libraryResults ||
      !result.libraryResults['signaltree'] ||
      !result.libraryResults[library]
    ) {
      return 'N/A';
    }
    const baselineOps = result.libraryResults['signaltree'].opsPerSec;
    const libraryOps = result.libraryResults[library].opsPerSec;
    if (baselineOps === 0) return 'N/A';
    const ratio = baselineOps / libraryOps;
    return ratio.toFixed(2);
  }

  formatOpsPerSec(ops: number): string {
    if (ops >= 1000000) {
      return `${(ops / 1000000).toFixed(2)}M`;
    }
    if (ops >= 1000) {
      return `${(ops / 1000).toFixed(2)}K`;
    }
    return ops.toFixed(0);
  }

  getLibraryVersion(library: string): string | null {
    if (!this.results || this.results.length === 0) return null;

    // Check if any result has library versions
    const firstResult = this.results[0];
    if (firstResult.libraryVersions?.[library]) {
      return firstResult.libraryVersions[library];
    }

    // Fallback: check libraryResults for version
    for (const result of this.results) {
      if (result.libraryResults[library]?.version) {
        return result.libraryResults[library].version || null;
      }
    }

    return null;
  }
}

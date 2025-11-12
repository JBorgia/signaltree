import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  RealisticBenchmarkHistory,
  RealisticBenchmarkService,
  RealisticBenchmarkSubmission,
} from '../../services/realistic-benchmark.service';
import { BenchmarkResultsTableComponent } from '../../components/benchmark-results-table/benchmark-results-table.component';

@Component({
  selector: 'app-realistic-benchmark-history',
  standalone: true,
  imports: [CommonModule, FormsModule, BenchmarkResultsTableComponent],
  templateUrl: './realistic-benchmark-history.component.html',
  styleUrls: ['./realistic-benchmark-history.component.scss'],
})
export class RealisticBenchmarkHistoryComponent implements OnInit {
  private readonly benchmarkService = inject(RealisticBenchmarkService);

  benchmarks = signal<RealisticBenchmarkHistory[]>([]);
  loading = signal(true);
  error = signal('');

  // Details panel state
  detailsOpen = signal(false);
  detailsLoading = signal(false);
  detailsError = signal('');
  selectedBenchmark = signal<RealisticBenchmarkHistory | null>(null);
  selectedBenchmarkFull = signal<RealisticBenchmarkSubmission | null>(null);

  // Filters
  selectedLibrary = signal('all');
  selectedMachineType = signal('all');
  minReliability = signal(0);
  sortBy = signal<'date' | 'score' | 'reliability'>('date');
  sortDirection = signal<'asc' | 'desc'>('desc');

  async ngOnInit() {
    await this.loadBenchmarks();
  }

  async loadBenchmarks() {
    this.loading.set(true);
    this.error.set('');

    try {
      const result = await this.benchmarkService.getBenchmarkHistory({
        limit: 100,
        minReliability:
          this.minReliability() > 0 ? this.minReliability() : undefined,
      });

      if (result.success) {
        this.benchmarks.set(result.benchmarks);
      } else {
        this.error.set('Failed to load benchmark history.');
      }
    } catch {
      this.error.set(
        'Failed to load benchmark history. Please try again later.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  get filteredBenchmarks() {
    let filtered = this.benchmarks();

    // Apply library filter
    if (this.selectedLibrary() !== 'all') {
      filtered = filtered.filter(
        (b) => b.summary.winnerLibrary === this.selectedLibrary()
      );
    }

    // Apply machine type filter
    if (this.selectedMachineType() !== 'all') {
      filtered = filtered.filter(
        (b) => b.summary.machineType === this.selectedMachineType()
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (this.sortBy()) {
        case 'date':
          comparison =
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'score':
          comparison = b.summary.winnerScore - a.summary.winnerScore;
          break;
        case 'reliability':
          comparison = b.summary.reliabilityScore - a.summary.reliabilityScore;
          break;
      }

      return this.sortDirection() === 'asc' ? -comparison : comparison;
    });

    return filtered;
  }

  get uniqueLibraries() {
    const libraries = new Set(
      this.benchmarks().map((b) => b.summary.winnerLibrary)
    );
    return Array.from(libraries).sort();
  }

  get uniqueMachineTypes() {
    const types = new Set(this.benchmarks().map((b) => b.summary.machineType));
    return Array.from(types).sort();
  }

  toggleSort(field: 'date' | 'score' | 'reliability') {
    if (this.sortBy() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDirection.set('desc');
    }
  }

  getSortIcon(field: 'date' | 'score' | 'reliability'): string {
    if (this.sortBy() !== field) return '↕️';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }

  getReliabilityColor(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }

  getLibraryColor(library: string): string {
    const colors: Record<string, string> = {
      signaltree: 'primary',
      ngrx: 'secondary',
      'ngrx-signals': 'info',
      akita: 'warning',
      elf: 'success',
      ngxs: 'purple',
    };
    return colors[library.toLowerCase()] || 'default';
  }

  async exportResults() {
    const data = this.filteredBenchmarks;
    // Export as JSON array
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signaltree-benchmark-history-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async exportCSV() {
    const data = this.filteredBenchmarks;
    this.benchmarkService.exportAsCSV(data);
  }

  async viewDetails(benchmark: RealisticBenchmarkHistory) {
    // Open details panel and fetch full details (with caching)
    this.selectedBenchmark.set(benchmark);
    this.detailsOpen.set(true);
    this.selectedBenchmarkFull.set(null);
    // If we already have full data attached to the history item, use it
    if (benchmark.fullData) {
      this.selectedBenchmarkFull.set(this.transformResults(benchmark.fullData));
      return;
    }

    this.detailsLoading.set(true);
    this.detailsError.set('');

    try {
      const result = await this.benchmarkService.getBenchmarkDetails(
        benchmark.id
      );

      if (result.success && result.data) {
        // Transform and attach to the history item for caching
        const transformed = this.transformResults(result.data);
        benchmark.fullData = result.data;
        this.selectedBenchmarkFull.set(transformed);
      } else {
        this.detailsError.set('Failed to load benchmark details');
        this.selectedBenchmarkFull.set(null);
      }
    } catch {
      this.detailsError.set('Failed to load benchmark details');
      this.selectedBenchmarkFull.set(null);
    } finally {
      this.detailsLoading.set(false);
    }
  }

  // Transform the nested library→scenarios structure to flat results array with libraryResults
  private transformResults(data: RealisticBenchmarkSubmission): any {
    const scenarioMap = new Map<string, any>();

    // First pass: collect all scenarios and their library results
    Object.entries(data.results.libraries).forEach(([libName, libData]) => {
      Object.entries(libData.scenarios).forEach(([scenarioId, scenarioData]) => {
        if (!scenarioMap.has(scenarioId)) {
          scenarioMap.set(scenarioId, {
            name: scenarioData.scenarioName,
            winner: '',
            marginOfVictory: 0,
            reliable: true,
            libraryResults: {}
          });
        }

        const scenario = scenarioMap.get(scenarioId);
        scenario.libraryResults[libName] = {
          opsPerSec: scenarioData.opsPerSec,
          time: scenarioData.median
        };
      });
    });

    // Second pass: determine winners and margins
    const results = Array.from(scenarioMap.values()).map(scenario => {
      const libs = Object.entries(scenario.libraryResults) as [string, any][];
      libs.sort((a, b) => b[1].opsPerSec - a[1].opsPerSec);

      if (libs.length > 0) {
        scenario.winner = libs[0][0];
        if (libs.length > 1) {
          const winnerOps = libs[0][1].opsPerSec;
          const secondOps = libs[1][1].opsPerSec;
          scenario.marginOfVictory = ((winnerOps - secondOps) / secondOps) * 100;
        }
      }

      return scenario;
    });

    return {
      ...data,
      results,
      metadata: {
        environment: {
          browser: data.machineInfo.browser,
          os: data.machineInfo.os,
          cpuCores: data.machineInfo.cpuCores,
          memory: `${data.machineInfo.memory} GB`,
          userAgent: data.machineInfo.userAgent
        }
      },
      scores: data.weightedResults?.libraries ? 
        Object.fromEntries(
          Object.entries(data.weightedResults.libraries).map(([name, data]: [string, any]) => [
            name,
            data.weightedScore || data.rawScore || 0
          ])
        ) : {},
      summary: {
        winnerLibrary: Object.entries(data.weightedResults?.libraries || {})
          .sort((a: any, b: any) => (b[1].weightedScore || 0) - (a[1].weightedScore || 0))[0]?.[0] || 'signaltree',
        reliabilityScore: data.calibration.reliabilityScore
      }
    };
  }

  closeDetails() {
    this.detailsOpen.set(false);
    this.selectedBenchmark.set(null);
    this.selectedBenchmarkFull.set(null);
    this.detailsError.set('');
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

  getMarginClass(margin: number): string {
    if (margin >= 50) return 'high';
    if (margin >= 20) return 'medium';
    return 'low';
  }

  getScoresArray(scores: Record<string, number>): Array<{library: string, score: number}> {
    return Object.entries(scores)
      .map(([library, score]) => ({ library, score }))
      .sort((a, b) => b.score - a.score);
  }

  getWinsForLibrary(results: any[], library: string): number {
    if (!results) return 0;
    return results.filter((r) => r.winner === library).length;
  }

  getLossesForLibrary(results: any[], library: string): number {
    if (!results) return 0;
    return results.filter((r) => r.winner !== library).length;
  }

}

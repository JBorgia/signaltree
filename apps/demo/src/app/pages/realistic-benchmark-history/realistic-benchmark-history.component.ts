import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  RealisticBenchmarkHistory,
  RealisticBenchmarkService,
  RealisticBenchmarkSubmission,
} from '../../services/realistic-benchmark.service';

@Component({
  selector: 'app-realistic-benchmark-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
    } catch (err) {
      this.error.set(
        'Failed to load benchmark history. Please try again later.'
      );
      console.error('Error loading benchmarks:', err);
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
    // If we already have full data attached to the history item, use it
    if (benchmark.fullData) {
      this.selectedBenchmarkFull.set(benchmark.fullData);
      return;
    }

    this.detailsLoading.set(true);
    this.detailsError.set('');

    try {
      const result = await this.benchmarkService.getBenchmarkDetails(
        benchmark.id
      );

      if (result.success && result.data) {
        // attach to the history item for caching
        benchmark.fullData = result.data;
        this.selectedBenchmarkFull.set(result.data);
      } else {
        this.detailsError.set('Failed to load benchmark details');
        this.selectedBenchmarkFull.set(null);
      }
    } catch (err) {
      console.error('Error loading details:', err);
      this.detailsError.set('Failed to load benchmark details');
      this.selectedBenchmarkFull.set(null);
    } finally {
      this.detailsLoading.set(false);
    }
  }

  closeDetails() {
    this.detailsOpen.set(false);
    this.selectedBenchmark.set(null);
    this.selectedBenchmarkFull.set(null);
    this.detailsError.set('');
  }
}

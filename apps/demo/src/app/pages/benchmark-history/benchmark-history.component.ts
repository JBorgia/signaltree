import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  BenchmarkHistory,
  BenchmarkService,
} from '../../services/benchmark.service';

@Component({
  selector: 'app-benchmark-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './benchmark-history.component.html',
  styleUrls: ['./benchmark-history.component.scss'],
})
export class BenchmarkHistoryComponent implements OnInit {
  benchmarks: BenchmarkHistory[] = [];
  loading = true;
  error = '';

  // Filters
  selectedBrowser = 'all';
  selectedOS = 'all';
  sortBy: 'date' | 'depth' | 'performance' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  private benchmarkService = inject(BenchmarkService);

  async ngOnInit() {
    await this.loadBenchmarks();
  }

  async loadBenchmarks() {
    this.loading = true;
    this.error = '';

    try {
      this.benchmarks = await this.benchmarkService.getBenchmarkHistory();
    } catch (err) {
      this.error = 'Failed to load benchmarks. Please try again later.';
      console.error('Error loading benchmarks:', err);
    } finally {
      this.loading = false;
    }
  }

  get filteredBenchmarks() {
    let filtered = this.benchmarks;

    // Apply filters
    if (this.selectedBrowser !== 'all') {
      filtered = filtered.filter((b) =>
        b.machineInfo.browser
          .toLowerCase()
          .includes(this.selectedBrowser.toLowerCase())
      );
    }

    if (this.selectedOS !== 'all') {
      filtered = filtered.filter((b) =>
        b.machineInfo.os.toLowerCase().includes(this.selectedOS.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (this.sortBy) {
        case 'date':
          comparison =
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'depth':
          comparison = b.depth - a.depth;
          break;
        case 'performance':
          comparison = a.results.creationTime - b.results.creationTime;
          break;
      }

      return this.sortDirection === 'asc' ? -comparison : comparison;
    });

    return filtered;
  }

  get uniqueBrowsers() {
    const browsers = new Set(
      this.benchmarks.map((b) => b.machineInfo.browser.split('/')[0])
    );
    return Array.from(browsers).sort();
  }

  get uniqueOS() {
    const os = new Set(this.benchmarks.map((b) => b.machineInfo.os));
    return Array.from(os).sort();
  }

  get stats() {
    if (this.filteredBenchmarks.length === 0) {
      return {
        avgDepth: 0,
        avgCreation: 0,
        avgAccess: 0,
        avgUpdate: 0,
        fastest: 0,
        slowest: 0,
        totalSubmissions: 0,
      };
    }

    const depths = this.filteredBenchmarks.map((b) => b.depth);
    const creationTimes = this.filteredBenchmarks.map(
      (b) => b.results.creationTime
    );
    const accessTimes = this.filteredBenchmarks.map(
      (b) => b.results.accessTime
    );
    const updateTimes = this.filteredBenchmarks.map(
      (b) => b.results.updateTime
    );

    return {
      avgDepth: Math.round(depths.reduce((a, b) => a + b, 0) / depths.length),
      avgCreation: (
        creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length
      ).toFixed(3),
      avgAccess: (
        accessTimes.reduce((a, b) => a + b, 0) / accessTimes.length
      ).toFixed(3),
      avgUpdate: (
        updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length
      ).toFixed(3),
      fastest: Math.min(...creationTimes).toFixed(3),
      slowest: Math.max(...creationTimes).toFixed(3),
      totalSubmissions: this.filteredBenchmarks.length,
    };
  }

  setSortBy(field: 'date' | 'depth' | 'performance') {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = 'desc';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getPerformanceClass(time: number): string {
    if (time < 0.05) return 'excellent';
    if (time < 0.1) return 'good';
    if (time < 0.5) return 'fair';
    return 'poor';
  }
}

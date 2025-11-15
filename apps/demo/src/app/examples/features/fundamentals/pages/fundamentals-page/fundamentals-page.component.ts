import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ExamplesRegistryService } from '../../../../core';
import { ExampleCardComponent } from '../../../../shared/components';

import type { FilterState } from '../../../../core/models';

/**
 * Fundamentals page - displays filterable grid of all fundamental examples.
 * Features multi-dimensional filtering (category, difficulty, focus areas, etc.).
 */
@Component({
  selector: 'app-fundamentals-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ExampleCardComponent],
  templateUrl: './fundamentals-page.component.html',
  styleUrl: './fundamentals-page.component.scss',
})
export class FundamentalsPageComponent {
  private readonly examplesRegistry = new ExamplesRegistryService();

  // Filter state
  private _filters = signal<FilterState>({
    category: '',
    focusAreas: [],
    functionalUse: [],
    enhancers: [],
    difficulty: '',
    searchTerm: '',
  });

  // Public getter for template access
  get filters() {
    return this._filters;
  }

  // Available filter options
  readonly availableCategories = this.examplesRegistry.getUniqueCategories();
  readonly availableFocusAreas = this.examplesRegistry.getUniqueFocusAreas();
  readonly availableFunctionalUses =
    this.examplesRegistry.getUniqueFunctionalUses();
  readonly availableEnhancers = this.examplesRegistry.getUniqueEnhancers();

  // Computed filtered examples
  filteredExamples = computed(() => {
    const currentFilters = this._filters();
    const allExamples = this.examplesRegistry.getAllExamples();

    const filtered = allExamples.filter((example) => {
      // Category filter
      if (
        currentFilters.category &&
        example.category !== currentFilters.category
      ) {
        return false;
      }

      // Difficulty filter
      if (
        currentFilters.difficulty &&
        example.difficulty !== currentFilters.difficulty
      ) {
        return false;
      }

      // Focus areas filter (AND logic - example must have ALL selected focus areas)
      if (currentFilters.focusAreas.length > 0) {
        const hasAllFocusAreas = currentFilters.focusAreas.every((area) =>
          example.focusAreas.includes(area)
        );
        if (!hasAllFocusAreas) {
          return false;
        }
      }

      // Functional use filter (OR logic - example must have at least one selected use)
      if (currentFilters.functionalUse.length > 0) {
        const hasAnyFunctionalUse = currentFilters.functionalUse.some((use) =>
          example.functionalUse.includes(use)
        );
        if (!hasAnyFunctionalUse) {
          return false;
        }
      }

      // Enhancers filter (OR logic - example must have at least one selected enhancer)
      if (currentFilters.enhancers.length > 0) {
        const hasAnyEnhancer = currentFilters.enhancers.some((enhancer) =>
          example.enhancers.includes(enhancer)
        );
        if (!hasAnyEnhancer) {
          return false;
        }
      }

      // Search term filter
      if (currentFilters.searchTerm.trim()) {
        const searchTerm = currentFilters.searchTerm.toLowerCase();
        const searchableText = [
          example.title,
          example.description,
          example.category,
          ...example.tags,
          ...example.focusAreas,
          ...example.functionalUse,
        ]
          .join(' ')
          .toLowerCase();

        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    // Pin What's New to the top regardless of other ordering
    return filtered.sort((a, b) => {
      if (a.id === 'whats-new' && b.id !== 'whats-new') return -1;
      if (b.id === 'whats-new' && a.id !== 'whats-new') return 1;
      // Secondary sort: category then title for stable display
      const cat = a.category.localeCompare(b.category);
      if (cat !== 0) return cat;
      return a.title.localeCompare(b.title);
    });
  });

  // Computed active filter count
  activeFilterCount = computed(() => {
    const f = this._filters();
    let count = 0;
    if (f.category) count++;
    if (f.difficulty) count++;
    if (f.focusAreas.length > 0) count++;
    if (f.functionalUse.length > 0) count++;
    if (f.enhancers.length > 0) count++;
    if (f.searchTerm.trim()) count++;
    return count;
  });

  // Filter toggle methods
  toggleFocusArea(area: string) {
    this._filters.update((f) => ({
      ...f,
      focusAreas: f.focusAreas.includes(area)
        ? f.focusAreas.filter((a) => a !== area)
        : [...f.focusAreas, area],
    }));
  }

  toggleFunctionalUse(use: string) {
    this._filters.update((f) => ({
      ...f,
      functionalUse: f.functionalUse.includes(use)
        ? f.functionalUse.filter((u) => u !== use)
        : [...f.functionalUse, use],
    }));
  }

  toggleEnhancer(enhancer: string) {
    this._filters.update((f) => ({
      ...f,
      enhancers: f.enhancers.includes(enhancer)
        ? f.enhancers.filter((e) => e !== enhancer)
        : [...f.enhancers, enhancer],
    }));
  }

  clearFilters() {
    this._filters.set({
      category: '',
      focusAreas: [],
      functionalUse: [],
      enhancers: [],
      difficulty: '',
      searchTerm: '',
    });
  }

  // Quick action methods
  filterByDifficulty(difficulty: string) {
    this._filters.update((f) => ({ ...f, difficulty }));
    // Smooth scroll to filters
    document.querySelector('#filters')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Setter methods for two-way binding
  setDifficulty(difficulty: string) {
    this._filters.update((f) => ({ ...f, difficulty }));
  }

  setCategory(category: string) {
    this._filters.update((f) => ({ ...f, category }));
  }

  setSearchTerm(searchTerm: string) {
    this._filters.update((f) => ({ ...f, searchTerm }));
  }

  // Getter methods for two-way binding
  get difficulty(): string {
    return this._filters().difficulty;
  }

  get category(): string {
    return this._filters().category;
  }

  get searchTerm(): string {
    return this._filters().searchTerm;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

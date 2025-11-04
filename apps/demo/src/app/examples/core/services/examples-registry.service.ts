import { Injectable } from '@angular/core';

import { EXAMPLES_REGISTRY } from '../config/examples.config';

import type { ExampleMeta } from '../models';
/**
 * Service for accessing and filtering the examples registry.
 * Provides a centralized API for working with example metadata.
 */
@Injectable({
  providedIn: 'root',
})
export class ExamplesRegistryService {
  /**
   * Get all registered examples
   */
  getAllExamples(): ExampleMeta[] {
    return EXAMPLES_REGISTRY;
  }

  /**
   * Get example by ID
   */
  getExampleById(id: string): ExampleMeta | undefined {
    return EXAMPLES_REGISTRY.find((example) => example.id === id);
  }

  /**
   * Get examples by category
   */
  getExamplesByCategory(category: string): ExampleMeta[] {
    return EXAMPLES_REGISTRY.filter((example) => example.category === category);
  }

  /**
   * Get examples by difficulty
   */
  getExamplesByDifficulty(
    difficulty: ExampleMeta['difficulty']
  ): ExampleMeta[] {
    return EXAMPLES_REGISTRY.filter(
      (example) => example.difficulty === difficulty
    );
  }

  /**
   * Get examples by focus area
   */
  getExamplesByFocusArea(focusArea: string): ExampleMeta[] {
    return EXAMPLES_REGISTRY.filter((example) =>
      example.focusAreas.includes(focusArea)
    );
  }

  /**
   * Get examples by tag
   */
  getExamplesByTag(tag: string): ExampleMeta[] {
    return EXAMPLES_REGISTRY.filter((example) => example.tags.includes(tag));
  }

  /**
   * Get unique categories for filter options
   */
  getUniqueCategories(): string[] {
    return [...new Set(EXAMPLES_REGISTRY.map((ex) => ex.category))].sort();
  }

  /**
   * Get unique focus areas for filter options
   */
  getUniqueFocusAreas(): string[] {
    return [
      ...new Set(EXAMPLES_REGISTRY.flatMap((ex) => ex.focusAreas)),
    ].sort();
  }

  /**
   * Get unique functional uses for filter options
   */
  getUniqueFunctionalUses(): string[] {
    return [
      ...new Set(EXAMPLES_REGISTRY.flatMap((ex) => ex.functionalUse)),
    ].sort();
  }

  /**
   * Get unique enhancers for filter options
   */
  getUniqueEnhancers(): string[] {
    return [...new Set(EXAMPLES_REGISTRY.flatMap((ex) => ex.enhancers))].sort();
  }

  /**
   * Get unique tags for filter options
   */
  getUniqueTags(): string[] {
    return [...new Set(EXAMPLES_REGISTRY.flatMap((ex) => ex.tags))].sort();
  }
}

/**
 * State interface for example filtering.
 * Used by the fundamentals page to manage active filters.
 */
export interface FilterState {
  /** Selected category filter (empty string = all) */
  category: string;

  /** Selected focus areas (AND logic - example must have all) */
  focusAreas: string[];

  /** Selected functional uses (OR logic - example must have at least one) */
  functionalUse: string[];

  /** Selected enhancers (OR logic - example must have at least one) */
  enhancers: string[];

  /** Selected difficulty level (empty string = all) */
  difficulty: string;

  /** Free-text search term */
  searchTerm: string;
}

/**
 * Metadata interface for SignalTree examples.
 * Contains all information needed to display, filter, and render an example.
 */
export interface ExampleMeta {
  /** Unique identifier for the example */
  id: string;

  /** Display title shown in cards and pages */
  title: string;

  /** Brief description of what the example demonstrates */
  description: string;

  /** Primary category for filtering (e.g., 'Signals', 'Entities', 'Performance') */
  category: string;

  /** Core concepts demonstrated in this example */
  focusAreas: string[];

  /** Functional use cases this example addresses */
  functionalUse: string[];

  /** SignalTree enhancers used in this example */
  enhancers: string[];

  /** Route path to this example */
  route: string;

  /** Component class to render */
  component: unknown;

  /** Difficulty level for learners */
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  /** Additional searchable tags */
  tags: string[];
}

import { AsyncDemoComponent } from '../../features/fundamentals/examples/async/async-demo.component';
import { EffectsDemoComponent } from '../../features/fundamentals/examples/effects/effects-demo.component';
import { BatchingDemoComponent } from '../../features/fundamentals/examples/enhancers/batching-demo/batching-demo.component';
import {
  CallableSyntaxDemoComponent,
} from '../../features/fundamentals/examples/enhancers/callable-syntax-demo/callable-syntax-demo.component';
import { DevtoolsDemoComponent } from '../../features/fundamentals/examples/enhancers/devtools-demo/devtools-demo.component';
import {
  PersistenceDemoComponent,
} from '../../features/fundamentals/examples/enhancers/persistence-demo/persistence-demo.component';
import { PresetsDemoComponent } from '../../features/fundamentals/examples/enhancers/presets-demo/presets-demo.component';
import {
  SerializationDemoComponent,
} from '../../features/fundamentals/examples/enhancers/serialization-demo/serialization-demo.component';
import { EntitiesDemoComponent } from '../../features/fundamentals/examples/entities/entities-demo.component';
import { FormsDemoComponent } from '../../features/fundamentals/examples/forms/forms-demo.component';
import { MemoizationDemoComponent } from '../../features/fundamentals/examples/memoization/memoization-demo.component';
import {
  RecommendedArchitectureComponent,
} from '../../features/fundamentals/examples/recommended-architecture/recommended-architecture.component';
import { SignalFormsDemoComponent } from '../../features/fundamentals/examples/signal-forms/signal-forms-demo.component';
import { SignalsExamplesComponent } from '../../features/fundamentals/examples/signals/signals-examples.component';
import { TimeTravelDemoComponent } from '../../features/fundamentals/examples/time-travel/time-travel-demo.component';
import { WhatsNewComponent } from '../../features/fundamentals/examples/whats-new/whats-new.component';

import type { ExampleMeta } from '../models';
// Import example components from the new features structure
/**
 * Signals Examples
 */
export const signalsExampleMeta: ExampleMeta = {
  id: 'signals-basics',
  title: 'Signals Basics',
  description:
    'Learn the fundamentals of SignalTree signals with counters and reactive inputs.',
  category: 'Signals',
  focusAreas: ['signals', 'reactivity'],
  functionalUse: ['state-management', 'ui-updates'],
  enhancers: [],
  route: '/examples/fundamentals/signals',
  component: SignalsExamplesComponent,
  difficulty: 'beginner',
  tags: ['signals', 'counter', 'reactive-input', 'computed'],
};

/**
 * Entities Examples
 */
export const entitiesExampleMeta: ExampleMeta = {
  id: 'entity-management',
  title: 'Entity Management',
  description:
    'CRUD operations for managing collections of users and posts with pagination and sorting.',
  category: 'Entities',
  focusAreas: ['entities', 'crud', 'collections'],
  functionalUse: ['data-management', 'pagination', 'sorting'],
  enhancers: ['entities'],
  route: '/examples/fundamentals/entities',
  component: EntitiesDemoComponent,
  difficulty: 'intermediate',
  tags: ['entities', 'crud', 'pagination', 'sorting', 'collections'],
};

/**
 * Batching Examples
 */
export const batchingExampleMeta: ExampleMeta = {
  id: 'batching-updates',
  title: 'Batching Updates',
  description:
    'Learn how to batch multiple state updates for optimal performance.',
  category: 'Performance',
  focusAreas: ['batching', 'performance', 'optimization'],
  functionalUse: ['bulk-updates', 'performance'],
  enhancers: ['batching'],
  route: '/examples/fundamentals/enhancers/batching',
  component: BatchingDemoComponent,
  difficulty: 'intermediate',
  tags: ['batching', 'performance', 'optimization', 'bulk-updates'],
};

/**
 * Callable Syntax Examples
 */
export const callableSyntaxExampleMeta: ExampleMeta = {
  id: 'callable-syntax',
  title: 'Callable Syntax',
  description:
    'Master the unified callable API for setting and updating signal values.',
  category: 'API',
  focusAreas: ['api', 'syntax', 'usability'],
  functionalUse: ['state-updates', 'api-usage'],
  enhancers: ['callable-syntax'],
  route: '/examples/fundamentals/enhancers/callable-syntax',
  component: CallableSyntaxDemoComponent,
  difficulty: 'beginner',
  tags: ['callable-syntax', 'api', 'fluent-api', 'usability'],
};

/**
 * DevTools Examples
 */
export const devtoolsExampleMeta: ExampleMeta = {
  id: 'devtools-integration',
  title: 'DevTools Integration',
  description:
    'Explore debugging and development tools for SignalTree applications.',
  category: 'Development',
  focusAreas: ['debugging', 'development', 'tools'],
  functionalUse: ['debugging', 'development'],
  enhancers: ['devtools'],
  route: '/examples/fundamentals/enhancers/devtools',
  component: DevtoolsDemoComponent,
  difficulty: 'intermediate',
  tags: ['devtools', 'debugging', 'development', 'logging'],
};

/**
 * Presets Examples
 */
export const presetsExampleMeta: ExampleMeta = {
  id: 'presets-configurations',
  title: 'Presets & Configurations',
  description:
    'Use pre-configured SignalTree setups for common development scenarios.',
  category: 'Configuration',
  focusAreas: ['presets', 'configuration', 'setup'],
  functionalUse: ['quick-start', 'best-practices'],
  enhancers: ['presets'],
  route: '/examples/fundamentals/enhancers/presets',
  component: PresetsDemoComponent,
  difficulty: 'intermediate',
  tags: [
    'presets',
    'configuration',
    'development',
    'production',
    'performance',
  ],
};

/**
 * Persistence Examples
 */
export const persistenceExampleMeta: ExampleMeta = {
  id: 'persistence',
  title: 'Persistence & Auto-Save',
  description:
    'Automatically save and restore state from localStorage with debounced auto-save.',
  category: 'Data Management',
  focusAreas: ['persistence', 'localStorage', 'auto-save'],
  functionalUse: ['state-persistence', 'data-storage', 'offline'],
  enhancers: ['persistence', 'serialization'],
  route: '/examples/fundamentals/enhancers/persistence',
  component: PersistenceDemoComponent,
  difficulty: 'intermediate',
  tags: [
    'persistence',
    'localStorage',
    'auto-save',
    'serialization',
    'offline',
  ],
};

/**
 * Serialization Examples
 */
export const serializationExampleMeta: ExampleMeta = {
  id: 'serialization',
  title: 'Serialization',
  description:
    'Export and import state as JSON with automatic type preservation for Date, Set, Map, and more.',
  category: 'Data Management',
  focusAreas: ['serialization', 'json', 'type-preservation'],
  functionalUse: ['state-export', 'state-import', 'data-transfer'],
  enhancers: ['serialization'],
  route: '/examples/fundamentals/enhancers/serialization',
  component: SerializationDemoComponent,
  difficulty: 'intermediate',
  tags: ['serialization', 'json', 'type-preservation', 'export', 'import'],
};

/**
 * Memoization Examples
 */
export const memoizationExampleMeta: ExampleMeta = {
  id: 'memoization-caching',
  title: 'Memoization & Caching',
  description:
    'Cache expensive computations and optimize performance with memoization.',
  category: 'Performance',
  focusAreas: ['memoization', 'caching', 'performance'],
  functionalUse: ['optimization', 'expensive-computations'],
  enhancers: ['memoization'],
  route: '/examples/fundamentals/memoization',
  component: MemoizationDemoComponent,
  difficulty: 'intermediate',
  tags: ['memoization', 'caching', 'performance', 'optimization'],
};

/**
 * Time Travel Examples
 */
export const timeTravelExampleMeta: ExampleMeta = {
  id: 'time-travel-debugging',
  title: 'Time Travel Debugging',
  description:
    'Undo/redo operations and explore state history with time travel debugging.',
  category: 'Development',
  focusAreas: ['time-travel', 'debugging', 'history'],
  functionalUse: ['undo-redo', 'debugging', 'state-history'],
  enhancers: ['time-travel'],
  route: '/examples/fundamentals/time-travel',
  component: TimeTravelDemoComponent,
  difficulty: 'advanced',
  tags: [
    'time-travel',
    'undo-redo',
    'debugging',
    'history',
    'state-management',
  ],
};

/**
 * Effects Examples
 */
export const effectsExampleMeta: ExampleMeta = {
  id: 'effects-side-effects',
  title: 'Effects & Side Effects',
  description:
    'Handle side effects with auto-save, notifications, and localStorage sync.',
  category: 'Signals',
  focusAreas: ['effects', 'side-effects', 'reactivity'],
  functionalUse: ['auto-save', 'notifications', 'sync'],
  enhancers: [],
  route: '/examples/fundamentals/effects',
  component: EffectsDemoComponent,
  difficulty: 'intermediate',
  tags: ['effects', 'auto-save', 'localStorage', 'notifications'],
};

/**
 * Forms Examples
 */
export const formsExampleMeta: ExampleMeta = {
  id: 'forms-integration',
  title: 'Forms Integration',
  description:
    'Signal-based form validation with real-time feedback and password strength.',
  category: 'Signals',
  focusAreas: ['forms', 'validation', 'computed'],
  functionalUse: ['form-handling', 'validation', 'user-input'],
  enhancers: [],
  route: '/examples/fundamentals/forms',
  component: FormsDemoComponent,
  difficulty: 'intermediate',
  tags: ['forms', 'validation', 'computed', 'reactive'],
};

/**
 * Signal Forms (Angular 20+) Examples
 */
export const signalFormsExampleMeta: ExampleMeta = {
  id: 'signal-forms',
  title: 'Signal Forms (Angular 20+)',
  description:
    'Angular Signal Forms integration with toWritableSignal() for slices and direct connect() for leaves.',
  category: 'Angular',
  focusAreas: ['signal-forms', 'forms', 'angular-20'],
  functionalUse: ['form-binding', 'two-way-sync', 'toWritableSignal'],
  enhancers: [],
  route: '/examples/fundamentals/signal-forms',
  component: SignalFormsDemoComponent,
  difficulty: 'intermediate',
  tags: [
    'angular',
    'signal-forms',
    'connect',
    'toWritableSignal',
    'reactive-forms',
  ],
};

/**
 * Async Examples
 */
export const asyncExampleMeta: ExampleMeta = {
  id: 'async-operations',
  title: 'Async Operations',
  description:
    'Handle async data loading, debounced search, and optimistic updates.',
  category: 'API',
  focusAreas: ['async', 'loading-states', 'error-handling'],
  functionalUse: ['data-fetching', 'search', 'optimistic-updates'],
  enhancers: [],
  route: '/examples/fundamentals/async',
  component: AsyncDemoComponent,
  difficulty: 'intermediate',
  tags: ['async', 'loading', 'debounce', 'search', 'errors'],
};

/**
 * Recommended Architecture Example
 */
export const recommendedArchitectureExampleMeta: ExampleMeta = {
  id: 'recommended-architecture',
  title: 'Recommended Architecture',
  description:
    'Global tree + selective facades pattern with clean API separation and direct component access.',
  category: 'Architecture',
  focusAreas: ['architecture', 'global-tree', 'facades', 'api-separation'],
  functionalUse: ['state-management', 'orchestration', 'data-flow'],
  enhancers: ['entities', 'batching'],
  route: '/examples/fundamentals/recommended-architecture',
  component: RecommendedArchitectureComponent,
  difficulty: 'advanced',
  tags: [
    'architecture',
    'global-tree',
    'facades',
    'best-practices',
    'api-separation',
  ],
};

/**
 * Central registry of all examples
 */
export const EXAMPLES_REGISTRY: ExampleMeta[] = [
  {
    id: 'whats-new',
    title: "What's New",
    description:
      'Latest changes: Signal Forms demo, toWritableSignal improvements, accessibility fixes, and deprecations.',
    category: 'General',
    focusAreas: ['news', 'changelog'],
    functionalUse: ['release-notes'],
    enhancers: [],
    route: '/examples/fundamentals/whats-new',
    component: WhatsNewComponent,
    difficulty: 'beginner',
    tags: ['news', 'readme', 'updates'],
  },
  signalsExampleMeta,
  entitiesExampleMeta,
  batchingExampleMeta,
  callableSyntaxExampleMeta,
  devtoolsExampleMeta,
  presetsExampleMeta,
  persistenceExampleMeta,
  serializationExampleMeta,
  memoizationExampleMeta,
  timeTravelExampleMeta,
  effectsExampleMeta,
  formsExampleMeta,
  signalFormsExampleMeta,
  asyncExampleMeta,
  recommendedArchitectureExampleMeta,
];

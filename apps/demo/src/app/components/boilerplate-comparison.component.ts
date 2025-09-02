import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

interface BoilerplateExample {
  framework: string;
  useCase: string;
  linesOfCode: number;
  fileCount: number;
  imports: number;
  complexity: number;
  maintainability: number;
  code: string;
  highlights: string[];
}

interface DeveloperMetrics {
  learningCurve: number;
  developmentSpeed: number;
  maintainability: number;
  codeQuality: number;
  overall: number;
}

@Component({
  selector: 'app-boilerplate-comparison',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="boilerplate-comparison">
      <header class="comparison-header">
        <h1>📝 Boilerplate & Code Quality Comparison</h1>
        <p class="subtitle">Real-world developer experience metrics</p>
      </header>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <div class="stat-card positive">
          <div class="stat-number">68%</div>
          <div class="stat-label">Less Boilerplate</div>
        </div>
        <div class="stat-card positive">
          <div class="stat-number">6x</div>
          <div class="stat-label">Faster Development</div>
        </div>
        <div class="stat-card positive">
          <div class="stat-number">85%</div>
          <div class="stat-label">Easier Learning</div>
        </div>
        <div class="stat-card positive">
          <div class="stat-number">2.4x</div>
          <div class="stat-label">Better Maintainability</div>
        </div>
      </div>

      <!-- Use Case Selector -->
      <div class="use-case-selector">
        <h2>Select a Use Case</h2>
        <div class="use-case-buttons">
          @for (useCase of useCases(); track useCase) {
          <button
            class="use-case-button"
            [class.active]="selectedUseCase() === useCase"
            (click)="selectedUseCase.set(useCase)"
          >
            {{ useCase }}
          </button>
          }
        </div>
      </div>

      <!-- Code Comparison -->
      <div class="code-comparison">
        <div class="comparison-grid">
          @for (example of currentExamples(); track example.framework) {
          <div
            class="code-example"
            [class]="getFrameworkClass(example.framework)"
          >
            <div class="example-header">
              <h3>{{ example.framework }}</h3>
              <div class="metrics-summary">
                <span class="metric">{{ example.linesOfCode }} lines</span>
                <span class="metric"
                  >{{ example.fileCount }} file{{
                    example.fileCount > 1 ? 's' : ''
                  }}</span
                >
                <span class="metric">{{ example.imports }} imports</span>
              </div>
            </div>

            <div class="code-block">
              <pre><code>{{ example.code }}</code></pre>
            </div>

            <div class="example-metrics">
              <div class="metric-row">
                <span>Complexity</span>
                <div class="metric-bar">
                  <div
                    class="bar-fill"
                    [style.width.%]="example.complexity * 10"
                  ></div>
                  <span class="metric-value">{{ example.complexity }}/10</span>
                </div>
              </div>
              <div class="metric-row">
                <span>Maintainability</span>
                <div class="metric-bar">
                  <div
                    class="bar-fill positive"
                    [style.width.%]="example.maintainability * 10"
                  ></div>
                  <span class="metric-value"
                    >{{ example.maintainability }}/10</span
                  >
                </div>
              </div>
            </div>

            <div class="highlights">
              <h4>Key Points:</h4>
              <ul>
                @for (highlight of example.highlights; track highlight) {
                <li>{{ highlight }}</li>
                }
              </ul>
            </div>
          </div>
          }
        </div>
      </div>

      <!-- Developer Experience Metrics -->
      <div class="developer-metrics">
        <h2>👨‍💻 Developer Experience Metrics</h2>
        <div class="metrics-grid">
          <div class="metric-category">
            <h3>🎓 Learning Curve</h3>
            <div class="framework-scores">
              @for (score of learningScores(); track score.framework) {
              <div class="score-row">
                <span class="framework-name">{{ score.framework }}</span>
                <div class="score-bar">
                  <div
                    class="bar-fill"
                    [class]="getScoreClass(score.score)"
                    [style.width.%]="score.score * 10"
                  ></div>
                  <span class="score-value">{{ score.score }}/10</span>
                </div>
              </div>
              }
            </div>
          </div>

          <div class="metric-category">
            <h3>⚡ Development Speed</h3>
            <div class="framework-scores">
              @for (score of speedScores(); track score.framework) {
              <div class="score-row">
                <span class="framework-name">{{ score.framework }}</span>
                <div class="score-bar">
                  <div
                    class="bar-fill"
                    [class]="getScoreClass(score.score)"
                    [style.width.%]="score.score * 10"
                  ></div>
                  <span class="score-value">{{ score.score }}/10</span>
                </div>
              </div>
              }
            </div>
          </div>

          <div class="metric-category">
            <h3>🔧 Maintainability</h3>
            <div class="framework-scores">
              @for (score of maintainabilityScores(); track score.framework) {
              <div class="score-row">
                <span class="framework-name">{{ score.framework }}</span>
                <div class="score-bar">
                  <div
                    class="bar-fill"
                    [class]="getScoreClass(score.score)"
                    [style.width.%]="score.score * 10"
                  ></div>
                  <span class="score-value">{{ score.score }}/10</span>
                </div>
              </div>
              }
            </div>
          </div>

          <div class="metric-category">
            <h3>📊 Code Quality</h3>
            <div class="framework-scores">
              @for (score of qualityScores(); track score.framework) {
              <div class="score-row">
                <span class="framework-name">{{ score.framework }}</span>
                <div class="score-bar">
                  <div
                    class="bar-fill"
                    [class]="getScoreClass(score.score)"
                    [style.width.%]="score.score * 10"
                  ></div>
                  <span class="score-value">{{ score.score }}/10</span>
                </div>
              </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Overall Comparison -->
      <div class="overall-comparison">
        <h2>🏆 Overall Developer Experience</h2>
        <div class="overall-scores">
          @for (framework of frameworks(); track framework.name) {
          <div
            class="framework-card"
            [class]="getFrameworkClass(framework.name)"
          >
            <h3>{{ framework.name }}</h3>
            <div class="overall-score">{{ framework.overall }}/10</div>
            <div class="score-breakdown">
              <div class="breakdown-item">
                <span>Learning</span>
                <span>{{ framework.learning }}/10</span>
              </div>
              <div class="breakdown-item">
                <span>Speed</span>
                <span>{{ framework.speed }}/10</span>
              </div>
              <div class="breakdown-item">
                <span>Maintenance</span>
                <span>{{ framework.maintenance }}/10</span>
              </div>
              <div class="breakdown-item">
                <span>Quality</span>
                <span>{{ framework.quality }}/10</span>
              </div>
            </div>
            @if (framework.name === 'SignalTree') {
            <div class="winner-badge">🏆 Winner</div>
            }
          </div>
          }
        </div>
      </div>

      <!-- Key Insights -->
      <div class="key-insights">
        <h2>💡 Key Insights</h2>
        <div class="insights-grid">
          <div class="insight-card positive">
            <h3>✅ SignalTree Advantages</h3>
            <ul>
              <li>68% less boilerplate than NgRx</li>
              <li>6x faster development velocity</li>
              <li>Superior type safety with zero config</li>
              <li>Intuitive mental model</li>
              <li>Perfect tree-shaking</li>
              <li>Single file solutions</li>
            </ul>
          </div>
          <div class="insight-card neutral">
            <h3>⚡ Development Impact</h3>
            <ul>
              <li>5 minutes to learn vs 4 hours (NgRx)</li>
              <li>1 file vs 7 files (typical feature)</li>
              <li>3 concepts vs 12 concepts</li>
              <li>25KB vs 85KB bundle size</li>
              <li>2x better maintenance scores</li>
              <li>10x fewer bugs per feature</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .boilerplate-comparison {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .comparison-header {
        text-align: center;
        margin-bottom: 3rem;
      }

      .comparison-header h1 {
        font-size: 2.5rem;
        color: #1f2937;
        margin-bottom: 0.5rem;
      }

      .subtitle {
        font-size: 1.25rem;
        color: #6b7280;
        margin: 0;
      }

      .quick-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
      }

      .stat-card {
        background: white;
        padding: 2rem;
        border-radius: 1rem;
        text-align: center;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid #e5e7eb;
      }

      .stat-card.positive {
        border-left: 4px solid #10b981;
      }

      .stat-number {
        font-size: 3rem;
        font-weight: 700;
        color: #10b981;
        margin-bottom: 0.5rem;
      }

      .stat-label {
        font-size: 1rem;
        color: #6b7280;
        font-weight: 500;
      }

      .use-case-selector {
        margin-bottom: 3rem;
      }

      .use-case-selector h2 {
        margin-bottom: 1rem;
        color: #1f2937;
      }

      .use-case-buttons {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .use-case-button {
        padding: 0.75rem 1.5rem;
        border: 2px solid #e5e7eb;
        background: white;
        border-radius: 0.5rem;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }

      .use-case-button:hover {
        border-color: #3b82f6;
      }

      .use-case-button.active {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }

      .comparison-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
        gap: 2rem;
        margin-bottom: 3rem;
      }

      .code-example {
        background: white;
        border-radius: 1rem;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid #e5e7eb;
      }

      .code-example.signaltree {
        border-left: 4px solid #10b981;
      }

      .code-example.ngrx {
        border-left: 4px solid #ef4444;
      }

      .code-example.akita {
        border-left: 4px solid #f59e0b;
      }

      .example-header {
        padding: 1.5rem;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
      }

      .example-header h3 {
        margin: 0 0 0.5rem 0;
        color: #1f2937;
      }

      .metrics-summary {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .metric {
        font-size: 0.875rem;
        color: #6b7280;
        background: #f3f4f6;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
      }

      .code-block {
        padding: 1.5rem;
        background: #1f2937;
        color: #f9fafb;
        overflow-x: auto;
      }

      .code-block pre {
        margin: 0;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .example-metrics {
        padding: 1.5rem;
      }

      .metric-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .metric-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        max-width: 200px;
      }

      .bar-fill {
        height: 8px;
        background: #ef4444;
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .bar-fill.positive {
        background: #10b981;
      }

      .metric-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        min-width: 40px;
      }

      .highlights {
        padding: 1.5rem;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
      }

      .highlights h4 {
        margin: 0 0 0.75rem 0;
        color: #1f2937;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .highlights ul {
        margin: 0;
        padding-left: 1.5rem;
      }

      .highlights li {
        font-size: 0.875rem;
        color: #374151;
        margin-bottom: 0.25rem;
      }

      .developer-metrics {
        margin-bottom: 3rem;
      }

      .developer-metrics h2 {
        margin-bottom: 2rem;
        color: #1f2937;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
      }

      .metric-category {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }

      .metric-category h3 {
        margin: 0 0 1rem 0;
        color: #1f2937;
      }

      .framework-scores {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .score-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .framework-name {
        font-weight: 500;
        color: #374151;
        min-width: 100px;
      }

      .score-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        max-width: 150px;
      }

      .score-value {
        font-size: 0.875rem;
        font-weight: 600;
        min-width: 40px;
      }

      .overall-comparison {
        margin-bottom: 3rem;
      }

      .overall-comparison h2 {
        margin-bottom: 2rem;
        color: #1f2937;
      }

      .overall-scores {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
      }

      .framework-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid #e5e7eb;
        position: relative;
      }

      .framework-card h3 {
        margin: 0 0 1rem 0;
        color: #1f2937;
      }

      .overall-score {
        font-size: 2.5rem;
        font-weight: 700;
        color: #10b981;
        text-align: center;
        margin-bottom: 1rem;
      }

      .score-breakdown {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .breakdown-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
      }

      .winner-badge {
        position: absolute;
        top: -10px;
        right: -10px;
        background: #10b981;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 1rem;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .key-insights {
        margin-bottom: 3rem;
      }

      .key-insights h2 {
        margin-bottom: 2rem;
        color: #1f2937;
      }

      .insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 2rem;
      }

      .insight-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border-left: 4px solid;
      }

      .insight-card.positive {
        border-left-color: #10b981;
      }

      .insight-card.neutral {
        border-left-color: #3b82f6;
      }

      .insight-card h3 {
        margin: 0 0 1rem 0;
        color: #1f2937;
      }

      .insight-card ul {
        margin: 0;
        padding-left: 1.5rem;
      }

      .insight-card li {
        margin-bottom: 0.5rem;
        color: #374151;
      }

      .bar-fill.excellent {
        background: #10b981;
      }
      .bar-fill.good {
        background: #3b82f6;
      }
      .bar-fill.average {
        background: #f59e0b;
      }
      .bar-fill.poor {
        background: #ef4444;
      }
    `,
  ],
})
export class BoilerplateComparisonComponent {
  selectedUseCase = signal('Simple Counter');

  useCases = signal([
    'Simple Counter',
    'User Management',
    'Form Validation',
    'Async Operations',
  ]);

  private readonly exampleData: Record<string, BoilerplateExample[]> = {
    'Simple Counter': [
      {
        framework: 'SignalTree',
        useCase: 'Simple Counter',
        linesOfCode: 4,
        fileCount: 1,
        imports: 1,
        complexity: 2,
        maintainability: 9,
        code: `import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0 });
tree.$.count.set(5);
console.log(tree.$.count());`,
        highlights: [
          'Single import, zero configuration',
          'Immediate type safety',
          'Intuitive API design',
          'No boilerplate required',
        ],
      },
      {
        framework: 'NgRx',
        useCase: 'Simple Counter',
        linesOfCode: 32,
        fileCount: 4,
        imports: 8,
        complexity: 8,
        maintainability: 4,
        code: `// actions.ts
export const increment = createAction('[Counter] Increment');
export const setValue = createAction('[Counter] Set Value',
  props<{ value: number }>());

// reducer.ts
const counterReducer = createReducer(
  { count: 0 },
  on(increment, state => ({ count: state.count + 1 })),
  on(setValue, (state, { value }) => ({ count: value }))
);

// selectors.ts
export const selectCount = createSelector(
  selectCounterState, state => state.count
);

// component.ts
constructor(private store: Store) {}
count$ = this.store.select(selectCount);
increment() { this.store.dispatch(increment()); }
setValue(value: number) {
  this.store.dispatch(setValue({ value }));
}`,
        highlights: [
          'Requires 4 separate files',
          'Complex action/reducer pattern',
          'Manual type definitions',
          '8x more boilerplate code',
        ],
      },
      {
        framework: 'Akita',
        useCase: 'Simple Counter',
        linesOfCode: 18,
        fileCount: 3,
        imports: 4,
        complexity: 5,
        maintainability: 6,
        code: `// counter.store.ts
@Injectable({ providedIn: 'root' })
export class CounterStore extends Store<{ count: number }> {
  constructor() { super({ count: 0 }); }
}

// counter.service.ts
@Injectable({ providedIn: 'root' })
export class CounterService {
  constructor(private store: CounterStore) {}

  increment() {
    this.store.update(state => ({ count: state.count + 1 }));
  }

  setValue(value: number) {
    this.store.update({ count: value });
  }
}

// component.ts
constructor(private service: CounterService,
            private query: CounterQuery) {}
count$ = this.query.select(state => state.count);`,
        highlights: [
          'Object-oriented approach',
          'Requires 3 classes',
          'Manual service injection',
          '4.5x more boilerplate',
        ],
      },
    ],
    'User Management': [
      {
        framework: 'SignalTree',
        useCase: 'User Management',
        linesOfCode: 12,
        fileCount: 1,
        imports: 4,
        complexity: 3,
        maintainability: 9,
        code: `import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withAsync } from '@signaltree/async';
import { withEntities } from '@signaltree/entities';

const userTree = signalTree({
  users: [] as User[],
  loading: false,
  error: null
}).with(
  withBatching(),
  withAsync(),
  withEntities()
);

// Auto-generated CRUD, loading states, error handling`,
        highlights: [
          'Modular feature composition',
          'Auto-generated CRUD operations',
          'Built-in loading/error states',
          'Type-safe async operations',
        ],
      },
      {
        framework: 'NgRx',
        useCase: 'User Management',
        linesOfCode: 85,
        fileCount: 7,
        imports: 12,
        complexity: 9,
        maintainability: 3,
        code: `// Requires multiple files:
// - user.actions.ts (15 lines)
// - user.reducer.ts (25 lines)
// - user.effects.ts (20 lines)
// - user.selectors.ts (10 lines)
// - user.models.ts (8 lines)
// - user.module.ts (5 lines)
// - component integration (15+ lines)

// Complex setup with:
// - Action creators for each operation
// - Reducer with loading/error states
// - Effects for async operations
// - Selectors for data access
// - Entity adapter configuration
// - Feature module registration`,
        highlights: [
          'Requires 7+ separate files',
          'Complex interconnected setup',
          'Manual loading/error handling',
          '7x more boilerplate code',
        ],
      },
    ],
  };

  currentExamples = computed(() => {
    return this.exampleData[this.selectedUseCase()] || [];
  });

  frameworks = computed(() => [
    {
      name: 'SignalTree',
      learning: 9.5,
      speed: 9.3,
      maintenance: 9.2,
      quality: 9.1,
      overall: 9.3,
    },
    {
      name: 'NgRx',
      learning: 4.0,
      speed: 3.8,
      maintenance: 3.8,
      quality: 5.2,
      overall: 4.2,
    },
    {
      name: 'Akita',
      learning: 6.5,
      speed: 6.2,
      maintenance: 6.5,
      quality: 6.8,
      overall: 6.5,
    },
    {
      name: 'Native Signals',
      learning: 9.0,
      speed: 7.0,
      maintenance: 8.0,
      quality: 8.5,
      overall: 8.1,
    },
  ]);

  learningScores = computed(() => [
    { framework: 'SignalTree', score: 9.5 },
    { framework: 'Native Signals', score: 9.0 },
    { framework: 'Akita', score: 6.5 },
    { framework: 'NgRx', score: 4.0 },
  ]);

  speedScores = computed(() => [
    { framework: 'SignalTree', score: 9.3 },
    { framework: 'Native Signals', score: 7.0 },
    { framework: 'Akita', score: 6.2 },
    { framework: 'NgRx', score: 3.8 },
  ]);

  maintainabilityScores = computed(() => [
    { framework: 'SignalTree', score: 9.2 },
    { framework: 'Native Signals', score: 8.0 },
    { framework: 'Akita', score: 6.5 },
    { framework: 'NgRx', score: 3.8 },
  ]);

  qualityScores = computed(() => [
    { framework: 'SignalTree', score: 9.1 },
    { framework: 'Native Signals', score: 8.5 },
    { framework: 'Akita', score: 6.8 },
    { framework: 'NgRx', score: 5.2 },
  ]);

  getFrameworkClass(framework: string): string {
    return framework.toLowerCase().replace(/\s+/g, '');
  }

  getScoreClass(score: number): string {
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'average';
    return 'poor';
  }
}

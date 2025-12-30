import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  OnDestroy,
  signal,
} from '@angular/core';
import { signalTree } from '@signaltree/core';
import {
  GuardrailIssue,
  GuardrailRule,
  GuardrailsAPI,
  GuardrailsConfig,
  GuardrailsReport,
  HotPath,
  rules,
  withGuardrails,
} from '@signaltree/guardrails';

import type { ISignalTree, SignalTree } from '@signaltree/core';
interface GuardrailsDemoState extends Record<string, unknown> {
  performance: {
    totalUpdates: number;
    hotPathCounter: number;
    lastDuration: number;
    history: number[];
  };
  forms: {
    signup: {
      email: string;
      authToken?: string;
    };
  };
  events: DemoEvent[];
}

interface DemoEvent {
  id: number;
  description: string;
  level: 'info' | 'warning' | 'error';
  timestamp: number;
}

type GuardrailsEnabledTree<T extends Record<string, unknown>> =
  SignalTree<T> & {
    __guardrails?: GuardrailsAPI;
  };

interface BudgetEntry {
  key: keyof GuardrailsReport['budgets'];
  label: string;
  status: GuardrailIssue['severity'] | 'ok';
  usage: number;
  current: number;
  limit: number;
}

@Component({
  selector: 'app-guardrails-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guardrails-monitoring.component.html',
  styleUrls: ['./guardrails-monitoring.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuardrailsMonitoringComponent implements OnDestroy {
  private readonly config: GuardrailsConfig<GuardrailsDemoState> = {
    treeId: 'demo-guardrails',
    mode: 'warn',
    budgets: {
      maxUpdateTime: 6,
      maxRecomputations: 20,
    },
    hotPaths: {
      enabled: true,
      threshold: 3,
      topN: 3,
      windowMs: 1000,
    },
    memoryLeaks: {
      enabled: false,
    },
    customRules: [
      rules.noDeepNesting(5) as unknown as GuardrailRule<any>,
      rules.noSensitiveData() as unknown as GuardrailRule<any>,
    ],
    reporting: {
      console: false,
      interval: 3000,
    },
    suppression: {
      autoSuppress: ['hydrate', 'bulk'],
    },
  };

  private readonly initialState: GuardrailsDemoState = {
    performance: {
      totalUpdates: 0,
      hotPathCounter: 0,
      lastDuration: 0,
      history: [],
    },
    forms: {
      signup: {
        email: 'jane.doe@example.com',
      },
    },
    events: [],
  };

  private readonly tree = signalTree<GuardrailsDemoState>(
    this.initialState
  ).with(
    withGuardrails(this.config)
  ) as GuardrailsEnabledTree<GuardrailsDemoState>;

  private readonly guardrails = this.tree.__guardrails;

  private readonly refreshTimerId: ReturnType<typeof setInterval> | undefined;
  private pendingRefresh: ReturnType<typeof setTimeout> | undefined;
  private nextEventId = 1;

  readonly report = signal<GuardrailsReport | null>(
    this.guardrails?.getReport() ?? null
  );
  readonly issues = computed(() => this.report()?.issues ?? []);
  readonly hotPaths = computed(() => this.report()?.hotPaths ?? []);
  readonly stats = computed(() => this.report()?.stats);
  readonly budgets = computed(() => this.report()?.budgets ?? null);
  readonly guardrailsAvailable = computed(() => Boolean(this.guardrails));
  readonly scenarioLog = signal<string[]>([]);

  constructor() {
    if (this.guardrails) {
      this.refreshTimerId = setInterval(
        () => this.refreshReport(),
        this.config.reporting?.interval ?? 3000
      );
      this.refreshReport();
    } else {
      this.refreshTimerId = undefined;
      this.recordScenario('Guardrails enhancer runs only in dev builds.');
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId);
    }

    if (this.pendingRefresh) {
      clearTimeout(this.pendingRefresh);
    }

    this.guardrails?.dispose();
  }

  runHealthyScenario(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    const latency = Number((Math.random() * 2 + 1).toFixed(2));
    this.tree((state) => ({
      ...state,
      performance: {
        totalUpdates: state.performance.totalUpdates + 1,
        hotPathCounter: state.performance.hotPathCounter,
        lastDuration: latency,
        history: [...state.performance.history.slice(-9), latency],
      },
      events: this.appendEvent(
        state.events,
        `Baseline update captured (${latency.toFixed(2)}ms)`,
        'info'
      ),
    }));

    this.recordScenario('Captured baseline update for reference.');
    this.scheduleRefresh();
  }

  triggerHotPath(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    for (let i = 0; i < 6; i++) {
      this.tree((state) => ({
        ...state,
        performance: {
          totalUpdates: state.performance.totalUpdates + 1,
          hotPathCounter: state.performance.hotPathCounter + 1,
          lastDuration: 1,
          history: [...state.performance.history.slice(-9), 1],
        },
        events: this.appendEvent(
          state.events,
          `Hot path tick ${state.performance.hotPathCounter + 1}`,
          'warning'
        ),
      }));
    }

    this.recordScenario('Triggered hot path by firing repeated updates.');
    this.scheduleRefresh();
  }

  triggerBudgetBreach(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    const heavyTargetMs = 12;
    const start = performance.now();
    while (performance.now() - start < heavyTargetMs) {
      // Busy loop to simulate an expensive update
    }
    const duration = Number((performance.now() - start).toFixed(2));

    this.tree((state) => ({
      ...state,
      performance: {
        totalUpdates: state.performance.totalUpdates + 1,
        hotPathCounter: state.performance.hotPathCounter,
        lastDuration: duration,
        history: [...state.performance.history.slice(-9), duration],
      },
      events: this.appendEvent(
        state.events,
        `Budget stress test (${duration.toFixed(2)}ms)`,
        'warning'
      ),
    }));

    this.recordScenario(
      'Simulated a heavy update to exceed budget thresholds.'
    );
    this.scheduleRefresh();
  }

  triggerRuleViolation(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    this.tree((state) => ({
      ...state,
      forms: {
        signup: {
          ...state.forms.signup,
          authToken: `token-${Math.random().toString(36).slice(2)}`,
        },
      },
      events: this.appendEvent(
        state.events,
        'Injected sensitive token to demonstrate rule enforcement.',
        'error'
      ),
    }));

    this.recordScenario('Triggered custom rule violation (noSensitiveData).');
    this.scheduleRefresh();
  }

  runSuppressedScenario(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    this.guardrails.suppress(() => {
      this.tree((state) => ({
        ...state,
        forms: {
          signup: {
            ...state.forms.signup,
            email: `bulk-${Date.now()}@example.com`,
          },
        },
        events: this.appendEvent(
          state.events,
          'Bulk hydrate executed with guardrails suppressed.',
          'info'
        ),
      }));
    });

    this.recordScenario('Ran hydrate workflow with guardrails suppressed.');
    this.scheduleRefresh();
  }

  resetDemo(): void {
    if (!this.guardrails) {
      this.recordScenario('Guardrails API unavailable in production builds.');
      return;
    }

    this.tree(() => ({
      performance: {
        totalUpdates: 0,
        hotPathCounter: 0,
        lastDuration: 0,
        history: [],
      },
      forms: {
        signup: {
          email: this.initialState.forms.signup.email,
        },
      },
      events: [],
    }));
    this.nextEventId = 1;
    this.scenarioLog.set([]);
    this.recordScenario('Reset demo state and cleared events.');
    this.scheduleRefresh();
  }

  reportTimestamp(): string | null {
    const ts = this.report()?.timestamp;
    return ts ? new Date(ts).toLocaleTimeString() : null;
  }

  budgetEntries(): BudgetEntry[] {
    const budgets = this.budgets();
    if (!budgets) {
      return [];
    }

    return [
      {
        key: 'updateTime',
        label: 'Update Time',
        status: this.statusFromBudget(budgets.updateTime.status),
        usage: budgets.updateTime.usage,
        current: budgets.updateTime.current,
        limit: budgets.updateTime.limit,
      },
      {
        key: 'recomputations',
        label: 'Recomputations',
        status: this.statusFromBudget(budgets.recomputations.status),
        usage: budgets.recomputations.usage,
        current: budgets.recomputations.current,
        limit: budgets.recomputations.limit,
      },
      {
        key: 'memory',
        label: 'Memory',
        status: this.statusFromBudget(budgets.memory.status),
        usage: budgets.memory.usage,
        current: budgets.memory.current,
        limit: budgets.memory.limit,
      },
    ];
  }

  issueSeverityClass(issue: GuardrailIssue): string {
    return `issue-${issue.severity}`;
  }

  formatHotPathLabel(hotPath: HotPath): string {
    return `${hotPath.path} · ${hotPath.updatesPerSecond.toFixed(1)} updates/s`;
  }

  private refreshReport(): void {
    if (!this.guardrails) {
      return;
    }
    this.report.set(this.guardrails.getReport());
  }

  private scheduleRefresh(): void {
    if (!this.guardrails) {
      return;
    }
    if (this.pendingRefresh) {
      clearTimeout(this.pendingRefresh);
    }
    this.pendingRefresh = setTimeout(() => {
      this.refreshReport();
      this.pendingRefresh = undefined;
    }, 120);
  }

  private appendEvent(
    events: DemoEvent[],
    description: string,
    level: DemoEvent['level']
  ): DemoEvent[] {
    const nextEvent: DemoEvent = {
      id: this.nextEventId++,
      description,
      level,
      timestamp: Date.now(),
    };
    return [...events.slice(-5), nextEvent];
  }

  private recordScenario(message: string): void {
    this.scenarioLog.update((log) => [message, ...log].slice(0, 6));
  }

  private statusFromBudget(
    status: 'ok' | 'warning' | 'exceeded'
  ): BudgetEntry['status'] {
    if (status === 'ok') {
      return 'ok';
    }
    return status === 'exceeded' ? 'error' : 'warning';
  }

  trackBudget(_index: number, entry: BudgetEntry): string {
    return entry.key;
  }

  trackIssue(_index: number, issue: GuardrailIssue): string {
    return `${issue.type}:${issue.path ?? 'root'}:${issue.message}`;
  }

  trackHotPath(_index: number, hotPath: HotPath): string {
    return hotPath.path;
  }

  trackScenario(_index: number, entry: string): string {
    return entry;
  }
}

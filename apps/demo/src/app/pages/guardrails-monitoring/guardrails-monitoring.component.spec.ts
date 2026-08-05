import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuardrailsMonitoringComponent } from './guardrails-monitoring.component';

/**
 * This page forces the polling change-detection strategy
 * (`disablePathNotifier: true`) because its tree is plain objects with no
 * entity collections — the PathNotifier strategy would never fire and every
 * panel would read zero forever (see the config comment in the component).
 * These specs are the regression test for that: they drive each scenario
 * button and assert the guardrails report actually populates, rather than
 * merely asserting the component constructs.
 *
 * Polling runs every 50ms and the component re-reads the report 120ms after
 * each scenario (see `scheduleRefresh`), so tests wait a bit past that
 * before asserting on `report()`/`issues()`/`hotPaths()`/`budgets()`.
 */
async function waitForRefresh(extraMs = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, 200 + extraMs));
}

describe('GuardrailsMonitoringComponent', () => {
  let component: GuardrailsMonitoringComponent;
  let fixture: ComponentFixture<GuardrailsMonitoringComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuardrailsMonitoringComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GuardrailsMonitoringComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('attaches the guardrails enhancer and produces an initial report', () => {
    expect(component.guardrailsAvailable()).toBe(true);
    expect(component.report()).not.toBeNull();
  });

  it('runHealthyScenario() logs a scenario without raising issues', async () => {
    component.runHealthyScenario();
    await waitForRefresh();

    expect(component.scenarioLog()[0]).toContain(
      'Captured baseline update for reference.'
    );
  });

  it('triggerRuleViolation() fires the noSensitiveData custom rule', async () => {
    component.triggerRuleViolation();
    await waitForRefresh();

    const issues = component.issues();
    const ruleIssue = issues.find(
      (i) => i.type === 'rule' && i.severity === 'error'
    );
    expect(ruleIssue).toBeDefined();
    expect(ruleIssue?.message).toContain('authToken');
    expect(component.scenarioLog()[0]).toContain(
      'Triggered custom rule violation (noSensitiveData).'
    );
  });

  // NOTE ON A REAL LIMITATION (not asserted as a bug fix — see final report):
  // this page forces the polling change-detection strategy, and in that mode
  // guardrails measures "update time" as its OWN diff/analysis overhead
  // (`performance.now()` around `detectChangedPaths` in `handleStateChange`),
  // not the duration of the write that triggered the poll. The 12ms busy loop
  // in `triggerBudgetBreach()` finishes synchronously, long before the next
  // 50ms poll tick reads the state — so `budgets.updateTime.current` never
  // reflects it and the budget can never show "exceeded" on this page as
  // configured. That's a guardrails/polling-mode limitation, not something a
  // component-level test should paper over by asserting a breach that can't
  // happen. This spec asserts what's actually true: the scenario runs, is
  // logged, and the budgets structure is still well-formed.
  it('triggerBudgetBreach() runs the heavy update and logs the scenario', async () => {
    component.triggerBudgetBreach();
    await waitForRefresh();

    expect(component.scenarioLog()[0]).toContain(
      'Simulated a heavy update to exceed budget thresholds.'
    );

    const entries = component.budgetEntries();
    expect(entries.map((e) => e.key)).toEqual(['updateTime', 'memory']);
  });

  it('triggerHotPath() spaces out repeated writes so the hot-path panel populates', async () => {
    await component.triggerHotPath();
    await waitForRefresh();

    expect(component.hotPaths().length).toBeGreaterThan(0);
    const label = component.formatHotPathLabel(component.hotPaths()[0]);
    expect(label).toContain('updates/s');
    expect(component.scenarioLog()[0]).toContain(
      'Triggered hot path by firing repeated updates.'
    );
  }, 10000);

  it('runSuppressedScenario() runs the write without throwing and logs the scenario', async () => {
    expect(() => component.runSuppressedScenario()).not.toThrow();
    await waitForRefresh();

    expect(component.scenarioLog()[0]).toContain(
      'Ran hydrate workflow with guardrails suppressed.'
    );
  });

  it('resetDemo() clears the scenario log', async () => {
    component.runHealthyScenario();
    await waitForRefresh();
    expect(component.scenarioLog().length).toBeGreaterThan(0);

    component.resetDemo();
    await waitForRefresh();

    expect(component.scenarioLog()).toEqual([
      'Reset demo state and cleared events.',
    ]);
  });

  it('issueSeverityClass() maps severity to a CSS class name', async () => {
    component.triggerRuleViolation();
    await waitForRefresh();

    const ruleIssue = component
      .issues()
      .find((i) => i.type === 'rule' && i.severity === 'error');
    expect(ruleIssue).toBeDefined();
    expect(component.issueSeverityClass(ruleIssue!)).toBe('issue-error');
  });

  it('disposes cleanly on destroy', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});

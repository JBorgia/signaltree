import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BenchmarkComponent } from './benchmark.component';

/**
 * This page publishes the AI-codegen accuracy scorecard — a marketing claim
 * backed by measured numbers. These tests recompute every displayed number
 * from the component's own data arrays so a future data edit that breaks
 * internal consistency (e.g. someone tweaks `cold` without updating `delta`)
 * fails loudly instead of silently drifting from what the page claims.
 */
describe('BenchmarkComponent', () => {
  let component: BenchmarkComponent;
  let fixture: ComponentFixture<BenchmarkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BenchmarkComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BenchmarkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('every per-library row: delta === best(primed, fullPrimed) - cold — the "Δ best vs cold" column', () => {
    // Confirm the template really labels the column this way before trusting
    // the math below to mean what the test name says it means.
    expect(fixture.nativeElement.textContent).toContain('Δ best vs cold');

    for (const row of component.perLibraryScores) {
      const best = Math.max(row.primed, row.fullPrimed);
      expect(row.delta).toBe(best - row.cold);
    }
  });

  it('every per-agent row: delta === primed - cold — the "Δ lift" column (cold → primed-with-llms.txt)', () => {
    expect(fixture.nativeElement.textContent).toContain('Δ lift');

    for (const row of component.perAgentScores) {
      expect(row.delta).toBe(row.primed - row.cold);
    }
  });

  it('cell-count equation multiplies out to the published 720, tied to the actual data arrays', () => {
    const agents = component.perAgentScores.length;
    const libraries = component.perLibraryScores.length;
    const prompts = 8; // not derivable from component data — asserted against the template below
    const primingModes = 3;

    expect(agents).toBe(6);
    expect(libraries).toBe(5);
    expect(agents * prompts * libraries * primingModes).toBe(720);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('720');
    expect(text).toContain(`${agents}`);
    expect(text).toContain(`${prompts}`);
    expect(text).toContain(`${libraries}`);
    expect(text).toContain(`${primingModes}`);
  });

  it('headline lift (98% - 49% = +49pp) is internally consistent, and matches the signaltree fullPrimed score', () => {
    const text = fixture.nativeElement.textContent as string;
    const strongNumbers = Array.from(
      (fixture.nativeElement.querySelector('.headline') as HTMLElement)
        .querySelectorAll('strong')
    ).map((el) => (el.textContent ?? '').trim());

    // First two <strong> figures in the headline are cold% then primed%.
    const cold = parseInt(strongNumbers[0], 10);
    const primed = parseInt(strongNumbers[1], 10);
    expect(primed - cold).toBe(49);
    expect(text).toContain('+49 percentage points');

    // The 98% headline figure is the signaltree row's fullPrimed score —
    // the "best" number the page is allowed to lead with.
    const signaltreeRow = component.perLibraryScores.find(
      (r) => r.lib === 'signaltree'
    );
    expect(signaltreeRow?.fullPrimed).toBe(primed);
  });

  it('"4 of 6 agents hit 100/100 primed" matches the count of fullPrimed===100 rows', () => {
    const atCeiling = component.perAgentScores.filter(
      (r) => r.fullPrimed === 100
    ).length;
    expect(atCeiling).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('4 of 6');
  });

  it('the residual-failure count matches the signaltree ceiling gap (100 - fullPrimed)', () => {
    const signaltreeRow = component.perLibraryScores.find(
      (r) => r.lib === 'signaltree'
    );
    const gap = 100 - (signaltreeRow?.fullPrimed ?? 0);
    const totalResidual = component.residualFailures.reduce(
      (sum, r) => sum + r.count,
      0
    );
    expect(totalResidual).toBe(gap);
  });

  it('renders one table row per library and per agent (no silent drop from the array)', () => {
    const rows = fixture.nativeElement.querySelectorAll(
      'table tbody tr'
    ) as NodeListOf<HTMLElement>;
    // Two tables: per-library (5 rows) + per-agent (6 rows). The residuals
    // table is a third but has its own row count (1).
    const totalDataRows =
      component.perLibraryScores.length +
      component.perAgentScores.length +
      component.residualFailures.length;
    expect(rows.length).toBe(totalDataRows);
  });
});

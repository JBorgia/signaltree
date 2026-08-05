import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BenchmarkComponent } from '../benchmark/benchmark.component';
import { BuiltForAIComponent } from './built-for-ai.component';

/**
 * built-for-ai's "AI-codegen accuracy benchmark" card repeats, in hand-written
 * copy, several headline numbers that are ALSO computed/rendered on the
 * /benchmark page from BenchmarkComponent's data arrays. Because this page's
 * copy is static HTML text rather than bound to that data, the two can drift
 * independently — someone re-runs the benchmark, updates BenchmarkComponent,
 * and forgets this page (or vice versa). These tests recompute each figure
 * from BenchmarkComponent's own arrays and cross-check it against what this
 * page's rendered text says, so that drift fails a test instead of shipping.
 */
describe('BuiltForAIComponent', () => {
  let component: BuiltForAIComponent;
  let fixture: ComponentFixture<BuiltForAIComponent>;
  let benchmarkComponent: BenchmarkComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BuiltForAIComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BuiltForAIComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Not rendered — only used as the source of truth for the benchmark
    // numbers this page's copy repeats by hand.
    benchmarkComponent = TestBed.createComponent(BenchmarkComponent).componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('"4 of 6 agents ... at ceiling" matches the count of fullPrimed===100 rows on the benchmark page', () => {
    const atCeiling = benchmarkComponent.perAgentScores.filter(
      (r) => r.fullPrimed === 100
    ).length;
    expect(atCeiling).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('4 of 6 agents primed');
  });

  it('"720 cells" equation multiplies out and its factors match the benchmark page\'s data-array lengths', () => {
    const agents = benchmarkComponent.perAgentScores.length;
    const libraries = benchmarkComponent.perLibraryScores.length;
    const prompts = 8;
    const primingModes = 3;
    expect(agents * prompts * libraries * primingModes).toBe(720);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(
      `${agents} agents × ${prompts} prompts × ${libraries} libraries × ${primingModes} priming modes`
    );
    expect(text).toContain('720 cells');
  });

  it('the "98% primed" figure matches the signaltree fullPrimed score on the benchmark page', () => {
    const signaltreeRow = benchmarkComponent.perLibraryScores.find(
      (r) => r.lib === 'signaltree'
    );
    expect(signaltreeRow?.fullPrimed).toBe(98);
    expect(fixture.nativeElement.textContent).toContain('98%');
  });

  it('49% -> 98% headline arithmetic is internally consistent (+49 percentage points)', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('49%');
    expect(text).toContain('98%');
    expect(text).toContain('+49 percentage points');
    expect(98 - 49).toBe(49);
  });

  it('"Haiku 4.5 (97/100) outscores cold Sonnet 4.6 (44/100) by 2.2x" is the benchmark page\'s own numbers, correctly rounded', () => {
    const haiku = benchmarkComponent.perAgentScores.find(
      (r) => r.agent === 'Claude Haiku 4.5'
    );
    const sonnet = benchmarkComponent.perAgentScores.find(
      (r) => r.agent === 'Claude Sonnet 4.6'
    );
    expect(haiku?.fullPrimed).toBe(97);
    expect(sonnet?.cold).toBe(44);

    const ratio = Math.round(((haiku?.fullPrimed ?? 0) / (sonnet?.cold ?? 1)) * 10) / 10;
    expect(ratio).toBe(2.2);
    expect(fixture.nativeElement.textContent).toContain('2.2×');
  });

  it('skillInstall code sample references the actual npm skill path used elsewhere (skills/using-signaltree)', () => {
    expect(component.skillInstall).toHaveLength(1);
    expect(component.skillInstall[0].source).toContain(
      'node_modules/@signaltree/core/skills/using-signaltree'
    );
  });
});

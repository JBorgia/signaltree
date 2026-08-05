import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArchitectureOverviewComponent } from './architecture-overview.component';

/**
 * This page is static marketing/reference copy — no signals, no methods, no
 * routerLinks (verified by inspection of architecture-overview.component.html).
 * Kept deliberately thin per review guidance: a render check plus one
 * consistency assertion tying the two places the same headline number
 * ("~76% less app code") is quoted (the savingsMetrics data array and the
 * hero prose), so the two can't silently drift apart.
 */
describe('ArchitectureOverviewComponent', () => {
  let component: ArchitectureOverviewComponent;
  let fixture: ComponentFixture<ArchitectureOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArchitectureOverviewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ArchitectureOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates and renders the hero heading', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      'SignalTree: Reactive JSON'
    );
  });

  it('renders one comparison row per entry in comparisons, and one savings card per entry in savingsMetrics', () => {
    const rows = fixture.nativeElement.querySelectorAll('.comparison-row');
    expect(rows.length).toBe(component.comparisons.length);

    const cards = fixture.nativeElement.querySelectorAll('.savings-card');
    expect(cards.length).toBe(component.savingsMetrics.length);
  });

  it('the "76% less app code" figure is the same in the savingsMetrics data and the hero prose', () => {
    const codeReduction = component.savingsMetrics.find(
      (m) => m.label === 'App Code Reduction'
    );
    expect(codeReduction?.value).toBe('76%');

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('76% fewer lines of state code');
    expect(text).toContain('~76% less app code');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StartHereComponent } from './start-here.component';

describe('StartHereComponent', () => {
  let component: StartHereComponent;
  let fixture: ComponentFixture<StartHereComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StartHereComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StartHereComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders one next-step card per entry in nextSteps, in order', () => {
    const cards = fixture.nativeElement.querySelectorAll('.next-step-card');
    expect(cards.length).toBe(component.nextSteps.length);

    cards.forEach((card: HTMLElement, i: number) => {
      expect(card.textContent).toContain(component.nextSteps[i].title);
      expect(card.textContent).toContain(component.nextSteps[i].audience);
    });
  });

  it('every next-step card CTA label matches its data entry (route validity covered by route-links.spec.ts)', () => {
    const ctas = fixture.nativeElement.querySelectorAll('.next-step-cta');
    expect(ctas.length).toBe(component.nextSteps.length);
    ctas.forEach((cta: HTMLElement, i: number) => {
      expect(cta.textContent?.trim()).toBe(component.nextSteps[i].cta);
    });
  });

  it('NgRx vs SignalTree comparison panes both render their code samples', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('createReducer');
    expect(text).toContain('counterTree.$.count.update');
  });
});

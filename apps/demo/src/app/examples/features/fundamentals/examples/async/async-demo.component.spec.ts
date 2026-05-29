import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';

import { AsyncDemoComponent } from './async-demo.component';

describe('AsyncDemoComponent (fundamentals tour pointer)', () => {
  let fixture: ComponentFixture<AsyncDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsyncDemoComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AsyncDemoComponent);
    fixture.detectChanges();
  });

  it('renders the fundamentals-tour pointer card without errors', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Async Operations');
    expect(host.textContent).toContain('asyncSource');
    expect(host.textContent).toContain('asyncQuery');
  });

  it('includes a routerLink pointing at the canonical /async demo page', () => {
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'a[routerLink="/async"]'
    );
    expect(links.length).toBeGreaterThan(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AppComponent } from './app';
import { NavigationComponent } from './components/navigation/navigation.component';

// Simple home component for testing routing
@Component({
  selector: 'app-test-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div>Test Home</div>',
})
class TestHomeComponent {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        NavigationComponent,
        RouterModule.forRoot([
          { path: '', component: TestHomeComponent },
          { path: '**', redirectTo: '' },
        ]),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navigation', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navigation')).toBeTruthy();
  });

  it('should have router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('labels v14 as historical and links to the current v15 site', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector(
      '.legacy-banner'
    ) as HTMLElement | null;
    const currentLink = banner?.querySelector('a');

    expect(banner?.textContent).toContain('SignalTree v14 archive');
    expect(banner?.textContent).toContain('ground-up causal rewrite');
    expect(currentLink?.getAttribute('href')).toBe('/');
  });
});

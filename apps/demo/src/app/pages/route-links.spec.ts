import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, RouterLink } from '@angular/router';

import { appRoutes } from '../app.routes';
import { BenchmarkComponent } from './benchmark/benchmark.component';
import { DocumentationComponent } from './documentation/documentation.component';
import { StartHereComponent } from './start-here/start-here.component';

/**
 * Shared dead-link guard for the content-heavy demo pages.
 *
 * These pages carry many <a [routerLink]> targets pointing at other demo
 * routes. A typo or a route rename elsewhere silently 404s a link with no
 * compile-time signal — Angular's RouterLink directive doesn't validate its
 * target against the route config. This spec renders each page, walks every
 * RouterLink directive instance, and asserts the resolved href matches a
 * path that actually exists in app.routes.ts.
 *
 * One shared spec instead of duplicating the same loop in every page spec —
 * architecture-overview carries no routerLinks at all
 * (verified by inspection) so they're not listed here. realistic-benchmark-history
 * has exactly one routerLink but it only renders in the zero-results empty
 * state, so that one is asserted inline in its own spec instead.
 */

const validRoutePaths = new Set(
  appRoutes
    .filter(
      (route): route is typeof route & { path: string } =>
        typeof route.path === 'string' && route.path !== '**'
    )
    .map((route) => '/' + route.path)
);

function routerLinkTargets(fixture: ComponentFixture<unknown>): string[] {
  return fixture.debugElement
    .queryAll(By.directive(RouterLink))
    .map((de: DebugElement) => de.injector.get(RouterLink).href)
    .filter((href): href is string => !!href);
}

describe('demo content pages: every routerLink resolves to a real route', () => {
  it('start-here', async () => {
    await TestBed.configureTestingModule({
      imports: [StartHereComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(StartHereComponent);
    fixture.detectChanges();

    const targets = routerLinkTargets(fixture);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(validRoutePaths.has(target)).toBe(true);
    }
  });

  // 'benchmark' had exactly one routerLink — to /built-for-ai, deleted in 15.0
  // with the AI-discoverability artifacts. The page now has no internal links,
  // so this case would trip the non-vacuity guard rather than test anything.
  // RESTORE IT when the greenfielded discoverability surface gives the page an
  // internal destination again.


  it('documentation', async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentationComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentationComponent);
    fixture.detectChanges();

    const targets = routerLinkTargets(fixture);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(validRoutePaths.has(target)).toBe(true);
    }
  });
});

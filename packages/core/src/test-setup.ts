// Vitest global setup for @signaltree/core.
//
// Initializes the Angular TestBed environment so specs that use
// `TestBed.runInInjectionContext()` / `inject(DestroyRef)` (e.g. the
// asyncSource / asyncQuery marker specs) have a platform to run against.
// Without this, those specs fail with "Cannot read properties of null
// (reading 'ngModule')". Wired via `setupFiles` in vitest.config.ts.
import '@angular/compiler';
import 'zone.js';
import 'zone.js/testing';

import { getTestBed } from '@angular/core/testing';
// BrowserDynamicTestingModule / platformBrowserDynamicTesting are deprecated
// but still functional in Angular 20 — the simplest cross-spec TestBed setup.
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  }
);

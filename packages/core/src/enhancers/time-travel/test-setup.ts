import '@angular/compiler';
import 'zone.js';
import 'zone.js/testing';

import { getTestBed } from '@angular/core/testing';
// Note: BrowserDynamicTestingModule and platformBrowserDynamicTesting are deprecated
// but still functional in Angular 20. They are the simplest way to set up tests.
// Future migration to standalone APIs may be needed.
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

// Initialize the Angular testing environment
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  }
);

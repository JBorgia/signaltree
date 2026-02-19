import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';
import { DEMO_LIBRARY_VERSIONS } from './app/library-versions';

// Inject library versions into window for benchmark tracking
// These versions are read from package.json files at build time
if (typeof window !== 'undefined') {
  (
    window as unknown as { __LIBRARY_VERSIONS__?: Record<string, string> }
  ).__LIBRARY_VERSIONS__ = DEMO_LIBRARY_VERSIONS;
}

// Suppress noisy extension-origin errors in development (chrome-extension://)
if (typeof window !== 'undefined' && isDevMode()) {
  const isExtensionUrl = (url: unknown) =>
    typeof url === 'string' && url.startsWith('chrome-extension://');

  window.addEventListener('error', (event) => {
    try {
      const src = (event as ErrorEvent)?.filename;
      if (isExtensionUrl(src)) {
        // Prevent logging extension script errors that we don't control
        event.preventDefault();
      }
    } catch {
      // no-op
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason: unknown = (event as PromiseRejectionEvent).reason;
      const text =
        typeof reason === 'string'
          ? reason
          : typeof reason === 'object' && reason !== null && 'stack' in reason
          ? String((reason as { stack?: unknown }).stack ?? reason)
          : String(reason);
      if (text.includes('chrome-extension://')) {
        event.preventDefault();
      }
    } catch {
      // no-op
    }
  });
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  // Log error in development but don't crash the app
  console.error('Application bootstrap failed:', err);
});

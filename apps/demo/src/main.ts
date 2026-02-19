import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';
import { SIGNALTREE_CORE_VERSION } from './app/version';

// Inject library versions into window for benchmark tracking
// These versions are read from package.json files at build time
if (typeof window !== 'undefined') {
  (
    window as unknown as { __LIBRARY_VERSIONS__?: Record<string, string> }
  ).__LIBRARY_VERSIONS__ = {
    signaltree: SIGNALTREE_CORE_VERSION, // @signaltree/core
    'ngrx-store': '20.1.0', // @ngrx/store
    'ngrx-signals': '20.1.0', // @ngrx/signals
    akita: '8.0.1', // @datorama/akita
    elf: '2.5.1', // @ngneat/elf
    ngxs: '20.1.0', // @ngxs/store
  };
}

// Suppress noisy extension-origin errors in development (chrome-extension://)
if (typeof window !== 'undefined') {
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

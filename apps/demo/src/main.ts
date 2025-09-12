import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';

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

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);

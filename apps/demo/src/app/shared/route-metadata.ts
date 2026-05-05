import { provideEnvironmentInitializer, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
} from '@angular/router';
import { filter } from 'rxjs/operators';

const DEFAULT_TITLE = 'SignalTree: Reactive JSON for Angular';
const TITLE_SUFFIX = ' · SignalTree';

interface RouteMeta {
  title?: string;
  description?: string;
}

function walkToDeepest(snapshot: ActivatedRouteSnapshot): RouteMeta {
  let current = snapshot;
  while (current.firstChild) current = current.firstChild;
  return (current.data ?? {}) as RouteMeta;
}

/**
 * Updates document title and meta description on every NavigationEnd based on
 * the activated route's data: { title, description }. Routes without data fall
 * back to the index.html defaults.
 *
 * Usage: include `provideRouteMetadata()` in the app config providers array.
 */
export function provideRouteMetadata() {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    const titleService = inject(Title);
    const metaService = inject(Meta);

    router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const meta = walkToDeepest(router.routerState.root.snapshot);

        titleService.setTitle(
          meta.title ? `${meta.title}${TITLE_SUFFIX}` : DEFAULT_TITLE
        );

        if (meta.description) {
          metaService.updateTag({
            name: 'description',
            content: meta.description,
          });
          metaService.updateTag({
            property: 'og:description',
            content: meta.description,
          });
          metaService.updateTag({
            property: 'og:title',
            content: meta.title
              ? `${meta.title}${TITLE_SUFFIX}`
              : DEFAULT_TITLE,
          });
        }
      });
  });
}

import { forkJoin, map, Observable } from 'rxjs';

import { inject, Injectable } from '@angular/core';

import { PostOps, UiOps, UserOps } from './ops';
import { APP_TREE } from './tree';

/**
 * Application Store — the canonical SignalTree facade.
 *
 * One paradigm rule:
 *   - **Reads** go through `store.$.<domain>.<path>()`
 *   - **Writes / async** go through `store.ops.<domain>.<method>()`
 *
 * `AppStore` is intentionally thin: it composes the tree and the per-domain
 * ops services into a single injectable. Cross-domain orchestration lives here
 * (e.g. `loadDashboard$` below); single-domain logic stays in its ops file.
 */
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;

  /** Domain operations, addressed as `store.ops.<domain>.<method>()`. */
  readonly ops = {
    users: inject(UserOps),
    posts: inject(PostOps),
    ui: inject(UiOps),
  };

  // ── Cross-domain orchestration ─────────────────────────────────────────────

  /** Loads users and posts in parallel — example of a cross-domain workflow. */
  loadDashboard$(): Observable<void> {
    return forkJoin({
      users: this.ops.users.loadUsers$(),
      posts: this.ops.posts.loadPosts$(),
    }).pipe(map(() => void 0));
  }
}

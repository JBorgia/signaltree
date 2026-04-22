import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { ApiService } from '../api.service';
import { LoadingState, Nullable, Post } from '../types';
import { APP_TREE } from '../tree';

/**
 * Post domain operations.
 *
 * `publishPost$` shows the canonical async-with-business-rule pattern:
 *   - read entities from `$` for the rule check
 *   - hit the API
 *   - write the result back through entityMap
 */
@Injectable({ providedIn: 'root' })
export class PostOps {
  private readonly _api = inject(ApiService);
  private readonly _$ = inject(APP_TREE).$;

  // ── Mutations ──────────────────────────────────────────────────────────────

  setSelected(postId: Nullable<number>): void {
    this._$.posts.selectedId.set(postId);
  }

  upsert(post: Post): void {
    this._$.posts.entities.upsertOne(post);
  }

  removeMany(postIds: readonly number[]): void {
    for (const id of postIds) this._$.posts.entities.removeOne(id);
  }

  setSearch(term: string): void {
    this._$.posts.filters.search.set(term);
  }

  togglePublishedFilter(): void {
    const current = this._$.posts.filters.published();
    this._$.posts.filters.published.set(current === true ? null : true);
  }

  // ── Async ──────────────────────────────────────────────────────────────────

  loadPosts$(): Observable<void> {
    this._setLoading();
    return this._api.getPosts$().pipe(
      tap((posts) => this._$.posts.entities.setAll(posts)),
      tap(() => this._setLoaded()),
      map(() => void 0),
      catchError((err) => {
        this._setError(err);
        return of(void 0);
      })
    );
  }

  /**
   * Publishes a post if the author is an admin. Demonstrates a business rule
   * enforced inside ops (not in the component, not in the tree).
   */
  publishPost$(postId: number): Observable<void> {
    const post = this._$.posts.entities.byId(postId)?.();
    if (!post) return of(void 0);

    const author = this._$.users.entities.byId(post.authorId)?.();
    if (author?.role !== 'admin') {
      this._$.posts.loading.error.set('Only admins can publish posts');
      return of(void 0);
    }

    return this._api.publishPost$(postId).pipe(
      tap((updated) => this._$.posts.entities.upsertOne(updated)),
      map(() => void 0),
      catchError((err) => {
        this._$.posts.loading.error.set(
          err instanceof Error ? err.message : 'Publish failed'
        );
        return of(void 0);
      })
    );
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _setLoading(): void {
    this._$.posts.loading.state.set(LoadingState.Loading);
    this._$.posts.loading.error.set(null);
  }

  private _setLoaded(): void {
    this._$.posts.loading.state.set(LoadingState.Loaded);
  }

  private _setError(err: unknown): void {
    this._$.posts.loading.state.set(LoadingState.Error);
    this._$.posts.loading.error.set(
      err instanceof Error ? err.message : 'Failed to load posts'
    );
  }
}

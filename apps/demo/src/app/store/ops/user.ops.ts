import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { ApiService } from '../api.service';
import { LoadingState, Nullable, User } from '../types';
import { APP_TREE } from '../tree';

/**
 * User domain operations.
 *
 * Holds all mutations and async work for the `users` slice. State reads stay
 * on `store.$.users.*`; components call `store.ops.users.<method>()` for
 * anything that writes.
 */
@Injectable({ providedIn: 'root' })
export class UserOps {
  private readonly _api = inject(ApiService);
  private readonly _$ = inject(APP_TREE).$;

  // ── Mutations ──────────────────────────────────────────────────────────────

  setSelected(userId: Nullable<number>): void {
    this._$.users.selectedId.set(userId);
  }

  upsert(user: User): void {
    this._$.users.entities.upsertOne(user);
  }

  remove(userId: number): void {
    this._$.users.entities.removeOne(userId);
    if (this._$.users.selectedId() === userId) {
      this._$.users.selectedId.set(null);
    }
  }

  clear(): void {
    this._$.users.entities.clear();
    this._$.users.selectedId.set(null);
    this._$.users.loading.state.set(LoadingState.NotLoaded);
    this._$.users.loading.error.set(null);
  }

  // ── Async ──────────────────────────────────────────────────────────────────

  loadUsers$(): Observable<void> {
    this._setLoading();
    return this._api.getUsers$().pipe(
      tap((users) => this._$.users.entities.setAll(users)),
      tap(() => this._setLoaded()),
      map(() => void 0),
      catchError((err) => {
        this._setError(err);
        return of(void 0);
      })
    );
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _setLoading(): void {
    this._$.users.loading.state.set(LoadingState.Loading);
    this._$.users.loading.error.set(null);
  }

  private _setLoaded(): void {
    this._$.users.loading.state.set(LoadingState.Loaded);
  }

  private _setError(err: unknown): void {
    this._$.users.loading.state.set(LoadingState.Error);
    this._$.users.loading.error.set(
      err instanceof Error ? err.message : 'Failed to load users'
    );
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { entityMap, signalTree, status } from '@signaltree/core';
import { rxMethod } from '@signaltree/core/rxjs-interop';
import { of } from 'rxjs';
import {
  debounceTime,
  delay,
  distinctUntilChanged,
  filter,
  switchMap,
  tap,
} from 'rxjs/operators';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user' | 'guest';
}

@Component({
  selector: 'app-rxmethod-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './rxmethod-demo.component.html',
  styleUrl: './rxmethod-demo.component.scss',
})
export class RxMethodDemoComponent implements OnInit {
  readonly store = signalTree({
    users: entityMap<User, number>({ selectId: (u) => u.id }),
    loading: status(),
    search: {
      query: '',
      results: [] as User[],
    },
    counters: {
      loadInvocations: 0,
      searchInvocations: 0,
      apiHits: 0,
    },
  });

  private readonly _mockUsers: User[] = [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'user' },
    { id: 3, name: 'Carol', role: 'user' },
    { id: 4, name: 'Dave', role: 'guest' },
    { id: 5, name: 'Eve', role: 'admin' },
    { id: 6, name: 'Frank', role: 'user' },
  ];

  // Demo 1: void input — load lifecycle with simulated latency
  readonly loadUsers = rxMethod<void>((input$) =>
    input$.pipe(
      tap(() => {
        this.store.$.counters.loadInvocations.update((n) => n + 1);
        this.store.$.loading.setLoading();
      }),
      switchMap(() =>
        of(this._mockUsers).pipe(
          delay(800), // simulate API latency
          tap((users) => {
            this.store.$.users.setAll(users);
            this.store.$.loading.setLoaded();
            this.store.$.counters.apiHits.update((n) => n + 1);
          })
        )
      )
    )
  );

  // Demo 2: Signal input with debounce — fed directly from the search-query leaf
  readonly searchByQuery = rxMethod<string>((input$) =>
    input$.pipe(
      tap(() => this.store.$.counters.searchInvocations.update((n) => n + 1)),
      debounceTime(300),
      distinctUntilChanged(),
      filter((q) => q.length > 0),
      switchMap((q) =>
        of(
          this._mockUsers.filter((u) =>
            u.name.toLowerCase().includes(q.toLowerCase())
          )
        ).pipe(
          delay(200),
          tap((results) => {
            this.store.$.search.results.set(results);
            this.store.$.counters.apiHits.update((n) => n + 1);
          })
        )
      )
    )
  );

  ngOnInit(): void {
    // Wire the search-query leaf signal directly into rxMethod — every change
    // through any binding (template input, programmatic .set) flows through
    // the debounced search pipeline automatically.
    this.searchByQuery(this.store.$.search.query);
  }

  resetSearch(): void {
    this.store.$.search.query.set('');
    this.store.$.search.results.set([]);
  }
}

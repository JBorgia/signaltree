import {a as pt,i as iI,$ as $t,V as Vi,m as mC,g as gu,x as xI,p as ph,ax as gd,ay as hd,T as TI,w as wD,A as AI,F as Fh,E as Eu,S as SI,P as PI,j as Eh,k as md,l as $I,y as yd,M as Mh,f as fh,Q as dh,L as Lh}from'./main-6HSO2YK4.js';var F=(i,o)=>o.id;function R(i,o){if(i&1){let r=PI();Vi(0,"button",31),Eh("click",function(){let f=md(r).$implicit,h=$I();return yd(h.compareLib.set(f.id))}),mC(1),Vi(2,"span",32),mC(3),gu()();}if(i&2){let r=o.$implicit,c=$I();Mh("active",c.compareLib()===r.id),fh("title","Available in examples: "+r.available.join(", ")),dh("aria-checked",c.compareLib()===r.id),wD(),Eu(" ",r.label," "),wD(2),Fh(r.available.length);}}function U(i,o){i&1&&(Vi(0,"h3",33),mC(1,"Plain Angular signals"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// counter.service.ts
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CounterService {
  private _count = signal(0);

  count = this._count.asReadonly();
  doubled = computed(() => this._count() * 2);

  increment() {
    this._count.update((n) => n + 1);
  }
}

// counter.component.ts
import { Component, inject } from '@angular/core';
import { CounterService } from './counter.service';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: \`
    <p>Count: {{ svc.count() }}</p>
    <p>Doubled: {{ svc.doubled() }}</p>
    <button (click)="svc.increment()">+</button>
  \`,
})
export class CounterComponent {
  svc = inject(CounterService);
}`),gu(),hd(),gu());}function B(i,o){i&1&&(Vi(0,"h3",33),mC(1,"BehaviorSubject service"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// counter.service.ts
import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CounterService {
  private _count$ = new BehaviorSubject<number>(0);

  count$ = this._count$.asObservable();
  doubled$ = this._count$.pipe(map((n) => n * 2));

  count = toSignal(this.count$, { initialValue: 0 });
  doubled = toSignal(this.doubled$, { initialValue: 0 });

  increment() {
    this._count$.next(this._count$.value + 1);
  }
}

// counter.component.ts
import { Component, inject } from '@angular/core';
import { CounterService } from './counter.service';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: \`
    <p>Count: {{ svc.count() }}</p>
    <p>Doubled: {{ svc.doubled() }}</p>
    <button (click)="svc.increment()">+</button>
  \`,
})
export class CounterComponent {
  svc = inject(CounterService);
}`),gu(),hd(),gu());}function H(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals (signalStore)"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// counter.store.ts
import { computed } from '@angular/core';
import {
  patchState, signalStore, withComputed, withMethods, withState,
} from '@ngrx/signals';

export const CounterStore = signalStore(
  { providedIn: 'root' },
  withState({ count: 0 }),
  withComputed((store) => ({
    doubled: computed(() => store.count() * 2),
  })),
  withMethods((store) => ({
    increment() {
      patchState(store, (s) => ({ count: s.count + 1 }));
    },
  }))
);

// counter.component.ts
import { Component, inject } from '@angular/core';
import { CounterStore } from './counter.store';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: \`
    <p>Count: {{ store.count() }}</p>
    <p>Doubled: {{ store.doubled() }}</p>
    <button (click)="store.increment()">+</button>
  \`,
})
export class CounterComponent {
  store = inject(CounterStore);
}`),gu(),hd(),gu());}function V(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". ");}}function q(i,o){i&1&&(Vi(0,"h3",33),mC(1,"Plain Angular signals"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// cart.types.ts
export interface CartItem { id: string; price: number; qty: number; }

// cart.service.ts
import { Injectable, computed, signal } from '@angular/core';
import { CartItem } from './cart.types';

@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = signal<CartItem[]>([]);

  items = this._items.asReadonly();
  count = computed(() => this._items().reduce((n, i) => n + i.qty, 0));
  total = computed(() => this._items().reduce((s, i) => s + i.price * i.qty, 0));

  add(item: CartItem) {
    this._items.update((xs) => [...xs, item]);
  }

  remove(id: string) {
    this._items.update((xs) => xs.filter((x) => x.id !== id));
  }
}`),gu(),hd(),gu());}function N(i,o){i&1&&(Vi(0,"h3",33),mC(1,"BehaviorSubject service"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// cart.types.ts
export interface CartItem { id: string; price: number; qty: number; }

// cart.service.ts
import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CartItem } from './cart.types';

@Injectable({ providedIn: 'root' })
export class CartService {
  private _items$ = new BehaviorSubject<CartItem[]>([]);

  items$ = this._items$.asObservable();
  count$ = this.items$.pipe(map((xs) => xs.reduce((n, i) => n + i.qty, 0)));
  total$ = this.items$.pipe(
    map((xs) => xs.reduce((s, i) => s + i.price * i.qty, 0))
  );

  items = toSignal(this.items$, { initialValue: [] });
  count = toSignal(this.count$, { initialValue: 0 });
  total = toSignal(this.total$, { initialValue: 0 });

  add(item: CartItem) {
    this._items$.next([...this._items$.value, item]);
  }

  remove(id: string) {
    this._items$.next(this._items$.value.filter((x) => x.id !== id));
  }
}`),gu(),hd(),gu());}function z(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals (signalStore)"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// cart.types.ts
export interface CartItem { id: string; price: number; qty: number; }

// cart.store.ts
import { computed } from '@angular/core';
import {
  patchState, signalStore, withComputed, withMethods, withState,
} from '@ngrx/signals';
import { CartItem } from './cart.types';

export const CartStore = signalStore(
  { providedIn: 'root' },
  withState({ items: [] as CartItem[] }),
  withComputed((store) => ({
    count: computed(() => store.items().reduce((n, i) => n + i.qty, 0)),
    total: computed(() =>
      store.items().reduce((s, i) => s + i.price * i.qty, 0)
    ),
  })),
  withMethods((store) => ({
    add(item: CartItem) {
      patchState(store, (s) => ({ items: [...s.items, item] }));
    },
    remove(id: string) {
      patchState(store, (s) => ({
        items: s.items.filter((x) => x.id !== id),
      }));
    },
  }))
);`),gu(),hd(),gu());}function D(i,o){i&1&&(Vi(0,"h3",33),mC(1,"NGXS"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// cart.types.ts
export interface CartItem { id: string; price: number; qty: number; }

// cart.actions.ts
import { CartItem } from './cart.types';

export class AddToCart {
  static readonly type = '[Cart] Add';
  constructor(public item: CartItem) {}
}
export class RemoveFromCart {
  static readonly type = '[Cart] Remove';
  constructor(public id: string) {}
}

// cart.state.ts
import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { CartItem } from './cart.types';
import { AddToCart, RemoveFromCart } from './cart.actions';

export interface CartStateModel { items: CartItem[]; }

@State<CartStateModel>({
  name: 'cart',
  defaults: { items: [] },
})
@Injectable()
export class CartState {
  @Selector() static items(s: CartStateModel) { return s.items; }
  @Selector([CartState.items])
  static count(items: CartItem[]) {
    return items.reduce((n, i) => n + i.qty, 0);
  }
  @Selector([CartState.items])
  static total(items: CartItem[]) {
    return items.reduce((s, i) => s + i.price * i.qty, 0);
  }

  @Action(AddToCart)
  add(ctx: StateContext<CartStateModel>, { item }: AddToCart) {
    ctx.patchState({ items: [...ctx.getState().items, item] });
  }

  @Action(RemoveFromCart)
  remove(ctx: StateContext<CartStateModel>, { id }: RemoveFromCart) {
    ctx.patchState({
      items: ctx.getState().items.filter((x) => x.id !== id),
    });
  }
}

// app.config.ts
import { provideStore } from '@ngxs/store';
import { CartState } from './cart.state';

export const appConfig = {
  providers: [provideStore([CartState])],
};

// cart.component.ts
import { Component, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { CartState } from './cart.state';
import { AddToCart, RemoveFromCart } from './cart.actions';
import { CartItem } from './cart.types';

@Component({ selector: 'app-cart', standalone: true, template: '...' })
export class CartComponent {
  private store = inject(Store);
  items = this.store.selectSignal(CartState.items);
  count = this.store.selectSignal(CartState.count);
  total = this.store.selectSignal(CartState.total);

  add(item: CartItem) { this.store.dispatch(new AddToCart(item)); }
  remove(id: string) { this.store.dispatch(new RemoveFromCart(id)); }
}`),gu(),hd(),gu());}function Y(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". ");}}function G(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals (with "),Vi(2,"code"),mC(3,"rxMethod"),gu(),mC(4,")"),gu(),Vi(5,"pre"),gd(),Vi(6,"code"),mC(7,`// profile.types.ts
export interface Profile { id: string; name: string; email: string; }

// profile.store.ts
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  patchState, signalStore, withMethods, withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, EMPTY } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { Profile } from './profile.types';

interface State {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
}
const initial: State = { profile: null, isLoading: false, error: null };

export const ProfileStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods((store, http = inject(HttpClient)) => ({
    load: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(() =>
          http.get<Profile>('/api/me').pipe(
            tap((profile) => patchState(store, { profile, isLoading: false })),
            catchError((err) => {
              patchState(store, { isLoading: false, error: err.message });
              return EMPTY;
            })
          )
        )
      )
    ),
    retry() { (this as unknown as { load(v: void): void }).load(); },
  }))
);`),gu(),hd(),gu());}function W(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/component-store"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// profile.types.ts
export interface Profile { id: string; name: string; email: string; }

// profile.store.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ComponentStore } from '@ngrx/component-store';
import { EMPTY } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { Profile } from './profile.types';

interface State {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileStore extends ComponentStore<State> {
  private http = inject(HttpClient);

  constructor() {
    super({ profile: null, isLoading: false, error: null });
  }

  // Selectors -> signals
  profile   = this.selectSignal((s) => s.profile);
  isLoading = this.selectSignal((s) => s.isLoading);
  error     = this.selectSignal((s) => s.error);

  // Updaters
  private setLoading = this.updater((s, isLoading: boolean) =>
    ({ ...s, isLoading, error: null }));
  private setProfile = this.updater((s, profile: Profile) =>
    ({ ...s, profile, isLoading: false }));
  private setError   = this.updater((s, error: string) =>
    ({ ...s, error, isLoading: false }));

  // Effect
  load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.setLoading(true)),
      switchMap(() =>
        this.http.get<Profile>('/api/me').pipe(
          tap((p) => this.setProfile(p)),
          catchError((err) => { this.setError(err.message); return EMPTY; })
        )
      )
    )
  );

  retry() { this.load(); }
}`),gu(),hd(),gu());}function X(i,o){i&1&&(Vi(0,"h3",33),mC(1,"BehaviorSubject service"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// profile.types.ts
export interface Profile { id: string; name: string; email: string; }

// profile.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Profile } from './profile.types';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);

  private _profile$  = new BehaviorSubject<Profile | null>(null);
  private _loading$  = new BehaviorSubject<boolean>(false);
  private _error$    = new BehaviorSubject<string | null>(null);

  profile   = toSignal(this._profile$,  { initialValue: null });
  isLoading = toSignal(this._loading$,  { initialValue: false });
  error     = toSignal(this._error$,    { initialValue: null });

  async load(): Promise<void> {
    this._loading$.next(true);
    this._error$.next(null);
    try {
      const data = await firstValueFrom(this.http.get<Profile>('/api/me'));
      this._profile$.next(data);
    } catch (err) {
      this._error$.next((err as Error).message);
    } finally {
      this._loading$.next(false);
    }
  }

  retry(): Promise<void> { return this.load(); }
}`),gu(),hd(),gu());}function J(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". ");}}function K(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals (with "),Vi(2,"code"),mC(3,"withEntities"),gu(),mC(4," + "),Vi(5,"code"),mC(6,"rxMethod"),gu(),mC(7,")"),gu(),Vi(8,"pre"),gd(),Vi(9,"code"),mC(10,`// tickets.types.ts
export interface Ticket { id: string; title: string; done: boolean; }

// tickets.store.ts
import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  patchState, signalStore, withComputed, withMethods, withState,
} from '@ngrx/signals';
import {
  withEntities, setAllEntities, updateEntity,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, EMPTY, firstValueFrom } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { Ticket } from './tickets.types';

interface ExtraState {
  filter: string;
  isLoading: boolean;
  error: string | null;
}
const initial: ExtraState = { filter: '', isLoading: false, error: null };

export const TicketStore = signalStore(
  { providedIn: 'root' },
  withEntities<Ticket>(),
  withState(initial),
  withComputed((store) => ({
    visible: computed(() => {
      const f = store.filter().toLowerCase();
      return store.entities().filter((t) =>
        t.title.toLowerCase().includes(f)
      );
    }),
  })),
  withMethods((store, http = inject(HttpClient)) => ({
    setFilter(filter: string) { patchState(store, { filter }); },

    load: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(() =>
          http.get<Ticket[]>('/api/tickets').pipe(
            tap((list) =>
              patchState(store, setAllEntities(list), { isLoading: false })
            ),
            catchError((err) => {
              patchState(store, { isLoading: false, error: err.message });
              return EMPTY;
            })
          )
        )
      )
    ),

    async updateTitle(id: string, title: string) {
      const previous = store.entityMap()[id];
      if (!previous) return;

      patchState(store, updateEntity({ id, changes: { title } }));

      try {
        await firstValueFrom(http.patch('/api/tickets/' + id, { title }));
      } catch (err) {
        patchState(
          store,
          updateEntity({ id, changes: { title: previous.title } }),
          { error: (err as Error).message }
        );
      }
    },

    retry() { (this as unknown as { load(v: void): void }).load(); },
  }))
);

// tickets-list.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { TicketStore } from './tickets.store';

@Component({ selector: 'app-tickets', standalone: true, template: '...' })
export class TicketsListComponent implements OnInit {
  store = inject(TicketStore);

  visible   = this.store.visible;
  isLoading = this.store.isLoading;
  error     = this.store.error;

  ngOnInit() { this.store.load(); }
}`),gu(),hd(),gu());}function Z(i,o){i&1&&(Vi(0,"h3",33),mC(1,"Classic NgRx ("),Vi(2,"code"),mC(3,"@ngrx/store"),gu(),mC(4," + "),Vi(5,"code"),mC(6,"@ngrx/effects"),gu(),mC(7,")"),gu(),Vi(8,"pre"),gd(),Vi(9,"code"),mC(10,`// tickets.types.ts
export interface Ticket { id: string; title: string; done: boolean; }

// tickets.actions.ts
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Ticket } from './tickets.types';

export const TicketsActions = createActionGroup({
  source: 'Tickets',
  events: {
    'Set Filter':            props<{ filter: string }>(),
    Load:                    emptyProps(),
    'Load Success':          props<{ tickets: Ticket[] }>(),
    'Load Failure':          props<{ error: string }>(),
    'Update Title':          props<{ id: string; title: string; previousTitle: string }>(),
    'Update Title Failure':  props<{ id: string; previousTitle: string; error: string }>(),
  },
});

// tickets.reducer.ts
import { createReducer, on, createFeature } from '@ngrx/store';
import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { Ticket } from './tickets.types';
import { TicketsActions } from './tickets.actions';

export interface TicketsState extends EntityState<Ticket> {
  filter: string;
  isLoading: boolean;
  error: string | null;
}

export const adapter = createEntityAdapter<Ticket>();
const initial: TicketsState = adapter.getInitialState({
  filter: '', isLoading: false, error: null,
});

export const ticketsFeature = createFeature({
  name: 'tickets',
  reducer: createReducer(
    initial,
    on(TicketsActions.setFilter, (s, { filter }) => ({ ...s, filter })),
    on(TicketsActions.load,         (s) => ({ ...s, isLoading: true, error: null })),
    on(TicketsActions.loadSuccess,  (s, { tickets }) =>
      adapter.setAll(tickets, { ...s, isLoading: false })),
    on(TicketsActions.loadFailure,  (s, { error }) => ({ ...s, isLoading: false, error })),
    on(TicketsActions.updateTitle,  (s, { id, title }) =>
      adapter.updateOne({ id, changes: { title } }, s)),
    on(TicketsActions.updateTitleFailure, (s, { id, previousTitle, error }) =>
      adapter.updateOne({ id, changes: { title: previousTitle } }, { ...s, error })),
  ),
});

// tickets.selectors.ts
import { createSelector } from '@ngrx/store';
import { ticketsFeature, adapter } from './tickets.reducer';

const { selectAll } = adapter.getSelectors();
const { selectTicketsState, selectFilter, selectIsLoading, selectError } =
  ticketsFeature;

export const selectAllTickets = createSelector(selectTicketsState, selectAll);
export const selectVisibleTickets = createSelector(
  selectAllTickets, selectFilter,
  (tickets, filter) =>
    tickets.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase())),
);
export { selectIsLoading, selectError };

// tickets.effects.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { switchMap, map, catchError, mergeMap } from 'rxjs/operators';
import { TicketsActions } from './tickets.actions';
import { Ticket } from './tickets.types';

@Injectable()
export class TicketsEffects {
  private actions$ = inject(Actions);
  private http     = inject(HttpClient);

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TicketsActions.load),
      switchMap(() =>
        this.http.get<Ticket[]>('/api/tickets').pipe(
          map((tickets) => TicketsActions.loadSuccess({ tickets })),
          catchError((err) =>
            of(TicketsActions.loadFailure({ error: err.message }))
          )
        )
      )
    )
  );

  updateTitle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TicketsActions.updateTitle),
      mergeMap((({ id, title, previousTitle }) =>
        this.http.patch('/api/tickets/' + id, { title }).pipe(
          map(() => ({ type: '[Tickets] Update Title Done' })),
          catchError((err) =>
            of(TicketsActions.updateTitleFailure({
              id, previousTitle, error: err.message,
            }))
          )
        )
      ))
    )
  );
}

// app.config.ts
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { ticketsFeature } from './tickets.reducer';
import { TicketsEffects } from './tickets.effects';

export const appConfig = {
  providers: [
    provideStore(),
    provideState(ticketsFeature),
    provideEffects([TicketsEffects]),
  ],
};

// tickets-list.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { TicketsActions } from './tickets.actions';
import {
  selectVisibleTickets, selectIsLoading, selectError,
} from './tickets.selectors';

@Component({ selector: 'app-tickets', standalone: true, template: '...' })
export class TicketsListComponent implements OnInit {
  private store = inject(Store);

  visible   = this.store.selectSignal(selectVisibleTickets);
  isLoading = this.store.selectSignal(selectIsLoading);
  error     = this.store.selectSignal(selectError);

  ngOnInit() { this.store.dispatch(TicketsActions.load()); }

  setFilter(filter: string) {
    this.store.dispatch(TicketsActions.setFilter({ filter }));
  }

  rename(id: string, title: string, previousTitle: string) {
    this.store.dispatch(
      TicketsActions.updateTitle({ id, title, previousTitle })
    );
  }

  retry() { this.store.dispatch(TicketsActions.load()); }
}`),gu(),hd(),gu());}function Q(i,o){i&1&&(Vi(0,"h3",33),mC(1,"Elf (@ngneat/elf with entities)"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// tickets.types.ts
export interface Ticket { id: string; title: string; done: boolean; }

// tickets.repository.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { createStore, withProps, select } from '@ngneat/elf';
import {
  withEntities, selectAllEntities, setEntities,
  updateEntities, getEntity,
} from '@ngneat/elf-entities';
import { combineLatest, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { Ticket } from './tickets.types';

interface UiProps {
  filter: string;
  isLoading: boolean;
  error: string | null;
}

const store = createStore(
  { name: 'tickets' },
  withEntities<Ticket>(),
  withProps<UiProps>({ filter: '', isLoading: false, error: null }),
);

@Injectable({ providedIn: 'root' })
export class TicketsRepository {
  private http = inject(HttpClient);

  visible$ = combineLatest([
    store.pipe(selectAllEntities()),
    store.pipe(select((s) => s.filter)),
  ]).pipe(
    map(([list, filter]) =>
      list.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
    )
  );
  isLoading$ = store.pipe(select((s) => s.isLoading));
  error$     = store.pipe(select((s) => s.error));

  visible   = toSignal(this.visible$,   { initialValue: [] });
  isLoading = toSignal(this.isLoading$, { initialValue: false });
  error     = toSignal(this.error$,     { initialValue: null });

  setFilter(filter: string) { store.update((s) => ({ ...s, filter })); }

  async load() {
    store.update((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const list = await firstValueFrom(this.http.get<Ticket[]>('/api/tickets'));
      store.update(setEntities(list), (s) => ({ ...s, isLoading: false }));
    } catch (err) {
      store.update((s) =>
        ({ ...s, isLoading: false, error: (err as Error).message }));
    }
  }

  async updateTitle(id: string, title: string) {
    const previous = store.query(getEntity(id));
    if (!previous) return;
    store.update(updateEntities(id, { title }));
    try {
      await firstValueFrom(this.http.patch('/api/tickets/' + id, { title }));
    } catch (err) {
      store.update(
        updateEntities(id, { title: previous.title }),
        (s) => ({ ...s, error: (err as Error).message }),
      );
    }
  }

  retry() { return this.load(); }
}`),gu(),hd(),gu());}function ee(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". ");}}function te(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals (rxMethod + switchMap)"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// orders.types.ts
export interface Order { id: string; userId: string; total: number; }

// users.store.ts
import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  patchState, signalStore, withHooks, withMethods, withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, EMPTY } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { Order } from './orders.types';

interface State {
  selectedUserId: string | null;
  orders: Order[];
  ordersLoading: boolean;
}
const initial: State = {
  selectedUserId: null, orders: [], ordersLoading: false,
};

export const UsersStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods((store, http = inject(HttpClient)) => ({
    selectUser(id: string | null) {
      patchState(store, { selectedUserId: id });
    },

    loadOrdersForUser: rxMethod<string | null>(
      pipe(
        switchMap((userId) => {
          if (!userId) {
            patchState(store, { orders: [], ordersLoading: false });
            return EMPTY;
          }
          patchState(store, { ordersLoading: true });
          return http.get<Order[]>('/api/users/' + userId + '/orders').pipe(
            tap((orders) => patchState(store, { orders, ordersLoading: false })),
            catchError(() => {
              patchState(store, { ordersLoading: false });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  })),
  withHooks({
    onInit({ selectedUserId, loadOrdersForUser }) {
      // Re-run whenever selection changes; switchMap cancels prior request.
      loadOrdersForUser(computed(() => selectedUserId()));
    },
  }),
);`),gu(),hd(),gu());}function ne(i,o){i&1&&(Vi(0,"h3",33),mC(1,"Classic NgRx (action triggers effect with switchMap)"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// orders.types.ts
export interface Order { id: string; userId: string; total: number; }

// users.actions.ts
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Order } from './orders.types';

export const UsersActions = createActionGroup({
  source: 'Users',
  events: {
    'Select User':         props<{ userId: string | null }>(),
    'Load Orders Success': props<{ orders: Order[] }>(),
    'Load Orders Failure': emptyProps(),
  },
});

// users.reducer.ts
import { createReducer, on, createFeature } from '@ngrx/store';
import { UsersActions } from './users.actions';
import { Order } from './orders.types';

interface State {
  selectedUserId: string | null;
  orders: Order[];
  ordersLoading: boolean;
}

const initial: State = {
  selectedUserId: null, orders: [], ordersLoading: false,
};

export const usersFeature = createFeature({
  name: 'users',
  reducer: createReducer(
    initial,
    on(UsersActions.selectUser, (s, { userId }) => ({
      ...s,
      selectedUserId: userId,
      orders: [],
      ordersLoading: !!userId,
    })),
    on(UsersActions.loadOrdersSuccess, (s, { orders }) =>
      ({ ...s, orders, ordersLoading: false })),
    on(UsersActions.loadOrdersFailure, (s) =>
      ({ ...s, ordersLoading: false })),
  ),
});

// users.effects.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { EMPTY, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { UsersActions } from './users.actions';
import { Order } from './orders.types';

@Injectable()
export class UsersEffects {
  private actions$ = inject(Actions);
  private http     = inject(HttpClient);

  selectUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.selectUser),
      switchMap(({ userId }) => {
        if (!userId) return EMPTY;
        return this.http.get<Order[]>('/api/users/' + userId + '/orders').pipe(
          map((orders) => UsersActions.loadOrdersSuccess({ orders })),
          catchError(() => of(UsersActions.loadOrdersFailure())),
        );
      }),
    ),
  );
}

// app.config.ts
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { usersFeature } from './users.reducer';
import { UsersEffects } from './users.effects';

export const appConfig = {
  providers: [
    provideStore(),
    provideState(usersFeature),
    provideEffects([UsersEffects]),
  ],
};

// users.component.ts
import { Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { UsersActions } from './users.actions';
import { usersFeature } from './users.reducer';

@Component({ selector: 'app-users', standalone: true, template: '...' })
export class UsersComponent {
  private store = inject(Store);

  selectedUserId = this.store.selectSignal(usersFeature.selectSelectedUserId);
  orders         = this.store.selectSignal(usersFeature.selectOrders);
  ordersLoading  = this.store.selectSignal(usersFeature.selectOrdersLoading);

  pick(id: string | null) {
    this.store.dispatch(UsersActions.selectUser({ userId: id }));
  }
}`),gu(),hd(),gu());}function ie(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". ");}}function re(i,o){i&1&&(Vi(0,"h3",33),mC(1,"@ngrx/signals \u2014 equivalent multi-store composition"),gu(),Vi(2,"pre"),gd(),Vi(3,"code"),mC(4,`// identity.store.ts
import { computed } from '@angular/core';
import {
  patchState, signalStore, withComputed, withMethods, withState,
} from '@ngrx/signals';

export interface User { id: string; name: string; email: string; }

export const IdentityStore = signalStore(
  { providedIn: 'root' },
  withState({ user: null as User | null }),
  withComputed((store) => ({
    isAuthenticated: computed(() => store.user() !== null),
  })),
  withMethods((store) => ({
    setUser(user: User | null) { patchState(store, { user }); },
    clear() { patchState(store, { user: null }); },
  }))
);

// tickets.store.ts \u2014 full store (matches Example 4's signalStore plus a
// clearAll() method called from the AppStore's logout orchestration).
import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  patchState, signalStore, withComputed, withMethods, withState,
} from '@ngrx/signals';
import {
  withEntities, setAllEntities, updateEntity, removeAllEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, EMPTY, firstValueFrom } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';

export interface Ticket { id: string; title: string; done: boolean; }

interface Extra {
  activeId: string | null;
  isLoading: boolean;
  error: string | null;
}
const initial: Extra = { activeId: null, isLoading: false, error: null };

export const TicketStore = signalStore(
  { providedIn: 'root' },
  withEntities<Ticket>(),
  withState(initial),
  withComputed((store) => ({
    active: computed(() => {
      const id = store.activeId();
      return id ? store.entityMap()[id] ?? null : null;
    }),
  })),
  withMethods((store, http = inject(HttpClient)) => ({
    setActive(id: string | null) { patchState(store, { activeId: id }); },

    load: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(() =>
          http.get<Ticket[]>('/api/tickets').pipe(
            tap((list) =>
              patchState(store, setAllEntities(list), { isLoading: false })
            ),
            catchError((err) => {
              patchState(store, { isLoading: false, error: err.message });
              return EMPTY;
            }),
          )
        )
      )
    ),

    async updateTitle(id: string, title: string) {
      const previous = store.entityMap()[id];
      if (!previous) return;
      patchState(store, updateEntity({ id, changes: { title } }));
      try {
        await firstValueFrom(http.patch('/api/tickets/' + id, { title }));
      } catch (err) {
        patchState(
          store,
          updateEntity({ id, changes: { title: previous.title } }),
          { error: (err as Error).message },
        );
      }
    },

    /** Wipes all tickets (called from AppStore.logout()). */
    clearAll() {
      patchState(store, removeAllEntities(), { activeId: null });
    },
  }))
);

// settings.store.ts
import { effect } from '@angular/core';
import {
  patchState, signalStore, withHooks, withMethods, withState,
} from '@ngrx/signals';

interface Settings {
  theme: 'light' | 'dark';
  locale: string;
}
function load(): Settings {
  return {
    theme: (localStorage.getItem('app.theme') as 'light' | 'dark') ?? 'light',
    locale: localStorage.getItem('app.locale') ?? 'en-US',
  };
}

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState(load()),
  withMethods((store) => ({
    setTheme(theme: 'light' | 'dark') { patchState(store, { theme }); },
    setLocale(locale: string)         { patchState(store, { locale }); },
  })),
  withHooks({
    onInit(store) {
      // manual persistence \u2014 equivalent to SignalTree's stored() marker
      effect(() => localStorage.setItem('app.theme', store.theme()));
      effect(() => localStorage.setItem('app.locale', store.locale()));
    },
  }),
);

// app-store.ts (the orchestration layer signalStore does not give you)
import { Injectable, inject, computed } from '@angular/core';
import { IdentityStore } from './identity.store';
import { TicketStore } from './tickets.store';
import { SettingsStore } from './settings.store';

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly identity = inject(IdentityStore);
  readonly tickets  = inject(TicketStore);
  readonly settings = inject(SettingsStore);

  // Cross-store derived value \u2014 re-implemented on the facade because
  // signalStore doesn't expose a way to derive across stores natively.
  readonly openTicketsForUser = computed(() => {
    if (!this.identity.isAuthenticated()) return [];
    return this.tickets.entities().filter((t) => !t.done);
  });

  /** Cross-store orchestration. */
  logout() {
    this.identity.clear();
    this.tickets.clearAll();
    // No batching across stores \u2014 two separate change-detection ticks.
  }
}

// any-component.ts
import { Component, inject } from '@angular/core';
import { AppStore } from '../app-store';

@Component({ selector: 'app-shell', standalone: true, template: '...' })
export class ShellComponent {
  private store = inject(AppStore);
  user             = this.store.identity.user;
  theme            = this.store.settings.theme;
  isAuthenticated  = this.store.identity.isAuthenticated;
  openTickets      = this.store.openTicketsForUser;
  logout()         { this.store.logout(); }
}`),gu(),hd(),gu());}function oe(i,o){if(i&1&&(Vi(0,"h3",33),mC(1),gu(),Vi(2,"p",2),mC(3),Vi(4,"code"),mC(5,"@ngrx/signals"),gu(),mC(6," \u2014 PRs welcome to extend coverage. "),gu()),i&2){let r=$I();wD(),Fh(r.selectedLabel()),wD(2),Lh(" Not shown for this example. ",r.selectedLabel()," appears in examples ",r.examplesFor(r.compareLib()).join(", "),". The full-stack multi-domain comparison is currently authored only for ");}}var L=class i{options=[{id:"ngrx-signals",label:"@ngrx/signals",available:[1,2,3,4,5,6]},{id:"signals",label:"Plain signals",available:[1,2]},{id:"behavior",label:"BehaviorSubject",available:[1,2,3]},{id:"component-store",label:"@ngrx/component-store",available:[3]},{id:"ngrx-classic",label:"Classic NgRx",available:[4,5]},{id:"ngxs",label:"NGXS",available:[2]},{id:"elf",label:"Elf",available:[4]}];compareLib=pt("ngrx-signals");isAvailable(o,r=this.compareLib()){return this.options.find(c=>c.id===r)?.available.includes(o)??false}selectedLabel(){return this.options.find(o=>o.id===this.compareLib())?.label??""}examplesFor(o){return this.options.find(r=>r.id===o)?.available??[]}static \u0275fac=function(r){return new(r||i)};static \u0275cmp=iI({type:i,selectors:[["app-migration-recipe"]],decls:736,vars:8,consts:[[1,"article"],[1,"lede"],[1,"callout"],["href","#ex-6"],["role","radiogroup","aria-label","Comparison library",1,"lib-picker"],[1,"chips"],["type","button","role","radio",3,"active","title"],[1,"picker-note"],["aria-label","Examples",1,"toc"],["href","#ex-1"],["href","#ex-2"],["href","#ex-3"],["href","#ex-4"],["href","#ex-5"],["href","#migration-skill"],["id","ex-1"],[1,"compare-grid","example-grid"],[1,"lib-pane"],[1,"pane-title","pane-signaltree"],["id","ex-2"],["id","ex-3"],["id","ex-4"],["id","ex-5"],["id","ex-6"],["id","migration-skill"],[1,"callout","callout-primary"],["href","https://github.com/JBorgia/signaltree#using-signaltree-with-ai-agents","target","_blank","rel","noopener"],["routerLink","/architecture"],["routerLink","/examples/fundamentals/recommended-architecture"],["routerLink","/examples/fundamentals"],["routerLink","/benchmarks"],["type","button","role","radio",3,"click","title"],[1,"chip-count"],[1,"pane-title"]],template:function(r,c){if(r&1&&(Vi(0,"div",0)(1,"h1"),mC(2,"Migration Recipe & Side-by-Side Comparisons"),gu(),Vi(3,"p",1),mC(4," Six progressively more complex feature implementations, each shown side-by-side: "),Vi(5,"strong"),mC(6,"SignalTree on the left"),gu(),mC(7,", the comparison library you pick on the right. Each example targets the same "),Vi(8,"em"),mC(9,"capability checklist"),gu(),mC(10,", and within an example both panes are written at the same architectural level \u2014 a compact single-file service compares against a compact single-file store; a multi-file "),Vi(11,"code"),mC(12,"AppTree"),gu(),mC(13,"/"),Vi(14,"code"),mC(15,"Ops"),gu(),mC(16,"/"),Vi(17,"code"),mC(18,"AppStore"),gu(),mC(19," layout compares against the equivalent multi-store + facade layout. "),gu(),Vi(20,"p",2)(21,"strong"),mC(22,"What we don't claim:"),gu(),mC(23," that the libraries' internals are equivalent. SignalTree's "),Vi(24,"code"),mC(25,"status()"),gu(),mC(26,", "),Vi(27,"code"),mC(28,"entityMap()"),gu(),mC(29,", "),Vi(30,"code"),mC(31,"stored()"),gu(),mC(32,", "),Vi(33,"code"),mC(34,"batching()"),gu(),mC(35,", "),Vi(36,"code"),mC(37,"devTools()"),gu(),mC(38,", and "),Vi(39,"code"),mC(40,"timeTravel()"),gu(),mC(41,` primitives encapsulate behavior that other libraries reconstruct from primitives in app code. That's the point of the comparison \u2014 not "look how much shorter SignalTree is" but "look at what each library asks `),Vi(42,"em"),mC(43,"your"),gu(),mC(44,' code to express." '),gu(),Vi(45,"p",2)(46,"strong"),mC(47,"One more honest note:"),gu(),mC(48," SignalTree can be as small as you want it to be. The "),Vi(49,"code"),mC(50,"APP_TREE"),gu(),mC(51," + "),Vi(52,"code"),mC(53,"provideAppTree()"),gu(),mC(54," + "),Vi(55,"code"),mC(56,"AppStore"),gu(),mC(57," + per-domain "),Vi(58,"code"),mC(59,"Ops"),gu(),mC(60," layout shown in "),Vi(61,"a",3),mC(62,"Example 6"),gu(),mC(63," is a "),Vi(64,"em"),mC(65,"recommended"),gu(),mC(66," architecture for multi-domain apps \u2014 it is not mandatory. Examples 1\u20135 use plain "),Vi(67,"code"),mC(68,"@Injectable"),gu(),mC(69," services owning a "),Vi(70,"code"),mC(71,"signalTree"),gu(),mC(72," directly, which is the same scale as a "),Vi(73,"code"),mC(74,"signalStore"),gu(),mC(75," or a single "),Vi(76,"code"),mC(77,"BehaviorSubject"),gu(),mC(78," service. Pick the architecture that fits your app's complexity. "),gu(),Vi(79,"div",4)(80,"strong"),mC(81,"Compare SignalTree against:"),gu(),Vi(82,"div",5),xI(83,R,4,6,"button",6,F),gu(),Vi(85,"p",7),mC(86," Showing "),Vi(87,"strong"),mC(88),gu(),mC(89),gu()(),Vi(90,"nav",8)(91,"strong"),mC(92,"Examples (simple \u2192 complex):"),gu(),Vi(93,"ul")(94,"li")(95,"a",9),mC(96,"1. Counter"),gu()(),Vi(97,"li")(98,"a",10),mC(99,"2. Cart with derived totals"),gu()(),Vi(100,"li")(101,"a",11),mC(102,"3. Async data: loading / error / data"),gu()(),Vi(103,"li")(104,"a",12),mC(105,"4. CRUD entity collection with filter"),gu()(),Vi(106,"li")(107,"a",13),mC(108,"5. Reactive cross-domain effect"),gu()(),Vi(109,"li")(110,"a",3),mC(111,"6. Full multi-domain AppStore architecture"),gu()(),Vi(112,"li")(113,"a",14),mC(114,"Migration Skill (AI-assisted)"),gu()()()(),ph(115,"hr"),Vi(116,"section",15)(117,"h2"),mC(118,"1. Counter \u2014 state + one derived + one mutation"),gu(),Vi(119,"p"),mC(120," The smallest possible feature. One number, one derived value ("),Vi(121,"code"),mC(122,"doubled"),gu(),mC(123,"), one increment method. This is where the mechanical overhead of each library is most visible. "),gu(),Vi(124,"div",2)(125,"strong"),mC(126,"Capability checklist (identical for every example):"),gu(),Vi(127,"ul")(128,"li")(129,"code"),mC(130,"count: number"),gu(),mC(131," state"),gu(),Vi(132,"li")(133,"code"),mC(134,"doubled: number"),gu(),mC(135," derived value"),gu(),Vi(136,"li")(137,"code"),mC(138,"increment()"),gu(),mC(139," mutation"),gu(),Vi(140,"li"),mC(141,"Component reads "),Vi(142,"code"),mC(143,"count"),gu(),mC(144," + "),Vi(145,"code"),mC(146,"doubled"),gu(),mC(147," as signals and calls "),Vi(148,"code"),mC(149,"increment()"),gu()()()(),Vi(150,"div",16)(151,"div",17)(152,"h3",18),mC(153,"SignalTree"),gu(),Vi(154,"pre"),gd(),Vi(155,"code"),mC(156,`// counter.service.ts
import { Injectable, computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
export class CounterService {
  readonly $ = signalTree({ count: 0 })
    .derived($ => ({ doubled: computed(() => $.count() * 2) }))
    .$;

  increment() { this.$.count.update(n => n + 1); }
}

// counter.component.ts
import { Component, inject } from '@angular/core';
import { CounterService } from './counter.service';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: \`
    <p>Count: {{ svc.$.count() }}</p>
    <p>Doubled: {{ svc.$.doubled() }}</p>
    <button (click)="svc.increment()">+</button>
  \`,
})
export class CounterComponent {
  svc = inject(CounterService);
}`),gu(),hd(),gu()(),Vi(157,"div",17),TI(158,U,5,0)(159,B,5,0)(160,H,5,0)(161,V,4,3),gu()(),Vi(162,"p",2)(163,"strong"),mC(164,"Takeaway:"),gu(),mC(165," at this size, the leading options are within a line or two of each other. SignalTree's edge starts to show as soon as the state shape grows beyond a single primitive \u2014 see the next example. "),gu()(),ph(166,"hr"),Vi(167,"section",19)(168,"h2"),mC(169,"2. Cart \u2014 JSON state + multiple derived values"),gu(),Vi(170,"p"),mC(171," A cart with a list of line items, a derived count, a derived total, an "),Vi(172,"code"),mC(173,"add()"),gu(),mC(174," mutation, and a "),Vi(175,"code"),mC(176,"remove()"),gu(),mC(177," mutation. "),gu(),Vi(178,"div",2)(179,"strong"),mC(180,"Capability checklist:"),gu(),Vi(181,"ul")(182,"li")(183,"code"),mC(184,"items: CartItem[]"),gu(),mC(185," state (each item has "),Vi(186,"code"),mC(187,"id"),gu(),mC(188,", "),Vi(189,"code"),mC(190,"price"),gu(),mC(191,", "),Vi(192,"code"),mC(193,"qty"),gu(),mC(194,")"),gu(),Vi(195,"li")(196,"code"),mC(197,"count"),gu(),mC(198," derived = total quantity"),gu(),Vi(199,"li")(200,"code"),mC(201,"total"),gu(),mC(202," derived = price \xD7 quantity sum"),gu(),Vi(203,"li")(204,"code"),mC(205,"add(item)"),gu(),mC(206,", "),Vi(207,"code"),mC(208,"remove(id)"),gu(),mC(209," mutations"),gu(),Vi(210,"li"),mC(211,"Component reads "),Vi(212,"code"),mC(213,"items"),gu(),mC(214,", "),Vi(215,"code"),mC(216,"count"),gu(),mC(217,", "),Vi(218,"code"),mC(219,"total"),gu()()()(),Vi(220,"div",16)(221,"div",17)(222,"h3",18),mC(223,"SignalTree"),gu(),Vi(224,"pre"),gd(),Vi(225,"code"),mC(226,`// cart.service.ts
import { Injectable, computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface CartItem { id: string; price: number; qty: number; }

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly $ = signalTree({ items: [] as CartItem[] })
    .derived($ => ({
      count: computed(() => $.items().reduce((n, i) => n + i.qty, 0)),
      total: computed(() => $.items().reduce((s, i) => s + i.price * i.qty, 0)),
    }))
    .$;

  add(item: CartItem) { this.$.items.update(xs => [...xs, item]); }
  remove(id: string)  { this.$.items.update(xs => xs.filter(x => x.id !== id)); }
}

// cart.component.ts
import { Component, inject } from '@angular/core';
import { CartService } from './cart.service';

@Component({ selector: 'app-cart', standalone: true, template: '...' })
export class CartComponent {
  svc = inject(CartService);
  items = this.svc.$.items;
  count = this.svc.$.count;
  total = this.svc.$.total;
}`),gu(),hd(),gu()(),Vi(227,"div",17),TI(228,q,5,0)(229,N,5,0)(230,z,5,0)(231,D,5,0)(232,Y,4,3),gu()(),Vi(233,"p",2)(234,"strong"),mC(235,"Takeaway:"),gu(),mC(236," SignalTree, plain signals, and "),Vi(237,"code"),mC(238,"@ngrx/signals"),gu(),mC(239," are all roughly one file. NGXS already requires four (actions, state, app-config registration, component) for the same feature \u2014 and that's before any async or persistence concerns enter the picture. "),gu()(),ph(240,"hr"),Vi(241,"section",20)(242,"h2"),mC(243,"3. Async data \u2014 loading / error / data"),gu(),Vi(244,"p"),mC(245," Fetch a user profile from an API. Track loading state and errors, expose data, allow retry. This is the smallest realistic single-resource async feature. "),gu(),Vi(246,"div",2)(247,"strong"),mC(248,"Capability checklist:"),gu(),Vi(249,"ul")(250,"li")(251,"code"),mC(252,"profile: Profile | null"),gu()(),Vi(253,"li")(254,"code"),mC(255,"isLoading: boolean"),gu(),mC(256,", "),Vi(257,"code"),mC(258,"error: string | null"),gu()(),Vi(259,"li")(260,"code"),mC(261,"load()"),gu(),mC(262," async fetch"),gu(),Vi(263,"li")(264,"code"),mC(265,"retry()"),gu(),mC(266," re-runs the load"),gu()()(),Vi(267,"div",16)(268,"div",17)(269,"h3",18),mC(270,"SignalTree (using the "),Vi(271,"code"),mC(272,"asyncSource()"),gu(),mC(273," marker)"),gu(),Vi(274,"pre"),gd(),Vi(275,"code"),mC(276,`// profile.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { signalTree, asyncSource } from '@signaltree/core';

interface Profile { id: string; name: string; email: string; }

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);

  // Marker materializes into data/loading/error signals + refresh()/set()/reset() \u2014
  // no manual setLoading/setLoaded wiring.
  readonly $ = signalTree({
    profile: asyncSource<Profile>({
      load: () => this.http.get<Profile>('/api/me'),
    }),
  }).$;

  retry() { this.$.profile.refresh(); }
}

// Consumers read uniformly:
// service.$.profile();           // Profile | undefined
// service.$.profile.loading();   // boolean
// service.$.profile.error();     // unknown | null`),gu(),hd(),gu()(),Vi(277,"div",17),TI(278,G,8,0)(279,W,5,0)(280,X,5,0)(281,J,4,3),gu()(),Vi(282,"p",2)(283,"strong"),mC(284,"Takeaway:"),gu(),mC(285," the "),Vi(286,"code"),mC(287,"status()"),gu(),mC(288," marker collapses three correlated booleans ("),Vi(289,"code"),mC(290,"isLoading"),gu(),mC(291,", "),Vi(292,"code"),mC(293,"error"),gu(),mC(294,', and the implied "is loaded") into one slice with typed transitions ('),Vi(295,"code"),mC(296,"start"),gu(),mC(297," / "),Vi(298,"code"),mC(299,"success"),gu(),mC(300," / "),Vi(301,"code"),mC(302,"fail"),gu(),mC(303,"). The other libraries are functionally identical but reconstruct that pattern from primitives every time. "),gu()(),ph(304,"hr"),Vi(305,"section",21)(306,"h2"),mC(307,"4. CRUD entity collection with filter"),gu(),Vi(308,"p"),mC(309," The production pattern: a normalized collection of tickets, a text filter, loading/error tracking, async load, optimistic update with rollback on failure, and a derived "),Vi(310,"code"),mC(311,"visible"),gu(),mC(312," list. "),gu(),Vi(313,"div",2)(314,"strong"),mC(315,"Capability checklist:"),gu(),Vi(316,"ul")(317,"li"),mC(318,"Normalized entity collection of "),Vi(319,"code"),mC(320,"Ticket"),gu()(),Vi(321,"li")(322,"code"),mC(323,"filter: string"),gu()(),Vi(324,"li")(325,"code"),mC(326,"visible"),gu(),mC(327," = entities filtered by "),Vi(328,"code"),mC(329,"filter"),gu()(),Vi(330,"li"),mC(331,"Loading + error tracking"),gu(),Vi(332,"li"),mC(333,"Async "),Vi(334,"code"),mC(335,"load()"),gu()(),Vi(336,"li"),mC(337,"Optimistic "),Vi(338,"code"),mC(339,"updateTitle(id, title)"),gu(),mC(340," with rollback on failure"),gu()()(),Vi(341,"div",16)(342,"div",17)(343,"h3",18),mC(344,"SignalTree"),gu(),Vi(345,"pre"),gd(),Vi(346,"code"),mC(347,`// tickets.service.ts
import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { signalTree, entityMap, status } from '@signaltree/core';

interface Ticket { id: string; title: string; done: boolean; }

@Injectable({ providedIn: 'root' })
export class TicketsService {
  private http = inject(HttpClient);

  readonly $ = signalTree({
    entities: entityMap<Ticket, string>(),
    filter: '',
    load: status(),
  }).derived($ => ({
    visible: computed(() => {
      const f = $.filter().toLowerCase();
      return $.entities.all().filter(t => t.title.toLowerCase().includes(f));
    }),
  })).$;

  setFilter(f: string) { this.$.filter.set(f); }

  async load() {
    this.$.load.setLoading();
    try {
      const list = await firstValueFrom(this.http.get<Ticket[]>('/api/tickets'));
      this.$.entities.setAll(list, { selectId: t => t.id });
      this.$.load.setLoaded();
    } catch (err) {
      this.$.load.setError((err as Error).message);
    }
  }

  async updateTitle(id: string, title: string) {
    const prev = this.$.entities.byId(id)?.();
    if (!prev) return;
    this.$.entities.upsertOne({ ...prev, title });
    try {
      await firstValueFrom(this.http.patch('/api/tickets/' + id, { title }));
    } catch (err) {
      this.$.entities.upsertOne(prev);
      this.$.load.setError((err as Error).message);
    }
  }

  retry() { return this.load(); }
}

// tickets-list.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { TicketsService } from './tickets.service';

@Component({ selector: 'app-tickets', standalone: true, template: '...' })
export class TicketsListComponent implements OnInit {
  svc = inject(TicketsService);
  ngOnInit() { this.svc.load(); }
}`),gu(),hd(),gu(),Vi(348,"p",7),mC(349," The multi-file "),Vi(350,"code"),mC(351,"AppTree"),gu(),mC(352," + "),Vi(353,"code"),mC(354,"Ops"),gu(),mC(355," + "),Vi(356,"code"),mC(357,"AppStore"),gu(),mC(358," layout used in the previous version of this example earns its keep once you have multiple domains \u2014 see "),Vi(359,"a",3),mC(360,"Example 6"),gu(),mC(361,". "),gu()(),Vi(362,"div",17),TI(363,K,11,0)(364,Z,11,0)(365,Q,5,0)(366,ee,4,3),gu()(),Vi(367,"p",2)(368,"strong"),mC(369,"Takeaway:"),gu(),mC(370," at single-domain scale, SignalTree, "),Vi(371,"code"),mC(372,"@ngrx/signals"),gu(),mC(373,", and Elf all fit in one service file with comparable line counts. Classic NgRx requires roughly the same logic distributed across "),Vi(374,"em"),mC(375,"five"),gu(),mC(376," files: actions, reducer, selectors, effects, and the registration in "),Vi(377,"code"),mC(378,"app.config.ts"),gu(),mC(379,". The interesting divergence shows up in the multi-domain case ("),Vi(380,"a",3),mC(381,"Example 6"),gu(),mC(382,"), where SignalTree composes one tree and one facade while the alternatives compose multiple stores or multiple feature reducers. "),gu()(),ph(383,"hr"),Vi(384,"section",22)(385,"h2"),mC(386,"5. Reactive cross-domain effect \u2014 selection drives a fetch"),gu(),Vi(387,"p"),mC(388," When "),Vi(389,"code"),mC(390,"selectedUserId"),gu(),mC(391," changes, fetch that user's orders. Cancel any in-flight request for the previous user. Clear orders when the selection becomes "),Vi(392,"code"),mC(393,"null"),gu(),mC(394,". "),gu(),Vi(395,"div",2)(396,"strong"),mC(397,"Capability checklist:"),gu(),Vi(398,"ul")(399,"li"),mC(400,"Shared "),Vi(401,"code"),mC(402,"selectedUserId: string | null"),gu()(),Vi(403,"li")(404,"code"),mC(405,"orders: Order[]"),gu(),mC(406,", "),Vi(407,"code"),mC(408,"ordersLoading: boolean"),gu()(),Vi(409,"li"),mC(410,"Selection change cancels prior request (no race)"),gu(),Vi(411,"li"),mC(412,"Selection of "),Vi(413,"code"),mC(414,"null"),gu(),mC(415," clears orders"),gu()()(),Vi(416,"div",16)(417,"div",17)(418,"h3",18),mC(419,"SignalTree \u2014 "),Vi(420,"code"),mC(421,"toObservable"),gu(),mC(422," + "),Vi(423,"code"),mC(424,"switchMap"),gu()(),Vi(425,"pre"),gd(),Vi(426,"code"),mC(427,`// users.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, switchMap } from 'rxjs';
import { signalTree } from '@signaltree/core';

interface Order { id: string; userId: string; total: number; }

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);

  readonly $ = signalTree({
    selectedUserId: null as string | null,
    orders: [] as Order[],
    ordersLoading: false,
  }).$;

  constructor() {
    toObservable(this.$.selectedUserId).pipe(
      switchMap(userId => {
        this.$.orders.set([]);
        if (!userId) { this.$.ordersLoading.set(false); return EMPTY; }
        this.$.ordersLoading.set(true);
        return this.http.get<Order[]>('/api/users/' + userId + '/orders');
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next:  orders => { this.$.orders.set(orders); this.$.ordersLoading.set(false); },
      error: err    => { console.error(err); this.$.ordersLoading.set(false); },
    });
  }

  selectUser(id: string | null) { this.$.selectedUserId.set(id); }
}`),gu(),hd(),gu(),Vi(428,"p",7),mC(429," The "),Vi(430,"code"),mC(431,"APP_TREE"),gu(),mC(432," + "),Vi(433,"code"),mC(434,"Ops"),gu(),mC(435," + "),Vi(436,"code"),mC(437,"AppStore"),gu(),mC(438," layout shown in "),Vi(439,"a",3),mC(440,"Example 6"),gu(),mC(441," is the recommended architecture for multi-domain apps \u2014 it is not required. For a single domain, a plain "),Vi(442,"code"),mC(443,"@Injectable"),gu(),mC(444," service owning a "),Vi(445,"code"),mC(446,"signalTree"),gu(),mC(447," is perfectly fine. "),gu()(),Vi(448,"div",17),TI(449,te,5,0)(450,ne,5,0)(451,ie,4,3),gu()(),Vi(452,"p",2)(453,"strong"),mC(454,"Takeaway:"),gu(),mC(455,' all three approaches model the same "selection drives a fetch with cancellation" pattern. SignalTree attaches the reaction to the shared state graph (via '),Vi(456,"code"),mC(457,"toObservable()"),gu(),mC(458," + "),Vi(459,"code"),mC(460,"switchMap"),gu(),mC(461," over the tree); "),Vi(462,"code"),mC(463,"@ngrx/signals"),gu(),mC(464," uses "),Vi(465,"code"),mC(466,"rxMethod"),gu(),mC(467," + "),Vi(468,"code"),mC(469,"switchMap"),gu(),mC(470,"; classic NgRx routes it through actions and an effects class. "),gu()(),ph(471,"hr"),Vi(472,"section",23)(473,"h2"),mC(474,"6. Full multi-domain architecture"),gu(),Vi(475,"p"),mC(476," A realistic application with three domains \u2014 "),Vi(477,"code"),mC(478,"identity"),gu(),mC(479,", "),Vi(480,"code"),mC(481,"tickets"),gu(),mC(482,", "),Vi(483,"code"),mC(484,"settings"),gu(),mC(485," \u2014 and a single "),Vi(486,"code"),mC(487,"logout()"),gu(),mC(488,` orchestration that touches all three. This is where SignalTree's "one tree per app, one Ops per domain, one `),Vi(489,"code"),mC(490,"AppStore"),gu(),mC(491,' facade" pattern earns its keep. '),gu(),Vi(492,"div",16)(493,"div",17)(494,"h3",18),mC(495,"SignalTree"),gu(),Vi(496,"pre"),gd(),Vi(497,"code"),mC(498,`// identity/identity.state.ts
export interface User { id: string; name: string; email: string; }
export function identityState() {
  return { user: null as User | null };
}

// tickets/tickets.state.ts
import { entityMap, status } from '@signaltree/core';
export interface Ticket { id: string; title: string; done: boolean; }
export function ticketsState() {
  return {
    entities: entityMap<Ticket, string>(),
    activeId: null as string | null,
    load: status(),
  };
}

// settings/settings.state.ts
import { stored } from '@signaltree/core';
export function settingsState() {
  return {
    theme: stored<'light' | 'dark'>('app.theme', 'light'),
    locale: stored<string>('app.locale', 'en-US'),
  };
}

// tree/app-tree.ts
import { InjectionToken, Provider, computed } from '@angular/core';
import { signalTree, batching, devTools, timeTravel } from '@signaltree/core';
import { identityState } from '../identity/identity.state';
import { ticketsState } from '../tickets/tickets.state';
import { settingsState } from '../settings/settings.state';

export function createBaseState() {
  return {
    identity: identityState(),
    tickets:  ticketsState(),
    settings: settingsState(),
  };
}

export function createAppTree() {
  return signalTree(createBaseState())
    .with(devTools({ treeName: 'AppTree' }))
    .with(batching())
    .with(timeTravel())
    // Tier 1: entity resolution
    .derived(($) => ({
      tickets: {
        active: computed(() => {
          const id = $.tickets.activeId();
          return id ? $.tickets.entities.byId(id)?.() ?? null : null;
        }),
        all: computed(() => $.tickets.entities.all()),
      },
    }))
    // Tier 2: cross-domain UI rollups
    .derived(($) => ({
      ui: {
        isAuthenticated: computed(() => $.identity.user() !== null),
        openTicketsForUser: computed(() => {
          if (!$.identity.user()) return [];
          return $.tickets.all().filter((t) => !t.done);
        }),
      },
    }));
}

export type AppTree = ReturnType<typeof createAppTree>;
export const APP_TREE = new InjectionToken<AppTree>('APP_TREE');
export function provideAppTree(): Provider[] {
  return [{ provide: APP_TREE, useFactory: () => createAppTree() }];
}

// identity/identity.ops.ts
import { Injectable, inject } from '@angular/core';
import { APP_TREE } from '../tree/app-tree';
import { User } from './identity.state';

@Injectable({ providedIn: 'root' })
export class IdentityOps {
  private $ = inject(APP_TREE).$.identity;
  setUser(u: User | null) { this.$.user.set(u); }
  clear()                  { this.$.user.set(null); }
}

// tickets/tickets.ops.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_TREE } from '../tree/app-tree';
import { Ticket } from './tickets.state';

@Injectable({ providedIn: 'root' })
export class TicketsOps {
  private $ = inject(APP_TREE).$.tickets;
  private http = inject(HttpClient);

  setActive(id: string | null) { this.$.activeId.set(id); }

  async load(): Promise<void> {
    this.$.load.setLoading();
    try {
      const list = await firstValueFrom(
        this.http.get<Ticket[]>('/api/tickets')
      );
      this.$.entities.setAll(list, { selectId: (t) => t.id });
      this.$.load.setLoaded();
    } catch (err) {
      this.$.load.setError((err as Error).message);
    }
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const previous = this.$.entities.byId(id)?.();
    if (!previous) return;
    this.$.entities.upsertOne({ ...previous, title });
    try {
      await firstValueFrom(
        this.http.patch('/api/tickets/' + id, { title })
      );
    } catch (err) {
      this.$.entities.upsertOne(previous);
      this.$.load.fail((err as Error).message);
    }
  }

  clearAll() {
    this.$.entities.setAll([], { selectId: (t: Ticket) => t.id });
    this.$.activeId.set(null);
  }
}

// settings/settings.ops.ts
import { Injectable, inject } from '@angular/core';
import { APP_TREE } from '../tree/app-tree';

@Injectable({ providedIn: 'root' })
export class SettingsOps {
  private $ = inject(APP_TREE).$.settings;
  setTheme(t: 'light' | 'dark') { this.$.theme.set(t); }
  setLocale(l: string)          { this.$.locale.set(l); }
}

// app-store.ts
import { Injectable, inject } from '@angular/core';
import { APP_TREE } from './tree/app-tree';
import { IdentityOps } from './identity/identity.ops';
import { TicketsOps } from './tickets/tickets.ops';
import { SettingsOps } from './settings/settings.ops';

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;

  readonly ops = {
    identity: inject(IdentityOps),
    tickets:  inject(TicketsOps),
    settings: inject(SettingsOps),
  } as const;

  /** Cross-domain orchestration lives on AppStore, never on a single Ops. */
  logout() {
    this.ops.identity.clear();
    this.ops.tickets.clearAll();
    // settings (theme/locale) intentionally preserved across logout
  }
}

// any-component.ts
import { Component, inject } from '@angular/core';
import { AppStore } from '../app-store';

@Component({ selector: 'app-shell', standalone: true, template: '...' })
export class ShellComponent {
  private store = inject(AppStore);
  user             = this.store.$.identity.user;
  theme            = this.store.$.settings.theme;
  isAuthenticated  = this.store.$.ui.isAuthenticated;
  openTickets      = this.store.$.ui.openTicketsForUser;
  logout()         { this.store.logout(); }
}`),gu(),hd(),gu()(),Vi(499,"div",17),TI(500,re,5,0)(501,oe,7,3),gu()(),Vi(502,"p",2)(503,"strong"),mC(504,"Takeaway:"),gu(),mC(505," SignalTree composes one tree from domain-state factories, derives "),Vi(506,"em"),mC(507,"across"),gu(),mC(508," domains in one place, and gets cross-cutting concerns (DevTools, batching, time travel, persistence) on the whole tree with one "),Vi(509,"code"),mC(510,".with(...)"),gu(),mC(511," call per concern. "),Vi(512,"code"),mC(513,"@ngrx/signals"),gu(),mC(514," delivers the same capabilities domain-by-domain, but you re-implement persistence in every store, derive-across-stores happens on the facade rather than the data graph, and there's no first-class batching across stores. "),gu()(),ph(515,"hr"),Vi(516,"section",24)(517,"h2"),mC(518,"AI-assisted migration \u2014 the SignalTree Skill"),gu(),Vi(519,"p"),mC(520," SignalTree ships a vendor-neutral "),Vi(521,"strong"),mC(522,"Agent Skill"),gu(),mC(523," at "),Vi(524,"code"),mC(525,"node_modules/@signaltree/core/skills/using-signaltree/"),gu(),mC(526,". It works with Cursor, Claude Code, GitHub Copilot, or any "),Vi(527,"code"),mC(528,"SKILL.md"),gu(),mC(529,"-aware AI assistant. The skill is what an agent reads to learn SignalTree's mental model, the canonical "),Vi(530,"code"),mC(531,"AppTree"),gu(),mC(532," + "),Vi(533,"code"),mC(534,"AppStore"),gu(),mC(535," + "),Vi(536,"code"),mC(537,"Ops"),gu(),mC(538," shape, and the playbook for migrating an existing codebase off another state library. "),gu(),Vi(539,"h3"),mC(540,"One-time install per repo"),gu(),Vi(541,"pre"),gd(),Vi(542,"code"),mC(543,`# Cursor
cp -r node_modules/@signaltree/core/skills/using-signaltree .cursor/skills/

# Claude Code
cp -r node_modules/@signaltree/core/skills/using-signaltree .claude/skills/

# GitHub Copilot (custom instructions / agent customizations)
cp -r node_modules/@signaltree/core/skills/using-signaltree \\
  .github/skills/`),gu(),hd(),gu(),Vi(544,"h3"),mC(545,"What the skill teaches the agent"),gu(),Vi(546,"ul")(547,"li")(548,"strong"),mC(549,"Mental model."),gu(),mC(550," Reactive JSON tree, the "),Vi(551,"code"),mC(552,"$"),gu(),mC(553," proxy, leaves as "),Vi(554,"code"),mC(555,"WritableSignal<T>"),gu(),mC(556,", markers ("),Vi(557,"code"),mC(558,"entityMap"),gu(),mC(559,", "),Vi(560,"code"),mC(561,"status"),gu(),mC(562,", "),Vi(563,"code"),mC(564,"stored"),gu(),mC(565,", "),Vi(566,"code"),mC(567,"form"),gu(),mC(568,"), enhancer composition order. "),gu(),Vi(569,"li")(570,"strong"),mC(571,"Canonical architecture."),gu(),mC(572," One tree per app, "),Vi(573,"code"),mC(574,"APP_TREE"),gu(),mC(575," + "),Vi(576,"code"),mC(577,"provideAppTree()"),gu(),mC(578," + "),Vi(579,"code"),mC(580,"provideAppTreeForTesting()"),gu(),mC(581," from day one, "),Vi(582,"code"),mC(583,"AppStore"),gu(),mC(584," facade, per-domain "),Vi(585,"code"),mC(586,"Ops"),gu(),mC(587,", the strict consumer rule ("),Vi(588,"em"),mC(589,"components inject "),Vi(590,"code"),mC(591,"AppStore"),gu(),mC(592," only"),gu(),mC(593,"). "),gu(),Vi(594,"li")(595,"strong"),mC(596,"Tier ladder for derived signals."),gu(),mC(597," Tier 0 base \u2192 1 entity resolution \u2192 2 complex logic \u2192 3 workflow \u2192 4 navigation \u2192 5 UI aggregates, with named tier files ("),Vi(598,"code"),mC(599,"tier-entity-resolution.derived.ts"),gu(),mC(600,", etc.) once the tree crosses ~3 domains. "),gu(),Vi(601,"li")(602,"strong"),mC(603,"Migration playbook."),gu(),mC(604," Big-bang is the default (delete the legacy package in the same PR). The hybrid legacy-facade pattern is a "),Vi(605,"em"),mC(606,"temporary"),gu(),mC(607," fallback that must ship with a "),Vi(608,"code"),mC(609,"// TODO(legacy-facade): remove by <date>"),gu(),mC(610," and a tracking issue. "),gu(),Vi(611,"li")(612,"strong"),mC(613,"Dedicated mechanical-mapping guides for both NgRx flavors."),gu(),Vi(614,"code"),mC(615,"@ngrx/signals"),gu(),mC(616," ("),Vi(617,"code"),mC(618,"signalStore"),gu(),mC(619," / "),Vi(620,"code"),mC(621,"withState"),gu(),mC(622," / "),Vi(623,"code"),mC(624,"rxMethod"),gu(),mC(625,") \u2192 "),Vi(626,"code"),mC(627,"reference/migration-from-ngrx-signals.md"),gu(),mC(628,", the most battle-tested path. Classic "),Vi(629,"code"),mC(630,"@ngrx/store"),gu(),mC(631," ("),Vi(632,"code"),mC(633,"createAction"),gu(),mC(634," / "),Vi(635,"code"),mC(636,"createReducer"),gu(),mC(637," / "),Vi(638,"code"),mC(639,"createSelector"),gu(),mC(640," / "),Vi(641,"code"),mC(642,"createEffect"),gu(),mC(643," + "),Vi(644,"code"),mC(645,"@ngrx/entity"),gu(),mC(646,") \u2192 "),Vi(647,"code"),mC(648,"reference/migration-from-ngrx-store.md"),gu(),mC(649," \u2014 actions become "),Vi(650,"code"),mC(651,"Ops"),gu(),mC(652," methods, reducers become signal writes, selectors become "),Vi(653,"code"),mC(654,"computed()"),gu(),mC(655," / derived tiers, and the "),Vi(656,"code"),mC(657,"load"),gu(),mC(658," \u2192 effect \u2192 "),Vi(659,"code"),mC(660,"loadSuccess"),gu(),mC(661," action round-trip collapses into a single "),Vi(662,"code"),mC(663,"asyncSource"),gu(),mC(664," marker or "),Vi(665,"code"),mC(666,"Ops"),gu(),mC(667," method. NGXS, Elf, and the others shown above are illustrated side-by-side but not yet in the skill \u2014 PRs welcome. "),gu(),Vi(668,"li")(669,"strong"),mC(670,"Definition of done."),gu(),mC(671," (1) Zero imports of the legacy package in the migrated app. (2) Legacy package removed from "),Vi(672,"code"),mC(673,"package.json"),gu(),mC(674," (or tracked for removal). (3) Test suite green \u2014 "),Vi(675,"em"),mC(676,"not just build-green"),gu(),mC(677,". (4) DevTools shows the new tree under the chosen "),Vi(678,"code"),mC(679,"treeName"),gu(),mC(680,". "),gu(),Vi(681,"li")(682,"strong"),mC(683,"Anti-pattern catalog."),gu(),mC(684," Multiple competing trees, root-injected "),Vi(685,"code"),mC(686,"Ops"),gu(),mC(687," with eager side-effects in constructors, mocking "),Vi(688,"code"),mC(689,"AppStore"),gu(),mC(690," in tests instead of providing "),Vi(691,"code"),mC(692,"APP_TREE"),gu(),mC(693,", etc. "),gu(),Vi(694,"li")(695,"strong"),mC(696,"Orchestration mode."),gu(),mC(697," A separate playbook ("),Vi(698,"code"),mC(699,"reference/orchestrating-a-migration.md"),gu(),mC(700,") for an orchestrator agent driving phased rollout across multiple implementer subagents. Load when the work spans more than ~5 files or when one agent will exhaust its context window. "),gu()(),Vi(701,"p",25)(702,"strong"),mC(703,"Workflow:"),gu(),mC(704," point your AI assistant at the skill, give it a target store to migrate, and it will follow the playbook end-to-end \u2014 including running "),Vi(705,"code"),mC(706,"build"),gu(),mC(707,", "),Vi(708,"code"),mC(709,"test"),gu(),mC(710,", "),Vi(711,"code"),mC(712,"lint"),gu(),mC(713,", and asserting the legacy import is gone from application code and "),Vi(714,"code"),mC(715,"package.json"),gu(),mC(716," before declaring done. See "),Vi(717,"a",26),mC(718,"Using SignalTree with AI Agents"),gu(),mC(719," for harness-specific setup. "),gu()(),ph(720,"hr"),Vi(721,"h2"),mC(722,"Further reading"),gu(),Vi(723,"ul")(724,"li")(725,"a",27),mC(726,"Architecture overview"),gu()(),Vi(727,"li")(728,"a",28),mC(729,"Recommended architecture"),gu()(),Vi(730,"li")(731,"a",29),mC(732,"Fundamentals examples"),gu()(),Vi(733,"li")(734,"a",30),mC(735,"Benchmarks vs other state libraries"),gu()()()()),r&2){let f,h,S,v,E;wD(83),AI(c.options),wD(5),Fh(c.selectedLabel()),wD(),Eu(". Available in examples ",c.examplesFor(c.compareLib()).join(", "),". Other examples will show a pointer to the closest covered library. "),wD(69),SI((f=c.compareLib())==="signals"?158:f==="behavior"?159:f==="ngrx-signals"?160:161),wD(70),SI((h=c.compareLib())==="signals"?228:h==="behavior"?229:h==="ngrx-signals"?230:h==="ngxs"?231:232),wD(50),SI((S=c.compareLib())==="ngrx-signals"?278:S==="component-store"?279:S==="behavior"?280:281),wD(85),SI((v=c.compareLib())==="ngrx-signals"?363:v==="ngrx-classic"?364:v==="elf"?365:366),wD(86),SI((E=c.compareLib())==="ngrx-signals"?449:E==="ngrx-classic"?450:451),wD(51),SI((c.compareLib())==="ngrx-signals"?500:501);}},dependencies:[$t],styles:[".migration-page[_ngcontent-%COMP%]{max-width:1400px;margin:0 auto;padding:var(--space-8) var(--space-4)}.page-header[_ngcontent-%COMP%]{margin-bottom:var(--space-8)}.page-header[_ngcontent-%COMP%]   h1[_ngcontent-%COMP%]{font-size:2.5rem;font-weight:700;color:var(--text-primary);margin:0 0 var(--space-3);line-height:1.2}.page-header[_ngcontent-%COMP%]   .subtitle[_ngcontent-%COMP%]{font-size:1.125rem;color:var(--text-secondary);line-height:1.6;margin:0}.info-banner[_ngcontent-%COMP%]{background:linear-gradient(135deg,var(--color-info-50) 0%,var(--color-primary-100) 100%);border:1px solid var(--color-info-200);border-left:4px solid var(--color-primary-500);border-radius:var(--radius-lg);padding:var(--space-5);margin-bottom:var(--space-6);color:var(--info-text);line-height:1.6}.article[_ngcontent-%COMP%]{background:var(--bg-card);border-radius:var(--radius-xl);box-shadow:var(--shadow-md);padding:var(--space-8);border:1px solid var(--border-color)}.article[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{font-size:1.5rem;font-weight:700;color:var(--text-primary);margin:0 0 var(--space-4);padding-bottom:var(--space-3);border-bottom:2px solid var(--border-color)}.article[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]:not(:first-child){margin-top:var(--space-8)}.article[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%]{font-size:1.125rem;font-weight:600;color:var(--color-neutral-700);margin:var(--space-6) 0 var(--space-3)}.article[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{color:var(--text-secondary);line-height:1.7;margin:0 0 var(--space-4)}.article[_ngcontent-%COMP%]   ol[_ngcontent-%COMP%], .article[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]{padding-left:var(--space-6);margin:0 0 var(--space-4)}.article[_ngcontent-%COMP%]   ol[_ngcontent-%COMP%]   li[_ngcontent-%COMP%], .article[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]   li[_ngcontent-%COMP%]{color:var(--text-secondary);line-height:1.7;margin-bottom:var(--space-2)}.article[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%]{color:var(--text-primary);font-weight:600}.article[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{background:var(--color-neutral-100);color:var(--color-primary-700);padding:.125rem .375rem;border-radius:var(--radius-sm);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.875em}.article[_ngcontent-%COMP%]   pre[_ngcontent-%COMP%]{background:var(--color-neutral-900);color:var(--color-neutral-100);padding:var(--space-5);border-radius:var(--radius-lg);overflow-x:auto;margin:0 0 var(--space-6);box-shadow:var(--shadow-sm)}.article[_ngcontent-%COMP%]   pre[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{background:transparent;color:inherit;padding:0;font-size:.875rem;line-height:1.6}.step-list[_ngcontent-%COMP%]{counter-reset:steps;list-style:none;padding:0}.step-list[_ngcontent-%COMP%]   li[_ngcontent-%COMP%]{counter-increment:steps;display:flex;gap:var(--space-4);margin-bottom:var(--space-5);align-items:flex-start}.step-list[_ngcontent-%COMP%]   li[_ngcontent-%COMP%]:before{content:counter(steps);display:flex;align-items:center;justify-content:center;min-width:2rem;height:2rem;background:var(--color-primary-500);color:#fff;border-radius:var(--radius-full);font-weight:700;font-size:.875rem;flex-shrink:0;margin-top:.1rem}.article[_ngcontent-%COMP%]   h1[_ngcontent-%COMP%]{font-size:2.25rem;font-weight:700;color:var(--text-primary);margin:0 0 var(--space-5);line-height:1.2}.article[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%]{font-size:1rem;font-weight:600;color:var(--color-neutral-700);margin:var(--space-3) 0 var(--space-2)}.article[_ngcontent-%COMP%]   hr[_ngcontent-%COMP%]{border:0;border-top:1px solid var(--border-color);margin:var(--space-8) 0}.article[_ngcontent-%COMP%]   .lede[_ngcontent-%COMP%]{font-size:1.05rem;color:var(--text-secondary);line-height:1.7;margin-bottom:var(--space-5)}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]{background:var(--color-neutral-50, #f7fafc);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin-bottom:var(--space-6)}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%]{display:block;margin-bottom:var(--space-2)}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4)}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]   li[_ngcontent-%COMP%]{margin:0}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]{color:var(--color-primary-700);text-decoration:none;font-size:.95rem}.article[_ngcontent-%COMP%]   .toc[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]:hover{text-decoration:underline}.article[_ngcontent-%COMP%]   .concept-map[_ngcontent-%COMP%]{width:100%;border-collapse:collapse;margin:0 0 var(--space-6);font-size:.9rem}.article[_ngcontent-%COMP%]   .concept-map[_ngcontent-%COMP%]   th[_ngcontent-%COMP%], .article[_ngcontent-%COMP%]   .concept-map[_ngcontent-%COMP%]   td[_ngcontent-%COMP%]{text-align:left;padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-color);vertical-align:top}.article[_ngcontent-%COMP%]   .concept-map[_ngcontent-%COMP%]   th[_ngcontent-%COMP%]{background:var(--color-neutral-100);font-weight:600;color:var(--text-primary)}.article[_ngcontent-%COMP%]   .concept-map[_ngcontent-%COMP%]   td[_ngcontent-%COMP%]   code[_ngcontent-%COMP%]{font-size:.85em}.article[_ngcontent-%COMP%]   .compare-grid[_ngcontent-%COMP%]{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin:0 0 var(--space-6)}@media(max-width:900px){.article[_ngcontent-%COMP%]   .compare-grid[_ngcontent-%COMP%]{grid-template-columns:1fr}}.article[_ngcontent-%COMP%]   .compare-grid[_ngcontent-%COMP%] > div[_ngcontent-%COMP%]{min-width:0}.article[_ngcontent-%COMP%]   .callout[_ngcontent-%COMP%]{background:var(--color-neutral-50, #f7fafc);border-left:4px solid var(--color-neutral-300, #cbd5e0);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin:0 0 var(--space-5);color:var(--text-secondary);line-height:1.6}.article[_ngcontent-%COMP%]   .callout.callout-primary[_ngcontent-%COMP%]{background:linear-gradient(135deg,var(--color-info-50) 0%,var(--color-primary-100) 100%);border-left-color:var(--color-primary-500)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]{position:sticky;top:0;z-index:10;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin:0 0 var(--space-6);box-shadow:var(--shadow-sm)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%] > strong[_ngcontent-%COMP%]{display:block;font-size:.95rem;margin-bottom:var(--space-2);color:var(--text-primary)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   .chips[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;gap:var(--space-2)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   button[role=radio][_ngcontent-%COMP%]{display:inline-flex;align-items:center;gap:var(--space-2);padding:.35rem .75rem;font-size:.875rem;font-family:inherit;color:var(--text-primary);background:var(--color-neutral-100);border:1px solid var(--border-color);border-radius:var(--radius-full, 999px);cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   button[role=radio][_ngcontent-%COMP%]:hover{background:var(--color-neutral-200, #e5e7eb)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   button[role=radio].active[_ngcontent-%COMP%]{background:var(--color-primary-500);color:#fff;border-color:var(--color-primary-500)}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   button[role=radio][_ngcontent-%COMP%]   .chip-count[_ngcontent-%COMP%]{display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;height:1.25rem;padding:0 .4rem;font-size:.7rem;font-weight:700;background:#00000014;border-radius:var(--radius-full, 999px);line-height:1}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   button[role=radio].active[_ngcontent-%COMP%]   .chip-count[_ngcontent-%COMP%]{background:#ffffff40}.article[_ngcontent-%COMP%]   .lib-picker[_ngcontent-%COMP%]   .picker-note[_ngcontent-%COMP%]{margin:var(--space-2) 0 0;font-size:.825rem;color:var(--text-secondary)}.article[_ngcontent-%COMP%]   .example-grid[_ngcontent-%COMP%]{align-items:stretch}.article[_ngcontent-%COMP%]   .example-grid[_ngcontent-%COMP%]   .lib-pane[_ngcontent-%COMP%]{display:flex;flex-direction:column;min-width:0}.article[_ngcontent-%COMP%]   .example-grid[_ngcontent-%COMP%]   .lib-pane[_ngcontent-%COMP%]   .pane-title[_ngcontent-%COMP%]{margin-top:0;padding-bottom:var(--space-2);border-bottom:2px solid var(--border-color)}.article[_ngcontent-%COMP%]   .example-grid[_ngcontent-%COMP%]   .lib-pane[_ngcontent-%COMP%]   .pane-title.pane-signaltree[_ngcontent-%COMP%]{border-bottom-color:var(--color-primary-500);color:var(--color-primary-700)}.article[_ngcontent-%COMP%]   .example-grid[_ngcontent-%COMP%]   .lib-pane[_ngcontent-%COMP%]   pre[_ngcontent-%COMP%]{flex:1}"],changeDetection:1})};
export{L as MigrationRecipeComponent};
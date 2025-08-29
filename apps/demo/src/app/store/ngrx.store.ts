import {
  provideStore,
  createReducer,
  on,
  createAction,
  props,
  createSelector,
} from '@ngrx/store';

export interface CounterState {
  count: number;
}

export const initialCounterState: CounterState = { count: 0 };

export const increment = createAction('[Counter] Increment');
export const add = createAction('[Counter] Add', props<{ by: number }>());

export const counterReducer = createReducer(
  initialCounterState,
  on(increment, (s) => ({ ...s, count: s.count + 1 })),
  on(add, (s, { by }) => ({ ...s, count: s.count + by }))
);

export const selectCounter = (s: { counter: CounterState }) => s.counter;
export const selectCount = createSelector(selectCounter, (s) => s.count);

export function provideDemoStore() {
  return provideStore({ counter: counterReducer });
}

// Mock NgRx Store for comparison purposes
// Since @ngrx/store is not installed, we provide mock implementations

interface Action {
  type: string;
}

interface Props<T> {
  _as: 'props';
  _p: T;
}

function provideStore(reducers: Record<string, unknown>) {
  return { provide: 'MOCK_STORE', useValue: reducers };
}

function createReducer<T>(
  initialState: T,
  ...ons: Array<(state: T, action: Action) => T>
) {
  return (state = initialState, action: Action) => {
    for (const on of ons) {
      const result = on(state, action);
      if (result !== state) return result;
    }
    return state;
  };
}

function on<T>(
  actionCreator: Action,
  reducer: (state: T, action: Action) => T
) {
  return reducer;
}

function createAction<T = void>(type: string, config?: Props<T>) {
  return { type, _config: config } as Action;
}

function props<T>(): Props<T> {
  return { _as: 'props' } as Props<T>;
}

function createSelector<T, R>(
  selector: (state: T) => unknown,
  projector: (selected: unknown) => R
) {
  return (state: T) => projector(selector(state));
}

export interface CounterState {
  count: number;
}

export const initialCounterState: CounterState = { count: 0 };

export const increment = createAction('[Counter] Increment');
export const add = createAction('[Counter] Add', props<{ by: number }>());

export const counterReducer = createReducer(
  initialCounterState,
  on(increment, (s: CounterState) => ({ ...s, count: s.count + 1 })),
  on(add, (s: CounterState, action: Action) => ({
    ...s,
    count:
      s.count +
      (((action as unknown as Record<string, unknown>)['by'] as number) || 1),
  }))
);

export const selectCounter = (s: { counter: CounterState }) => s.counter;
export const selectCount = createSelector(
  selectCounter,
  (s: unknown) => (s as CounterState).count
);

export function provideDemoStore() {
  return provideStore({ counter: counterReducer });
}

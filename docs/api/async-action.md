# Async Actions & Concurrency Policies

SignalTree provides a built‑in `asyncAction` helper that lets you orchestrate asynchronous workflows while declaratively updating tree state through lifecycle hooks.

## Quick Start

```ts
const tree = signalTree({ status: 'idle', data: null as number | null, error: null as string | null });

const multiply = tree.asyncAction<number, number>(
  async (n) => {
    // pretend work
    await delay(50);
    return n * 2;
  },
  {
    label: 'multiply',
    concurrencyPolicy: 'replace',
    enableCancellation: true,
    onStart: () => ({ status: 'pending', error: null }),
    onSuccess: (result) => ({ status: 'success', data: result }),
    onError: (err) => ({ status: 'error', error: err.message }),
    onComplete: () => ({ status: 'idle' }),
  }
);

multiply.execute(2);
```

## Lifecycle Hooks

| Hook                       | When                                             | Typical Use                               |
| -------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `onStart(state)`           | Right before the async function executes         | set `status: 'pending'`, clear errors     |
| `onSuccess(result, state)` | On fulfilled promise (and not cancelled / stale) | store result payload                      |
| `onError(error, state)`    | On rejection (and not stale)                     | capture error message / set failure state |
| `onComplete(state)`        | Always after success or error (final)            | reset transient flags                     |

All hooks return a partial patch merged into state via `tree.update` (only changed signals are applied).

## Concurrency Policies

`concurrencyPolicy` determines what happens if `execute()` is called again while a run is in flight. Default is `replace`.

### 1. replace (default)

Starts a new run immediately. If `enableCancellation` is true, the previous run receives an `AbortSignal` and its result is ignored if it later resolves.

```ts
const action = tree.asyncAction(doWork, { concurrencyPolicy: 'replace', enableCancellation: true });
action.execute(1);
action.execute(2); // first run aborted (if supported) and ignored
```

### 2. drop

Ignores new calls while one is pending. Returns the original in‑flight promise reference.

```ts
const action = tree.asyncAction(doWork, { concurrencyPolicy: 'drop' });
const p1 = action.execute(1);
const p2 = action.execute(2); // p2 === p1, second input is dropped
```

### 3. queue

Enqueues calls and runs them strictly sequentially (FIFO). Each call waits for the previous to finish (success OR error) before starting the next.

```ts
const action = tree.asyncAction(doWork, { concurrencyPolicy: 'queue' });
action.execute(1);
action.execute(2);
action.execute(3); // run order: 1 -> 2 -> 3
```

### 4. race

All calls start immediately; only the FIRST settling (success or error) result is applied to state. Later settlements are ignored.

```ts
const action = tree.asyncAction(doWork, { concurrencyPolicy: 'race' });
action.execute(200); // slower
action.execute(50); // faster -> this result wins
```

## Cancellation

Cancellation is opt‑in: set `enableCancellation: true`. Currently only meaningful for the `replace` policy (other policies ignore previous results naturally). Your operation receives an `AbortSignal`:

```ts
const a = tree.asyncAction(
  async (_, signal) => {
    await waitUntilAbortedOrTimeout(signal, 5000);
  },
  { enableCancellation: true }
);
```

## State Patch Strategy

Each hook’s returned object is merged as a _partial_ via `tree.update`; only actually changed leaf signals are written (equality guard). This keeps time‑travel history concise.

## Choosing a Policy

| Scenario                             | Recommended Policy | Rationale                              |
| ------------------------------------ | ------------------ | -------------------------------------- |
| Live search / type‑ahead             | `replace`          | Only latest matters; cancel stale work |
| Idempotent trigger button            | `drop`             | Ignore double‑click spam               |
| Task queue / ordered mutations       | `queue`            | Preserve strict ordering               |
| Fastest result from multiple sources | `race`             | First success (or error) wins          |

## Example: Queue Ordering

```ts
interface State {
  order: number[];
}
const tree = signalTree<State>({ order: [] });

const action = tree.asyncAction<number, number>(
  async (n) => {
    await delay(10 - n); // different internal timings
    return n;
  },
  {
    concurrencyPolicy: 'queue',
    onSuccess: (res, s) => ({ order: [...s.order, res] }),
  }
);

await Promise.all([action.execute(1), action.execute(2), action.execute(3)]);
// order is [1,2,3] (sequential), not impacted by internal timing differences
```

## Example: Race Winner

```ts
interface State {
  winner?: string;
}
const tree = signalTree<State>({});

const race = tree.asyncAction<string, string>(
  async (label) => {
    const ms = label === 'fast' ? 5 : 15;
    await delay(ms);
    return label;
  },
  {
    concurrencyPolicy: 'race',
    onSuccess: (res) => ({ winner: res }),
  }
);

await Promise.all([race.execute('slow'), race.execute('fast')]);
// state.winner === 'fast'
```

## Testing Tips

- For queue tests, assert serialized side effects or order array.
- For race tests, start a slow and a fast promise; ensure slow result does not mutate state after fast wins.
- To test drop, assert promise identity equality and single mutation.
- For replace with cancellation, assert only second result applied and (optionally) that aborted flag was seen.

## Helper Utilities (examples)

```ts
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
```

## Summary

`asyncAction` centralizes async orchestration, offering deterministic state transitions with minimal boilerplate and flexible concurrency semantics. Pick the policy matching your UX intent and wire in lifecycle patches for clear, time‑travel friendly history.

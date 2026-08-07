import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BaseEvent } from '../core/types';
import {
  composeHandlers,
  conditionalHandler,
  createHandlerRegistry,
  debouncedHandler,
} from './handlers';

/**
 * The four handler utilities that became public in 14.0.0.
 *
 * They sat unexported beside three siblings that WERE exported — an oversight
 * rather than a decision, found by asking which symbols nothing could reach.
 * `handlers.ts` was at 27.8% coverage when they were exported, which means four
 * functions entered the public API essentially untested. That is the wrong order
 * to do things in, and this is the correction.
 *
 * The behaviours worth pinning are the ones a caller would be surprised by:
 * `dispatch` swallows handler errors so one bad subscriber cannot stop the
 * others, and `debouncedHandler` keeps only the LAST event of a burst.
 */
type TestEvent = BaseEvent<string, unknown>;

const evt = (type: string, data: unknown = {}): TestEvent =>
  ({ type, data, id: `${type}-1`, timestamp: Date.now() }) as TestEvent;

describe('createHandlerRegistry', () => {
  it('dispatches to a registered handler', async () => {
    const registry = createHandlerRegistry();
    const handler = vi.fn();
    registry.register('Created', handler);

    await registry.dispatch(evt('Created'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches to EVERY handler for a type, in registration order', async () => {
    const registry = createHandlerRegistry();
    const order: number[] = [];
    registry.register('Created', () => void order.push(1));
    registry.register('Created', () => void order.push(2));

    await registry.dispatch(evt('Created'));

    expect(order).toEqual([1, 2]);
  });

  it('ignores an event with no handlers', async () => {
    const registry = createHandlerRegistry();
    await expect(registry.dispatch(evt('Unknown'))).resolves.toBeUndefined();
  });

  it('does not dispatch across types', async () => {
    const registry = createHandlerRegistry();
    const handler = vi.fn();
    registry.register('Created', handler);

    await registry.dispatch(evt('Deleted'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('one handler THROWING does not stop the others', async () => {
    // The behaviour a caller would otherwise discover in production: a bad
    // subscriber must not silence every subscriber after it.
    const registry = createHandlerRegistry();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    registry.register('Created', () => {
      throw new Error('handler blew up');
    });
    registry.register('Created', after);

    await expect(registry.dispatch(evt('Created'))).resolves.toBeUndefined();

    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('awaits async handlers before resolving', async () => {
    const registry = createHandlerRegistry();
    let finished = false;
    registry.register('Created', async () => {
      await new Promise((r) => setTimeout(r, 10));
      finished = true;
    });

    await registry.dispatch(evt('Created'));

    expect(finished).toBe(true);
  });

  it('unregister with a handler removes only that one', async () => {
    const registry = createHandlerRegistry();
    const keep = vi.fn();
    const drop = vi.fn();
    registry.register('Created', keep);
    registry.register('Created', drop);

    registry.unregister('Created', drop);
    await registry.dispatch(evt('Created'));

    expect(keep).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
  });

  it('unregister with NO handler removes the whole type', async () => {
    const registry = createHandlerRegistry();
    registry.register('Created', vi.fn());
    registry.register('Created', vi.fn());

    registry.unregister('Created');

    expect(registry.getHandlers('Created')).toEqual([]);
  });

  it('getHandlers reports what is registered, and [] for nothing', () => {
    const registry = createHandlerRegistry();
    const handler = vi.fn();
    registry.register('Created', handler);

    expect(registry.getHandlers('Created')).toHaveLength(1);
    expect(registry.getHandlers('Nothing')).toEqual([]);
  });

  it('clear removes everything', async () => {
    const registry = createHandlerRegistry();
    const handler = vi.fn();
    registry.register('Created', handler);

    registry.clear();
    await registry.dispatch(evt('Created'));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('composeHandlers', () => {
  it('runs each handler in order', async () => {
    const order: string[] = [];
    const composed = composeHandlers<TestEvent>(
      () => void order.push('a'),
      () => void order.push('b')
    );

    await composed(evt('X'));

    expect(order).toEqual(['a', 'b']);
  });

  it('awaits each handler before starting the next', async () => {
    const order: string[] = [];
    const composed = composeHandlers<TestEvent>(
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('slow');
      },
      () => void order.push('fast')
    );

    await composed(evt('X'));

    expect(order).toEqual(['slow', 'fast']);
  });

  it('composing nothing is a no-op, not a crash', async () => {
    await expect(composeHandlers<TestEvent>()(evt('X'))).resolves.toBeUndefined();
  });

  it('a throwing handler REJECTS and skips the rest — unlike the registry', async () => {
    // Deliberately different from createHandlerRegistry.dispatch: composition is
    // a pipeline, so a failure stops it. Pinned because the two are easy to
    // assume behave alike.
    const after = vi.fn();
    const composed = composeHandlers<TestEvent>(() => {
      throw new Error('stop');
    }, after);

    await expect(composed(evt('X'))).rejects.toThrow('stop');
    expect(after).not.toHaveBeenCalled();
  });
});

describe('conditionalHandler', () => {
  it('runs when the predicate passes', async () => {
    const handler = vi.fn();
    await conditionalHandler<TestEvent>(() => true, handler)(evt('X'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not run when it fails', async () => {
    const handler = vi.fn();
    await conditionalHandler<TestEvent>(() => false, handler)(evt('X'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('the predicate receives the event', async () => {
    const seen: string[] = [];
    await conditionalHandler<TestEvent>((e) => {
      seen.push(e.type);
      return true;
    }, vi.fn())(evt('Created'));

    expect(seen).toEqual(['Created']);
  });
});

describe('debouncedHandler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not fire before the delay elapses', () => {
    const handler = vi.fn();
    debouncedHandler<TestEvent>(handler, 50)(evt('X'));

    vi.advanceTimersByTime(49);

    expect(handler).not.toHaveBeenCalled();
  });

  it('fires once the delay elapses', () => {
    const handler = vi.fn();
    debouncedHandler<TestEvent>(handler, 50)(evt('X'));

    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a burst collapses to ONE call carrying the LAST event', () => {
    // The whole point of the utility, and the part a caller most needs to be
    // sure of: not the first event, not all of them — the last.
    const handler = vi.fn();
    const debounced = debouncedHandler<TestEvent>(handler, 50);

    debounced(evt('A'));
    vi.advanceTimersByTime(10);
    debounced(evt('B'));
    vi.advanceTimersByTime(10);
    debounced(evt('C'));
    vi.advanceTimersByTime(50);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('C');
  });

  it('separate bursts fire separately', () => {
    const handler = vi.fn();
    const debounced = debouncedHandler<TestEvent>(handler, 50);

    debounced(evt('A'));
    vi.advanceTimersByTime(60);
    debounced(evt('B'));
    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls.map((c) => c[0].type)).toEqual(['A', 'B']);
  });
});

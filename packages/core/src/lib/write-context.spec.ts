import { describe, expect, it } from 'vitest';

import {
  withWriteContext,
  getActiveWriteContext,
} from './write-context';
import type { UpdateMetadata } from './types';

describe('withWriteContext / getActiveWriteContext', () => {
  it('returns undefined when no context is active', () => {
    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('exposes the context inside fn() and restores it afterward', () => {
    expect(getActiveWriteContext()).toBeUndefined();

    let captured: UpdateMetadata | undefined;
    withWriteContext({ intent: 'hydrate' }, () => {
      captured = getActiveWriteContext();
    });

    expect(captured).toEqual({ intent: 'hydrate' });
    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('returns the value produced by fn()', () => {
    const result = withWriteContext({ intent: 'user' }, () => 42);
    expect(result).toBe(42);
  });

  it('restores the previous context after a nested call', () => {
    withWriteContext({ intent: 'hydrate', source: 'serialization' }, () => {
      expect(getActiveWriteContext()).toEqual({
        intent: 'hydrate',
        source: 'serialization',
      });

      withWriteContext({ intent: 'user' }, () => {
        expect(getActiveWriteContext()).toEqual({ intent: 'user' });
      });

      // Outer context restored after inner returns.
      expect(getActiveWriteContext()).toEqual({
        intent: 'hydrate',
        source: 'serialization',
      });
    });

    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('restores context when fn() throws', () => {
    expect(() =>
      withWriteContext({ intent: 'bulk' }, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('restores the outer context when an inner call throws', () => {
    withWriteContext({ intent: 'hydrate' }, () => {
      try {
        withWriteContext({ intent: 'user' }, () => {
          throw new Error('inner');
        });
      } catch (err) {
        expect((err as Error).message).toBe('inner');
      }

      // Outer must be restored, even though inner threw.
      expect(getActiveWriteContext()).toEqual({ intent: 'hydrate' });
    });
  });

  it('does NOT survive `await` boundaries (documented limitation)', async () => {
    // Inside the synchronous portion of fn(), context is active.
    // After `await`, the synchronous frame has returned and context is restored.
    let beforeAwait: UpdateMetadata | undefined;
    let afterAwait: UpdateMetadata | undefined;

    const yieldOnce = (): Promise<void> => Promise.resolve();

    await withWriteContext({ intent: 'hydrate' }, async () => {
      beforeAwait = getActiveWriteContext();
      await yieldOnce();
      afterAwait = getActiveWriteContext();
    });

    expect(beforeAwait).toEqual({ intent: 'hydrate' });
    // Context was restored to `undefined` before the awaited microtask resumed.
    expect(afterAwait).toBeUndefined();
    expect(getActiveWriteContext()).toBeUndefined();
  });

  it('passes through optional fields (correlationId, source, custom keys)', () => {
    const meta: UpdateMetadata = {
      intent: 'migration',
      source: 'devtools',
      correlationId: 'abc-123',
      timestamp: 1700000000,
      // Open extension — should round-trip.
      customKey: 'value',
    };

    withWriteContext(meta, () => {
      const active = getActiveWriteContext();
      expect(active).toEqual(meta);
      expect(active?.['customKey']).toBe('value');
    });
  });
});

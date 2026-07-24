import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { createAuditCallback, createAuditTracker } from './audit';
import type { AuditEntry } from './audit';

interface Data extends Record<string, unknown> {
  name: string;
  email: string;
}

describe('audit (moved to core, RFC 0007)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('createAuditTracker records changes with previous values', () => {
    const tree = signalTree<Data>({ name: '', email: '' });
    const log: AuditEntry<Data>[] = [];
    const stop = createAuditTracker(tree, log, { includePreviousValues: true });

    tree.$.name.set('John');
    // NOTE: core signalTree has no `subscribe`, so the tracker uses its
    // polling fallback (100ms). Advance timers to let a poll run. (The
    // "zero-polling in Angular" claim only holds if the tree exposes
    // subscribe — flagged as a pre-existing audit gap, not fixed in the move.)
    vi.advanceTimersByTime(150);

    expect(log.length).toBeGreaterThan(0);
    const entry = log[log.length - 1];
    expect(entry.changes.name).toBe('John');
    expect(entry.previousValues?.name).toBe('');
    stop();
  });

  it('createAuditCallback captures changes between two states', () => {
    const log: AuditEntry<Data>[] = [];
    const cb = createAuditCallback(log);
    cb({ name: '', email: '' }, { name: 'Ada', email: '' });
    expect(log).toHaveLength(1);
    expect(log[0].changes.name).toBe('Ada');
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { UpdateMetadata } from '../../types';

import { createTransactionCaptureBridge, toExplicitTransactionEffect } from './transaction-capture-bridge';

describe('transaction capture bridge', () => {
  it('maps complete canonical structural metadata without normalization', () => {
    const effect = toExplicitTransactionEffect({
      next: undefined,
      prev: { id: 'u1', name: 'Alice', enabled: true },
      subjectIds: [17],
      positionIds: [3],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: 17,
          key: 'u1',
          value: { id: 'u1', name: 'Alice', enabled: true },
          beforeSubject: 16,
          afterSubject: 18,
          subjectPositions: [3, 4, 5],
        },
      },
    });

    expect(effect).toEqual({
      owner: 3,
      before: 'u1',
      after: undefined,
      subjectId: 17,
      structural: 'remove',
      subjectPositions: [3, 4, 5],
    });
  });

  it('captures only matching attribution and preserves semantic metadata exactly', () => {
    const owner = { token: 'owner' };
    const capture = vi.fn();
    const bridge = createTransactionCaptureBridge({
      draft: {
        capture,
        seal: vi.fn(),
        confirm: vi.fn(),
        abort: vi.fn(),
        getLifecycle: vi.fn(),
      },
      turnId: 7,
      transactionOwner: owner,
    });
    const meta: UpdateMetadata = {
      transactionId: 7,
      transactionOwner: owner,
      historyEffect: {
        kind: 'rekey',
        subject: 17,
        beforeKey: 'u1',
        afterKey: 'u2',
        subjectPositions: [3, 4, 5],
      },
    };

    bridge(
      { id: 'u2', name: 'Alice', enabled: true },
      { id: 'u1', name: 'Alice', enabled: true },
      'users.u2',
      'users',
      'user',
      [17],
      [3],
      meta
    );
    bridge(
      { id: 'u3' },
      undefined,
      'users.u3',
      'users',
      'user',
      [18],
      [3],
      {
        transactionId: 8,
        transactionOwner: owner,
      }
    );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      owner: 3,
      before: 'u1',
      after: 'u2',
      subjectId: 17,
      structural: 'rekey',
      subjectPositions: [3, 4, 5],
    });
  });
});

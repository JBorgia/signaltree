import { signalTree } from '../../lib/signal-tree';
import { transactions } from './transactions';

const transactional = signalTree({ n: 0 }).with(transactions());

export const _pending = transactional.transaction(() => {
  transactional.$.n.set(1);
});

// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.undo();
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.redo();
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.canUndo();
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.canRedo();
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.getHistory();
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.jumpTo(0);
// @ts-expect-error transactions-only trees must not expose temporal methods
transactional.getCurrentIndex();

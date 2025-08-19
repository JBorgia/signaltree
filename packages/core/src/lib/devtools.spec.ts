import { signalTree } from './signal-tree';
import { listTrees, snapshotTree } from './devtools';

describe('devtools integration', () => {
  it('registers and unregisters a tree when enableDevTools is true', () => {
    const tree = signalTree(
      { count: 0 },
      { enableDevTools: true, debugMode: false }
    );

    const names = listTrees();
    expect(names.length).toBeGreaterThan(0);
    const id =
      (tree as unknown as { snapshotMeta?: () => unknown }).snapshotMeta?.() &&
      (
        (
          tree as unknown as { snapshotMeta?: () => { name?: string } }
        ).snapshotMeta?.() as { name?: string } | null
      )?.name;
    if (id) {
      expect(names).toContain(id);
    }

    tree.destroy();
    if (id) {
      expect(listTrees()).not.toContain(id);
    }
  });

  it('produces snapshotMeta with metrics when enabled', () => {
    const tree = signalTree(
      { value: 1 },
      { enableDevTools: true, trackPerformance: true }
    );
    tree.update((s) => ({ value: s.value + 1 }));

    const meta = (
      tree as unknown as { snapshotMeta?: () => unknown }
    ).snapshotMeta?.() as
      | { version: number; metrics?: unknown; name?: string }
      | null
      | undefined;
    expect(meta).toBeTruthy();
    if (meta) {
      expect(meta.version).toBeGreaterThanOrEqual(1);
      expect(meta.metrics).toBeDefined();
    }
  });

  it('snapshotTree returns null for unknown id', () => {
    expect(snapshotTree('does-not-exist')).toBeNull();
  });
});

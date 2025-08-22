import { createFormTree } from './ng-forms';

describe('ng-forms callable-proxy traversal', () => {
  it('should traverse callable proxy nodes and update nested signals', async () => {
    const form = createFormTree({ user: { name: 'alice' } } as any);

    // The SignalTree root and nested nodes are callable proxies. Ensure we can
    // use the proxy's `update` method to change nested values and that
    // `setValue` also reaches into callable proxy nodes.

    // Use the proxy-style update for the nested node
    const root: any = form.state as any;
    expect(typeof root.update).toBe('function');

    // Update via callable proxy nested update
    (root.user as any).update({ name: 'bob' });

    // Read via callable proxy accessor (function-call shape)
    expect((root.user as any).name()).toBe('bob');

    // Now use the public API setValue with a path and ensure it updates too
    form.setValue('user.name', 'carol');
    expect((root.user as any).name()).toBe('carol');
  });
});

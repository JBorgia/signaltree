import {
  assertTreeCapabilityGraphAcyclic,
  resolveTreeCapabilities,
} from './tree-capabilities';

describe('tree capability resolver', () => {
  it('resolves causal-runtime transitively without introducing snapshots', () => {
    expect(resolveTreeCapabilities(['causal-runtime'])).toEqual({
      requestedCapabilities: ['causal-runtime'],
      resolvedCapabilities: [
        'mutation-capture',
        'position-topology',
        'causal-runtime',
      ],
    });
  });

  it('keeps temporal snapshots minimal', () => {
    expect(resolveTreeCapabilities(['temporal-snapshots'])).toEqual({
      requestedCapabilities: ['temporal-snapshots'],
      resolvedCapabilities: ['temporal-snapshots'],
    });
  });

  it('is idempotent over its own closure', () => {
    const once = resolveTreeCapabilities([
      'causal-runtime',
      'temporal-snapshots',
    ]);
    const twice = resolveTreeCapabilities(once.resolvedCapabilities);

    expect(twice).toEqual({
      requestedCapabilities: once.resolvedCapabilities,
      resolvedCapabilities: once.resolvedCapabilities,
    });
  });

  it('ignores request order and duplicates', () => {
    const left = resolveTreeCapabilities([
      'temporal-snapshots',
      'causal-runtime',
      'causal-runtime',
    ]);
    const right = resolveTreeCapabilities([
      'causal-runtime',
      'temporal-snapshots',
    ]);

    expect(left).toEqual(right);
  });

  it('does not introduce unrelated capabilities', () => {
    expect(
      resolveTreeCapabilities(['mutation-capture', 'position-topology'])
    ).toEqual({
      requestedCapabilities: ['mutation-capture', 'position-topology'],
      resolvedCapabilities: ['mutation-capture', 'position-topology'],
    });
  });

  it('has an acyclic dependency graph', () => {
    expect(() => assertTreeCapabilityGraphAcyclic()).not.toThrow();
  });
});

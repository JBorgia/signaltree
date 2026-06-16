import { signalTree } from './signal-tree';

/**
 * #30 — dev-mode footgun guard: a merge write whose value is reference-
 * identical to the current value is a silent no-op (the in-place-mutation
 * trap that the library-comparison benchmark itself shipped with). The core
 * should warn once per path in dev mode, and not warn for legitimate writes.
 */
describe('no-op write warning (dev mode)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns when a merge write passes a reference-identical object', () => {
    const tree = signalTree({ profile: { name: 'a', tags: ['x'] } });
    const sameTags = tree.$.profile.tags();

    // Mutate in place and re-set the SAME reference via a merge write.
    sameTags.push('y');
    tree.$.profile({ tags: sameTags });

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('reference-identical'))
    ).toBe(true);
  });

  it('does NOT warn for a legitimate new-reference write', () => {
    const tree = signalTree({ profile: { name: 'a', tags: ['x'] } });

    tree.$.profile({ tags: [...tree.$.profile.tags(), 'y'] });

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('reference-identical'))
    ).toBe(false);
  });

  it('does NOT warn for idempotent primitive writes', () => {
    const tree = signalTree({ data: { count: 5 } });
    tree.$.data({ count: 5 }); // same primitive via merge — normal, not a footgun

    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('reference-identical'))
    ).toBe(false);
  });
});

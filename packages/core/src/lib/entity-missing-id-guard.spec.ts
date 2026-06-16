import { entityMap } from '../index';
import { signalTree } from './signal-tree';

/**
 * #2 agent-correctness guardrail: an entityMap whose entities resolve to a
 * null/undefined id (no `id` field, no selectId) silently collides them under
 * one key — a common mistake in hand- and AI-written code. Dev mode warns once.
 */
describe('entityMap missing-id guard (dev mode)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const warned = () =>
    warn.mock.calls.some((c) => String(c[0]).includes('resolved to id'));

  it('warns when entities have no id and no selectId', () => {
    const tree = signalTree({ rows: entityMap<{ name: string }>() });
    (tree.$.rows as unknown as { addOne: (e: { name: string }) => void }).addOne({
      name: 'x',
    });
    expect(warned()).toBe(true);
  });

  it('does NOT warn when a selectId is provided', () => {
    const tree = signalTree({
      rows: entityMap<{ name: string }, string>({ selectId: (e) => e.name }),
    });
    (tree.$.rows as unknown as { addOne: (e: { name: string }) => void }).addOne({
      name: 'x',
    });
    expect(warned()).toBe(false);
  });

  it('does NOT warn when entities have an id field', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number; v: number }, number>(),
    });
    (
      tree.$.rows as unknown as { addOne: (e: { id: number; v: number }) => void }
    ).addOne({ id: 1, v: 0 });
    expect(warned()).toBe(false);
  });
});

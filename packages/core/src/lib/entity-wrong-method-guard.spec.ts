import { entityMap } from '../index';
import { signalTree } from './signal-tree';

/**
 * #2 agent-correctness guardrail: AI agents frequently call entity methods from
 * other libraries (Akita `.upsert`, Elf `.addEntities`/`.setProps`, RxJS
 * `.next`). Accessing them returns undefined → cryptic "undefined is not a
 * function". Dev mode now emits an actionable hint naming the real method.
 */
interface Row {
  id: number;
  v: number;
}

function rows() {
  const tree = signalTree({ rows: entityMap<Row, number>() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tree.$.rows as any;
}

describe('entityMap wrong-method guard (dev mode)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const hintFor = (name: string) =>
    warn.mock.calls.find((c) => String(c[0]).includes(`has no \`.${name}()\``));

  it('hints upsertOne when .upsert is accessed (Akita)', () => {
    void rows().upsert;
    expect(hintFor('upsert')?.[0]).toContain('upsertOne');
  });

  it('hints addMany when .addEntities is accessed (Elf)', () => {
    void rows().addEntities;
    expect(hintFor('addEntities')?.[0]).toContain('addMany');
  });

  it('hints for RxJS .next', () => {
    void rows().next;
    expect(hintFor('next')).toBeTruthy();
  });

  it('warns once per wrong name, not on every access', () => {
    const r = rows();
    void r.upsert;
    void r.upsert;
    void r.upsert;
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('upsert')).length).toBe(1);
  });

  it('does NOT warn for real methods', () => {
    const r = rows();
    void r.addOne;
    void r.updateOne;
    void r.all;
    void r.where;
    void r.byId;
    expect(warn.mock.calls.length).toBe(0);
  });
});

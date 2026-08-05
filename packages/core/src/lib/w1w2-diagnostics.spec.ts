import { signalTree } from './signal-tree';
import { stored } from './markers/stored';
import { status } from './markers/status';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}

describe('W2: builder call path finalizes', () => {
  it('tree() before any tree.$ access returns values, not raw markers', () => {
    const mockStorage = createMockStorage();
    const tree = signalTree({
      theme: stored('w2-theme', 'light', { storage: mockStorage }),
      load: status(),
      plain: 1,
    });

    // Deliberately the FIRST operation — no tree.$ touch beforehand.
    const snap = tree() as Record<string, unknown>;

    expect(snap['plain']).toBe(1);
    expect(JSON.stringify(snap)).not.toContain('defaultValue');
    expect(JSON.stringify(snap)).not.toContain('initialState');
  });

  it('a write through tree() before finalization reaches real signals', () => {
    const tree = signalTree({ nested: { count: 0 }, plain: 1 });
    (tree as unknown as (v: object) => void)({ nested: { count: 5 } });
    expect(tree.$.nested.count()).toBe(5);
  });
});

describe('W1: diagnostics for writes that go nowhere', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* silence */
    });
  });

  afterEach(() => errSpy.mockRestore());

  it('ST2010: warns when writing a key absent from the initial shape', () => {
    const tree = signalTree({ known: 1 } as Record<string, unknown>);
    void tree.$;

    (tree as unknown as (v: object) => void)({ neverDeclared: 'x' });

    const msg = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(msg).toContain('ST2010');
    expect(msg).toContain('neverDeclared');
  });

  it('stays silent for an ordinary write', () => {
    const tree = signalTree({ known: 1 });
    void tree.$;
    (tree as unknown as (v: object) => void)({ known: 2 });

    const msg = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(msg).not.toContain('ST2010');
    expect(msg).not.toContain('ST2005');
    expect(tree.$.known()).toBe(2);
  });

  it('reports every occurrence rather than suppressing later ones', () => {
    // Deliberately NOT deduped: a global suppression Set silenced the SECOND
    // occurrence of a genuine bug — a different tree or a different namespace
    // reaching the same relative path — for the whole process lifetime.
    const tree = signalTree({ known: 1 } as Record<string, unknown>);
    void tree.$;
    for (let i = 0; i < 3; i++) {
      (tree as unknown as (v: object) => void)({ repeatedlyMissing: i });
    }
    const hits = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes('repeatedlyMissing')
    );
    expect(hits.length).toBe(3);
  });

  it('does not suppress the same relative path in a DIFFERENT namespace', () => {
    const tree = signalTree({
      billing: { present: 1 },
      shipping: { present: 1 },
    });
    void tree.$;

    (tree.$.billing as unknown as (v: object) => void)({ absentKey: 1 });
    (tree.$.shipping as unknown as (v: object) => void)({ absentKey: 1 });

    const hits = errSpy.mock.calls.filter((c) =>
      String(c[0]).includes('absentKey')
    );
    expect(hits.length).toBe(2);
  });
});

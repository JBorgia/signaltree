import { transformCode } from './ast-transform';

/**
 * Behavioral specification for the callable-syntax build transform.
 *
 * What the transform is for: in SignalTree only LEAVES are Angular signals.
 * A node (branch) is a hand-written accessor function that is callable by
 * nature — `node()` reads, `node(partialObject)` merges, `node(updaterFn)`
 * updates. A leaf is a plain `WritableSignal`, so calling it with an argument
 * does nothing at all (Angular's getter ignores extra args) — writes need
 * `.set()` / `.update()`.
 *
 * This transform closes that gap at build time: it rewrites leaf calls into
 * the explicit method calls, so one call syntax reads and writes at every
 * depth of the tree. It emits exactly the code you would have written by
 * hand, so nothing is added to the bundle.
 */

/** Transform with the default root identifiers (`['tree']`). */
const t = (src: string) => transformCode(src, {});
/** Transform with explicit roots. */
const tr = (src: string, roots: string[]) =>
  transformCode(src, { rootIdentifiers: roots });
/** Collapse whitespace so assertions survive the pretty-printer. */
const norm = (src: string) => src.replace(/\s+/g, ' ').trim();

describe('callable-syntax transform', () => {
  describe('leaf writes → .set()', () => {
    it.each([
      ["tree.$.name('Jane');", "tree.$.name.set('Jane');"],
      ['tree.$.age(25);', 'tree.$.age.set(25);'],
      ['tree.$.active(true);', 'tree.$.active.set(true);'],
      ['tree.$.active(false);', 'tree.$.active.set(false);'],
      ['tree.$.value(null);', 'tree.$.value.set(null);'],
      ['tree.$.value(undefined);', 'tree.$.value.set(undefined);'],
      ['tree.$.count(0);', 'tree.$.count.set(0);'],
      ['tree.$.count(-1);', 'tree.$.count.set(-1);'],
      ['tree.$.big(1000000);', 'tree.$.big.set(1000000);'],
      ['tree.$.ratio(1.5);', 'tree.$.ratio.set(1.5);'],
    ])('%s', (input, expected) => {
      const { code, transformed } = t(input);
      expect(norm(code)).toBe(norm(expected));
      expect(transformed).toBe(1);
    });

    it('handles a template literal argument', () => {
      const { code, transformed } = t('tree.$.label(`hi ${name}`);');
      expect(norm(code)).toBe(norm('tree.$.label.set(`hi ${name}`);'));
      expect(transformed).toBe(1);
    });

    it('handles an identifier argument', () => {
      expect(norm(t('tree.$.name(newName);').code)).toBe(
        'tree.$.name.set(newName);'
      );
    });

    it('handles a member-expression argument', () => {
      expect(norm(t('tree.$.name(user.profile.name);').code)).toBe(
        'tree.$.name.set(user.profile.name);'
      );
    });

    it('handles a call-expression argument', () => {
      expect(norm(t('tree.$.stamp(Date.now());').code)).toBe(
        'tree.$.stamp.set(Date.now());'
      );
    });

    it('handles a ternary argument', () => {
      expect(norm(t('tree.$.mode(isDark ? "dark" : "light");').code)).toBe(
        norm('tree.$.mode.set(isDark ? "dark" : "light");')
      );
    });

    it('handles an await argument', () => {
      expect(norm(t('async function f() { tree.$.data(await load()); }').code))
        .toBe(norm('async function f() { tree.$.data.set(await load()); }'));
    });

    it('handles an object-literal argument', () => {
      expect(norm(t("tree.$.user({ name: 'Jane', age: 30 });").code)).toBe(
        norm("tree.$.user.set({ name: 'Jane', age: 30 });")
      );
    });

    it('handles an array-literal argument', () => {
      expect(norm(t('tree.$.numbers([10, 20, 30]);').code)).toBe(
        norm('tree.$.numbers.set([10, 20, 30]);')
      );
    });

    it('handles a `new` expression argument', () => {
      expect(norm(t('tree.$.when(new Date());').code)).toBe(
        'tree.$.when.set(new Date());'
      );
    });
  });

  describe('leaf updates → .update()', () => {
    it('rewrites an arrow function to .update()', () => {
      const { code, transformed } = t('tree.$.count(n => n + 1);');
      expect(norm(code)).toBe('tree.$.count.update(n => n + 1);');
      expect(transformed).toBe(1);
    });

    it('rewrites a parenthesised/typed arrow to .update()', () => {
      expect(norm(t('tree.$.count((n: number) => n + 1);').code)).toBe(
        'tree.$.count.update((n: number) => n + 1);'
      );
    });

    it('rewrites a block-bodied arrow to .update()', () => {
      expect(
        norm(t('tree.$.tags(tags => { return [...tags, "x"]; });').code)
      ).toBe(norm('tree.$.tags.update(tags => { return [...tags, "x"]; });'));
    });

    it('rewrites a function expression to .update()', () => {
      expect(norm(t('tree.$.count(function (n) { return n + 1; });').code)).toBe(
        norm('tree.$.count.update(function (n) { return n + 1; });')
      );
    });

    it('rewrites an async arrow to .update()', () => {
      expect(norm(t('tree.$.count(async n => n + 1);').code)).toBe(
        'tree.$.count.update(async n => n + 1);'
      );
    });

    it('treats an arrow returning an object literal as an update', () => {
      expect(norm(t('tree.$.user(u => ({ ...u, age: 31 }));').code)).toBe(
        norm('tree.$.user.update(u => ({ ...u, age: 31 }));')
      );
    });

    it('does NOT treat an identifier that happens to hold a function as an update', () => {
      // Statically indistinguishable from a value — documents the boundary of
      // what an AST-only transform can know.
      expect(norm(t('tree.$.count(updater);').code)).toBe(
        'tree.$.count.set(updater);'
      );
    });
  });

  describe('reads are never rewritten', () => {
    it.each([
      'const v = tree.$.count();',
      'const n = tree.$.user.profile.name();',
      'if (tree.$.active()) { go(); }',
      'function f() { return tree.$.items().length; }',
      'const sum = tree.$.a() + tree.$.b();',
      'console.log(tree.$.user());',
    ])('%s', (src) => {
      const { code, transformed } = t(src);
      expect(norm(code)).toBe(norm(src));
      expect(transformed).toBe(0);
    });

    it('leaves a read used as an argument to another call alone', () => {
      const { transformed } = t('doThing(tree.$.count());');
      expect(transformed).toBe(0);
    });
  });

  describe('idempotency — explicit form is preserved', () => {
    it('does not double-transform .set()', () => {
      const { code, transformed } = t("tree.$.name.set('Jane');");
      expect(norm(code)).toBe("tree.$.name.set('Jane');");
      expect(transformed).toBe(0);
    });

    it('does not double-transform .update()', () => {
      const { code, transformed } = t('tree.$.count.update(n => n + 1);');
      expect(norm(code)).toBe('tree.$.count.update(n => n + 1);');
      expect(transformed).toBe(0);
    });

    it('running the transform twice is a fixed point', () => {
      const once = t("tree.$.name('Jane'); tree.$.count(n => n + 1);").code;
      const twice = t(once).code;
      expect(norm(twice)).toBe(norm(once));
      expect(t(once).transformed).toBe(0);
    });

    it('transformed callable form equals hand-written explicit form', () => {
      const callable = "tree.$.name('Jane'); tree.$.count(n => n + 1);";
      const explicit = "tree.$.name.set('Jane'); tree.$.count.update(n => n + 1);";
      expect(norm(t(callable).code)).toBe(norm(t(explicit).code));
    });
  });

  describe('path depth', () => {
    it('rewrites a leaf one level down', () => {
      expect(norm(t("tree.$.name('x');").code)).toBe("tree.$.name.set('x');");
    });

    it('rewrites a deeply nested leaf', () => {
      expect(
        norm(t("tree.$.a.b.c.d.e.f('deep');").code)
      ).toBe("tree.$.a.b.c.d.e.f.set('deep');");
    });

    it('rewrites several distinct paths in one file', () => {
      const src = `tree.$.a('1');
tree.$.b.c('2');
tree.$.d.e.f('3');`;
      const { code, transformed } = t(src);
      expect(transformed).toBe(3);
      expect(code).toContain("tree.$.a.set('1')");
      expect(code).toContain("tree.$.b.c.set('2')");
      expect(code).toContain("tree.$.d.e.f.set('3')");
    });
  });

  describe('root identifiers', () => {
    it('defaults to `tree` only', () => {
      expect(t("store.$.name('x');").transformed).toBe(0);
      expect(t("tree.$.name('x');").transformed).toBe(1);
    });

    it('accepts a configured root', () => {
      expect(tr("store.$.name('x');", ['store']).code).toContain(
        "store.$.name.set('x')"
      );
    });

    it('accepts multiple configured roots', () => {
      const { code, transformed } = tr(
        "tree.$.a('1'); store.$.b('2'); other.$.c('3');",
        ['tree', 'store']
      );
      expect(transformed).toBe(2);
      expect(code).toContain("tree.$.a.set('1')");
      expect(code).toContain("store.$.b.set('2')");
      expect(code).toContain("other.$.c('3')"); // untouched
    });

    it('leaves unrelated objects alone', () => {
      const src = `console.log('hi');
foo.bar(1);
this.service.load(2);
obj.a.b.c(3);`;
      expect(t(src).transformed).toBe(0);
    });

    it('does not transform a bare identifier call', () => {
      expect(t("doThing('x');").transformed).toBe(0);
    });
  });

  describe('documented limitations (pinned so a fix is a visible change)', () => {
    it('LIMITATION: `this.tree.$` is not transformed — the chain walk stops at `this`', () => {
      // Consequence: in an Angular component (`this.tree.$.count(5)`), the
      // callable form silently does nothing, which is the exact failure the
      // package exists to prevent. Configuring rootIdentifiers does not help,
      // because the root here is `this`, not an identifier.
      expect(t('this.tree.$.count(5);').transformed).toBe(0);
      expect(tr('this.tree.$.count(5);', ['tree']).transformed).toBe(0);
    });

    it('LIMITATION: optional chaining is not transformed', () => {
      const src = "tree?.$.user?.name('Alice');";
      expect(t(src).transformed).toBe(0);
      expect(norm(t(src).code)).toBe(norm(src));
    });

    it('computed member access IS transformed', () => {
      // Not a limitation — the rewrite appends to whatever callee it found.
      expect(norm(t("tree.$['count'](5);").code)).toBe(
        "tree.$['count'].set(5);"
      );
    });

    it('DEFECT: a branch (node) call is rewritten, and nodes have no .set()', () => {
      // Nodes are callable by nature; this call was already correct and needed
      // no transform. Rewriting it produces `.set` on a NodeAccessor, which is
      // undefined at runtime → TypeError.
      expect(norm(t("tree.$.user.profile({ email: 'x' });").code)).toBe(
        norm("tree.$.user.profile.set({ email: 'x' });")
      );
    });

    it('DEFECT: entityMap / marker methods are rewritten', () => {
      expect(norm(t('tree.$.users.addOne({ id: 1 });').code)).toBe(
        norm('tree.$.users.addOne.set({ id: 1 });')
      );
      expect(norm(t('tree.$.status.setError(err);').code)).toBe(
        'tree.$.status.setError.set(err);'
      );
    });

    it('DEFECT: marker reads taking an argument are rewritten', () => {
      expect(norm(t('tree.$.users.where(u => u.active);').code)).toBe(
        'tree.$.users.where.update(u => u.active);'
      );
      expect(norm(t('tree.$.users.byId(7);').code)).toBe(
        'tree.$.users.byId.set(7);'
      );
    });
  });

  describe('syntax coverage', () => {
    it('parses and transforms inside TypeScript constructs', () => {
      const src = `class C {
  private readonly tree = signalTree({ count: 0 });
  bump(): void {
    tree.$.count(1 as number);
  }
}`;
      expect(t(src).code).toContain('tree.$.count.set(1 as number)');
    });

    it('parses generics without choking', () => {
      const src = 'const x = load<Foo>(); tree.$.foo(x);';
      expect(t(src).code).toContain('tree.$.foo.set(x)');
    });

    it('parses JSX/TSX files', () => {
      const src = 'const el = <div onClick={() => tree.$.count(1)} />;';
      expect(t(src).code).toContain('tree.$.count.set(1)');
    });

    it('transforms inside callbacks and control flow', () => {
      const src = `items.forEach((item) => {
  if (item.ok) {
    tree.$.lastId(item.id);
  } else {
    tree.$.errors(e => [...e, item.id]);
  }
});`;
      const { code, transformed } = t(src);
      expect(transformed).toBe(2);
      expect(code).toContain('tree.$.lastId.set(item.id)');
      expect(code).toContain('tree.$.errors.update');
    });

    it('transforms inside a try/catch and a loop', () => {
      const src = `for (const n of nums) { tree.$.n(n); }
try { tree.$.ok(true); } catch { tree.$.ok(false); }`;
      expect(t(src).transformed).toBe(3);
    });

    it('preserves comments', () => {
      const src = `// keep me
tree.$.name('Jane'); // trailing`;
      const { code } = t(src);
      expect(code).toContain('keep me');
      expect(code).toContain('trailing');
    });

    it('preserves surrounding statements verbatim', () => {
      const src = `import { signalTree } from '@signaltree/core';
const tree = signalTree({ name: '' });
tree.$.name('Jane');
export default tree;`;
      const { code } = t(src);
      expect(code).toContain("import { signalTree } from '@signaltree/core'");
      expect(code).toContain('export default tree');
      expect(code).toContain("tree.$.name.set('Jane')");
    });
  });

  describe('transform accounting', () => {
    it('reports zero for a file with nothing to do', () => {
      const { code, transformed } = t('const a = 1; export const b = a + 1;');
      expect(transformed).toBe(0);
      expect(code).toContain('const a = 1');
    });

    it('counts only the calls it rewrote', () => {
      const src = `tree.$.a('1');
const r = tree.$.a();
tree.$.b.set('2');
tree.$.c(n => n + 1);`;
      expect(t(src).transformed).toBe(2);
    });

    it('handles an empty file', () => {
      const { code, transformed } = t('');
      expect(transformed).toBe(0);
      expect(code.trim()).toBe('');
    });

    it('is stable across a large file', () => {
      const lines = Array.from(
        { length: 200 },
        (_, i) => `tree.$.field${i}(${i});`
      ).join('\n');
      const { code, transformed } = t(lines);
      expect(transformed).toBe(200);
      expect(code).toContain('tree.$.field0.set(0)');
      expect(code).toContain('tree.$.field199.set(199)');
    });
  });
});

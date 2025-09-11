import { transformCode } from './ast-transform';

describe('ast transform', () => {
  it('transforms set calls', () => {
    const src = `tree.$.user.name('John');`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree'],
    });
    expect(code).toContain("tree.$.user.name.set('John')");
    expect(transformed).toBe(1);
  });
  it('transforms update calls', () => {
    const src = `tree.$.count(n => n + 1);`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree'],
    });
    expect(code).toContain('tree.$.count.update');
    expect(transformed).toBe(1);
  });
  it('leaves getters untouched', () => {
    const src = `const v = tree.$.count();`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree'],
    });
    expect(code).toContain('tree.$.count()');
    expect(transformed).toBe(0);
  });

  it('transforms calls on additional root identifiers (e.g., store)', () => {
    const src = `store.$.todos([{ id: 1 }]);
store.$.todos(items => items);
const x = store.$.todos();`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree', 'store'],
    });
    // pretty-printer may add whitespace/newlines inside arrays/objects
    expect(code).toMatch(/store\.\$\.todos\.set\(\[\{\s*id:\s*1\s*\}\]\)/);
    expect(code).toContain('store.$.todos.update');
    expect(code).toContain('store.$.todos()');
    expect(transformed).toBe(2);
  });

  it('does not double-transform already .set/.update calls', () => {
    const src = `tree.$.count.set(1);
tree.$.count.update(n => n + 1);`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree'],
    });
    expect(code).toContain('tree.$.count.set(1)');
    expect(code).toContain('tree.$.count.update');
    expect(transformed).toBe(0);
  });

  it('does not transform optional-chaining calls (documented limitation)', () => {
    const src = `tree?.$.user?.name('Alice');
const v = tree?.$.user?.name();`;
    const { code, transformed } = transformCode(src, {
      rootIdentifiers: ['tree'],
    });
    // Current algorithm only matches CallExpression with MemberExpression callee (no optional chain)
    expect(code).toContain("tree?.$.user?.name('Alice')");
    expect(code).toContain('tree?.$.user?.name()');
    expect(transformed).toBe(0);
  });
});

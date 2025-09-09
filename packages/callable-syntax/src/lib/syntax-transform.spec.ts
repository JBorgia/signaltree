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
});

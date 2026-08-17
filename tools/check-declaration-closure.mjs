#!/usr/bin/env node
/**
 * Declaration-closure gate.
 *
 * Emits core's declarations TWICE on the production plugin path — once with
 * `stripInternal: true` (what ships) and once with it false — then reports any
 * symbol that the stripped build still REFERENCES but no longer DECLARES. That
 * is the defect: a shipped `.d.ts` naming a type it does not declare, which is
 * invisible under `skipLibCheck` and a hard error without it.
 *
 * WHY DIFFERENTIAL AND NOT A SOURCE SCAN. An earlier scan used
 * `ts.getJSDocTags()` and was invalid: `stripInternal` acts on leading comment
 * RANGES, so an orphaned `@internal` block strips the NEXT declaration even
 * though the parser attributes no tags to it. That scan reported 3 defects; the
 * differential found instances it structurally could not see, including
 * `VisitTreeOptions`. Asking the production emitter directly needs no
 * reimplementation of TypeScript's internal-ness rules and is presentation
 * agnostic — ordinary type references, default type arguments, `typeof` value
 * queries, and orphaned comment blocks all fall out of the same measurement.
 *
 * THE PREDICATE IS LEXICAL, which has a trap worth knowing before editing any
 * docblock here: writing the literal token in prose ABOUT the tag re-triggers
 * stripping. Three repairs were attempted with explanatory comments naming the
 * tag and every one of them silently failed, with declaration counts unchanged.
 * Say "not for public use" — never spell the tag.
 *
 * KNOWN APPROXIMATIONS, deliberately not fixed yet:
 *   - Dangling EXPORT SPECIFIERS are not followed, so a value re-export of a
 *     stripped declaration is under-reported (`createFormSignal` was invisible
 *     here and had to be caught by direct measurement).
 *   - `declared` is keyed on bare identifier, so a same-named declaration in an
 *     unrelated module can mask a genuinely missing one. Closure identity should
 *     become module-qualified before this is trusted as the sole Gate-B oracle.
 *
 * Usage:  node tools/check-declaration-closure.mjs [scratchDir]
 * Exits non-zero when any stripped-but-referenced symbol is found.
 */
import { rollup } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import ts from 'typescript';
import {
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
async function emit(out, strip) {
  rmSync(out, { recursive: true, force: true });
  const b = await rollup({
    input: ['packages/core/src/index.ts', 'packages/core/src/authoring.ts'],
    external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    plugins: [
      typescript({
        tsconfig: 'packages/core/tsconfig.lib.prod.json',
        declaration: true,
        declarationDir: out,
        outDir: out,
        stripInternal: strip,
        outputToFilesystem: true,
      }),
    ],
    onwarn: () => {},
  });
  await b.write({ dir: out, format: 'esm' });
  await b.close();
}
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}
function analyze(root) {
  const declared = new Map(),
    perFile = [];
  for (const f of walk(root)) {
    const sf = ts.createSourceFile(
      f,
      readFileSync(f, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const localDecl = new Set(),
      imported = new Set(),
      refs = new Set();
    const visit = (n) => {
      if (
        (ts.isInterfaceDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) ||
          ts.isClassDeclaration(n) ||
          ts.isEnumDeclaration(n) ||
          ts.isFunctionDeclaration(n)) &&
        n.name
      ) {
        localDecl.add(n.name.getText());
        declared.set(n.name.getText(), f);
      }
      if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations)
          if (ts.isIdentifier(d.name)) {
            localDecl.add(d.name.text);
            declared.set(d.name.text, f);
          }
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
        const cl = n.importClause ?? n.exportClause;
        for (const e of cl?.elements ?? []) imported.add(e.name.getText());
        if (cl?.name) imported.add(cl.name.getText());
        return;
      }
      if (ts.isTypeReferenceNode(n))
        refs.add(
          (ts.isQualifiedName(n.typeName)
            ? n.typeName.left
            : n.typeName
          ).getText()
        );
      if (ts.isTypeQueryNode(n))
        refs.add(
          (ts.isQualifiedName(n.exprName)
            ? n.exprName.left
            : n.exprName
          ).getText()
        );
      ts.forEachChild(n, visit);
    };
    visit(sf);
    perFile.push({ f, localDecl, imported, refs });
  }
  return { declared, perFile };
}
const SP = process.argv[2] ?? join(process.cwd(), 'tmp', 'decl-closure');
await emit(join(SP, 'e1'), true);
await emit(join(SP, 'e0'), false);
const T = analyze(join(SP, 'e1')),
  F = analyze(join(SP, 'e0'));
const broken = new Map();
for (const { f, localDecl, imported, refs } of T.perFile)
  for (const r of refs) {
    if (
      localDecl.has(r) ||
      imported.has(r) ||
      T.declared.has(r) ||
      !F.declared.has(r)
    )
      continue;
    if (!broken.has(r)) broken.set(r, new Set());
    broken.get(r).add(f.replace(join(SP, 'e1') + '/', ''));
  }
console.log(`TRUE declarations=${T.declared.size}  FALSE=${F.declared.size}`);
console.log(`stripped-but-referenced=${broken.size}`);
for (const [n, fs] of [...broken].sort())
  console.log(`  ${n}  <- ${[...fs].join(', ')}`);
if (broken.size) {
  console.error(
    '\nA shipped declaration references a symbol it does not declare.'
  );
  process.exit(1);
}
console.log('Declaration closure is self-contained.');

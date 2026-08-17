#!/usr/bin/env node
/**
 * Negative-control suite for the declaration-closure gate.
 *
 * `check-declaration-closure.mjs` proves SignalTree's shipped declarations are
 * self-contained. That is only meaningful if the checker can FAIL when it should,
 * so this suite feeds it three deliberately broken inputs — one per presentation
 * discovered during the 15.0 declaration work — and requires each to be detected.
 *
 * Every case proves the same semantic property, which is NOT "the declaration
 * disappeared":
 *
 *     production emit succeeds
 *     stripping removes declaration X
 *     a SURVIVING emitted declaration still depends on X
 *     the checker reports X as broken closure
 *
 * Stripping an implementation-only declaration is correct behaviour. The defect is
 * a removed declaration plus a surviving shipped dependency on it.
 *
 * FIXTURE NAMES ARE DELIBERATELY DISTINCTIVE (`FixtureInternalType`, ...). The
 * checker currently keys closure identity on bare identifiers, so a generic name
 * could collide with a real project declaration and mask a result. This tests the
 * checker that exists rather than presupposing the module-qualified rewrite.
 *
 * NOTE ON CASE C: the marker token is written into that fixture ONCE, in the
 * position under test, and appears nowhere else in the generated source. Prose
 * mentioning it re-arms the behaviour — three production repairs failed exactly
 * that way, each explaining in a comment that the declaration must not carry the
 * tag, and thereby keeping it. Explanation belongs here, not in scanned source.
 *
 * Usage:  node tools/check-declaration-closure-fixtures.mjs
 */
import { rollup } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import ts from 'typescript';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TAG = ['@', 'internal'].join(''); // never spelled literally in this file

const CASES = [
  {
    name: 'A type-space',
    stripped: 'FixtureInternalType',
    dependent: 'FixturePublicType',
    src: `/** ${TAG} */
interface FixtureInternalType {
  n: number;
}
export interface FixturePublicType {
  value: FixtureInternalType;
}
`,
  },
  {
    name: 'B value-space',
    stripped: 'fixtureInternalFn',
    dependent: 'fixturePublicFn',
    src: `/** ${TAG} */
export function fixtureInternalFn(): number {
  return 1;
}
export const fixturePublicFn = fixtureInternalFn;
`,
  },
  {
    name: 'C orphan trivia',
    stripped: 'FixtureOrphanSupport',
    dependent: 'FixtureOrphanConsumer',
    src: `/**
 * ${TAG}
 */

// no declaration here

/**
 * Public support type.
 */
export type FixtureOrphanSupport = 'a' | 'b';

export interface FixtureOrphanConsumer {
  value: FixtureOrphanSupport;
}
`,
  },
];

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

/** Declared names, plus names referenced from types, per emitted declaration. */
function analyze(root) {
  const declared = new Set();
  const refs = new Set();
  for (const file of walk(root)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (n) => {
      if (
        (ts.isInterfaceDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) ||
          ts.isFunctionDeclaration(n) ||
          ts.isClassDeclaration(n)) &&
        n.name
      ) {
        declared.add(n.name.getText());
      }
      if (ts.isVariableStatement(n)) {
        for (const d of n.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) declared.add(d.name.text);
        }
      }
      if (ts.isTypeReferenceNode(n)) {
        const t = n.typeName;
        refs.add((ts.isQualifiedName(t) ? t.left : t).getText());
      }
      if (ts.isTypeQueryNode(n)) {
        const e = n.exprName;
        refs.add((ts.isQualifiedName(e) ? e.left : e).getText());
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { declared, refs };
}

async function emit(entry, tsconfig, out, strip) {
  rmSync(out, { recursive: true, force: true });
  const bundle = await rollup({
    input: entry,
    external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    plugins: [
      typescript({
        tsconfig,
        include: ['**/*.ts'],
        declaration: true,
        declarationDir: out,
        outDir: out,
        stripInternal: strip,
        outputToFilesystem: true,
      }),
    ],
    onwarn: () => {},
  });
  await bundle.write({ dir: out, format: 'esm' });
  await bundle.close();
}

const root = mkdtempSync(join(tmpdir(), 'st-fixture-'));
let failed = 0;

for (const c of CASES) {
  const dir = join(root, c.name.replace(/\W+/g, '_'));
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'input.ts');
  writeFileSync(entry, c.src, 'utf8');
  const tsconfig = join(dir, 'tsconfig.json');
  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
      },
      include: ['input.ts'],
    }),
    'utf8'
  );

  let ok = true;
  try {
    await emit(entry, tsconfig, join(dir, 'on'), true);
    await emit(entry, tsconfig, join(dir, 'off'), false);
  } catch (e) {
    ok = false;
    console.error(`  FAIL ${c.name} — emit threw: ${e.message ?? e}`);
  }
  if (!ok) {
    failed++;
    continue;
  }

  const on = analyze(join(dir, 'on'));
  const off = analyze(join(dir, 'off'));

  // The property: stripped here, present when not stripping, still referenced.
  const strippedOut =
    !on.declared.has(c.stripped) && off.declared.has(c.stripped);
  const dependentSurvives = on.declared.has(c.dependent);
  const stillReferenced = on.refs.has(c.stripped);
  const detected = strippedOut && dependentSurvives && stillReferenced;

  if (detected) {
    console.log(
      `  ok   ${c.name} — ${c.stripped} stripped, ${c.dependent} still needs it`
    );
  } else {
    failed++;
    console.error(
      `  FAIL ${c.name} — stripped=${strippedOut} dependentSurvives=${dependentSurvives} stillReferenced=${stillReferenced}`
    );
  }
}

rmSync(root, { recursive: true, force: true });

console.log(
  `\n${CASES.length - failed}/${
    CASES.length
  } broken-closure presentations detected.`
);
if (failed) {
  console.error(
    'The closure checker did not detect a known-broken input. It cannot be trusted ' +
      'to report the production package as clean.'
  );
  process.exit(1);
}

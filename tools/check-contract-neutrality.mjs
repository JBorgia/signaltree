#!/usr/bin/env node
/**
 * Contract-neutrality gate.
 *
 * Every `*.contract.ts` under `packages/<pkg>/src` is bundled with `@angular/*`
 * resolution configured as a HARD BUILD ERROR. If the module's transitive
 * closure touches a framework, the build fails and so does this gate.
 *
 * WHY A BUNDLER AND NOT A LINT RULE. Lint sees one file. The property that
 * matters is transitive: a contract module is only neutral if NOTHING it
 * reaches imports a framework. A rule banning `@angular/*` in `*.contract.ts`
 * would pass while the file imported a sibling that imported Angular. Only
 * resolving the closure proves it, which is why the throwaway probes used
 * during the marker splits became this.
 *
 * IT ALSO GUARDS TREE-SHAKING, which is the non-obvious half. Each marker
 * registers its builtin processor LAZILY, on first call to its authorship
 * factory (`stored()`, `asyncSource()`, ...), so a bundle that never calls the
 * factory never pays for the machinery. That registration necessarily names the
 * Angular realization. So if a future cleanup "simplifies" the split by moving
 * registration to a contract module's top level, the realization joins the
 * closure, this gate fails, and the tree-shaking property is defended by a test
 * rather than by a comment nobody reads.
 *
 * A contract may depend on other neutral peers — `rxjs` types, for example.
 * Neutral means "loads where the FRAMEWORK is absent", not "zero dependencies".
 *
 * Usage:  node tools/check-contract-neutrality.mjs
 */
import { build } from 'esbuild';
import { readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Frameworks a contract module must never reach. */
const FORBIDDEN = /^(@angular\/|react$|react-dom|vue$|svelte|solid-js|preact)/;

function findContracts(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) findContracts(full, out);
    else if (name.endsWith('.contract.ts')) out.push(full);
  }
  return out;
}

const packagesDir = join(ROOT, 'packages');
const contracts = findContracts(packagesDir).sort();

if (contracts.length === 0) {
  console.error('No *.contract.ts modules found. Did the layout change?');
  process.exit(1);
}

const forbidPlugin = {
  name: 'forbid-frameworks',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.path.startsWith('.') || args.path.startsWith('/')) return null;
      if (!FORBIDDEN.test(args.path)) return null;
      return {
        errors: [
          {
            text:
              `NEUTRALITY VIOLATION: "${args.path}" is reachable from this ` +
              `contract (imported by ${relative(ROOT, args.importer) || 'entry'})`,
          },
        ],
      };
    });
  },
};

const tmp = mkdtempSync(join(tmpdir(), 'st-contract-'));
let failed = 0;

for (const file of contracts) {
  const rel = relative(ROOT, file);
  const entry = join(tmp, 'e.ts');
  writeFileSync(entry, `export * from ${JSON.stringify(file)};\n`, 'utf8');
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      logLevel: 'silent',
      plugins: [forbidPlugin],
      // Neutral third-party peers are allowed; they are not frameworks.
      external: ['rxjs', 'rxjs/*', 'tslib', '@standard-schema/spec'],
    });
    console.log(`  ok   ${rel}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${rel}`);
    for (const err of e.errors ?? [{ text: e.message }]) {
      console.error(`         ${err.text}`);
    }
  }
}

console.log(
  `\n${contracts.length - failed}/${contracts.length} contract modules are framework-neutral.`
);
if (failed) {
  console.error(
    'A contract module reaches a framework. Either the wrong thing moved into ' +
      'the contract, or a realization import crept back in.'
  );
  process.exit(1);
}

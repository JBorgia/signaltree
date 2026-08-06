#!/usr/bin/env node
/**
 * Install the packed tarball into a throwaway project and TYPE-CHECK real
 * consumer code against it.
 *
 * `verify-tarball-consumer.mjs` proves Node's resolver can find every subpath.
 * That is a different question from "do the shipped types work", and the gap
 * between them is where the expensive failures live: a `.d.ts` that references
 * a package we do not publish, a type dropped from the barrel, an `exports` map
 * whose `types` condition is missing for a subpath. All of those resolve fine
 * at runtime and break every consumer at compile time.
 *
 * Checked under BOTH module resolutions, because they fail differently:
 *
 *   - `bundler`  — what an Angular CLI app uses. Forgiving about `exports`.
 *   - `node16`   — strict. A subpath missing a `types` condition resolves under
 *                  `bundler` and hard-fails here, which is the single most
 *                  common way a published Angular library breaks TS consumers.
 *
 * The sample code below is deliberately the API the README and the agent skill
 * TEACH, not a minimal smoke — if the docs tell people to write it, it has to
 * compile against the tarball.
 *
 * Usage: node tools/verify-consumer-typecheck.mjs
 *        (requires dist/packages/core — run the build first)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `skipLibCheck: true` is the Angular CLI default and what essentially every
 * consumer runs, so it is what this gate enforces. `--strict-libs` flips it to
 * audit our own `.d.ts` — currently RED, and deliberately not gated: rollup's
 * declaration emitter drops several exported types while still referencing them
 * (`DefaultKey`, `EntityMapComputedSlices`, `EntityMapMarkerWithSlices`,
 * `PathNotifierHandler`, `HydrateMode`), and `isDev` is re-exported from
 * `lib/constants` which does not export it. Tracked, not hidden — see the note
 * in AGENTS.md. Re-exporting those names from the barrel does NOT fix it and
 * makes it worse (the barrel then points at declarations that still are not
 * emitted).
 */
const STRICT_LIBS = process.argv.includes('--strict-libs');
const ROOT = process.cwd();
const CORE_DIST = join(ROOT, 'dist/packages/core');

if (!existsSync(CORE_DIST)) {
  console.error('❌ dist/packages/core not found — run the build first.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'st-consumer-tsc-'));
console.log('📦 Packing @signaltree/core and type-checking a real consumer\n');

// --- pack -------------------------------------------------------------------
execFileSync('npm', ['pack', '--pack-destination', work], {
  cwd: CORE_DIST,
  stdio: 'pipe',
});
const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
if (!tarball) {
  console.error('❌ npm pack produced no tarball.');
  process.exit(1);
}

// --- consumer project -------------------------------------------------------
const proj = join(work, 'consumer');
mkdirSync(join(proj, 'src'), { recursive: true });
writeFileSync(
  join(proj, 'package.json'),
  // `type: module` matters for the node16 arm: without it the consumer is CJS
  // and every ESM import reports TS1479, which says nothing about our package.
  JSON.stringify(
    { name: 'consumer', version: '1.0.0', private: true, type: 'module' },
    null,
    2
  )
);

/** The API the docs actually teach. */
const SAMPLE = `
import {
  signalTree,
  entityMap,
  status,
  stored,
  form,
  loader,
  compared,
  byKeys,
  timeTravel,
  serialization,
  batching,
} from '@signaltree/core';
import { createIndexedDBAdapter } from '@signaltree/core/storage';
import { onHydrateDecision } from '@signaltree/core/authoring';

type User = { id: number; name: string; version: number };
type Profile = { name: string; email: string; [k: string]: unknown };

const tree = signalTree({
  count: 0,
  user: { name: 'Ada', age: 36 },
  users: entityMap<User, number>({ selectId: (u: User) => u.id }),
  remote: entityMap<User, number>({
    selectId: (u: User) => u.id,
    load: loader(async () => [] as User[], {
      persist: { adapter: createIndexedDBAdapter(), key: 'users' },
    }),
  }),
  job: status<Error>(),
  theme: stored('theme', 'light' as 'light' | 'dark'),
  profile: form<Profile>({ initial: { name: '', email: '' } }),
  cached: compared({ id: 1, name: 'x', version: 1 } as User, byKeys<User>('id', 'version')),
})
  // .with() takes ONE enhancer and is CHAINED. Passing several at once is
  // TS2554 (Expected 1 arguments, but got 3) — worth having right in the
  // sample, because it is the shape a newcomer reaches for first.
  .with(timeTravel())
  .with(serialization())
  .with(batching());

// Reads
const n: number = tree.$.count();
const whole: { count: number } = tree() as { count: number };
const rows: User[] = tree.$.users.all();
const isLoading: boolean = tree.$.job.loading();
const themeValue: 'light' | 'dark' = tree.$.theme();
const formValues: Profile = tree.$.profile();

// Leaf writes — .set()/.update(), NOT leaf(value)
tree.$.count.set(5);
tree.$.count.update((c: number) => c + 1);

// Branch + root writes ARE callable
tree.$.user({ name: 'Grace' });
tree({ count: 9 });

// Marker APIs
tree.$.users.addOne({ id: 1, name: 'a', version: 1 });
tree.$.users.updateOne(1, { name: 'b' });
tree.$.job.setLoaded();
tree.$.profile.patch({ name: 'z' });

// Enhancer methods
tree.undo();
tree.redo();
const json: string = tree.serialize();
tree.deserialize(json);
tree.batch(() => tree.$.count.set(0));

// Authoring seam
const off = onHydrateDecision((e: { reason: string }) => void e.reason);
off();

export const _used = [n, whole, rows, isLoading, themeValue, formValues];
`;
writeFileSync(join(proj, 'src', 'main.ts'), SAMPLE);

// --- install ----------------------------------------------------------------
console.log('  installing tarball...');
execFileSync(
  'npm',
  [
    'install',
    '--no-audit',
    '--no-fund',
    '--silent',
    join(work, tarball),
    `@angular/core@${process.env['NG_VERSION'] || '^22.0.0'}`,
    'rxjs@^7.0.0',
    'typescript@^5.6.0',
  ],
  { cwd: proj, stdio: 'pipe' }
);

// --- typecheck under both resolutions ---------------------------------------
const RESOLUTIONS = [
  { name: 'bundler', module: 'esnext', moduleResolution: 'bundler' },
  { name: 'node16', module: 'node16', moduleResolution: 'node16' },
];

let failed = false;
for (const r of RESOLUTIONS) {
  writeFileSync(
    join(proj, `tsconfig.${r.name}.json`),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: !STRICT_LIBS, // default matches Angular CLI; --strict-libs to audit our .d.ts
          target: 'es2022',
          module: r.module,
          moduleResolution: r.moduleResolution,
          experimentalDecorators: true,
          lib: ['es2022', 'dom'],
          types: [],
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    )
  );
  try {
    execFileSync('npx', ['tsc', '-p', `tsconfig.${r.name}.json`], {
      cwd: proj,
      stdio: 'pipe',
    });
    console.log(`  ✅ moduleResolution: ${r.name}`);
  } catch (err) {
    failed = true;
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    console.log(`  ❌ moduleResolution: ${r.name}`);
    out
      .split('\n')
      .filter((l) => l.includes('error TS'))
      .slice(0, 60)
      .forEach((l) => console.log(`       ${l.trim()}`));
  }
}

if (failed) {
  console.error(
    '\n❌ The published types do not compile for a consumer.\n' +
      '   This is invisible to `npm pack` and to require.resolve() — both pass on\n' +
      '   a package whose .d.ts files are broken.'
  );
  process.exit(1);
}
console.log(
  '\n✅ Consumer type-check passed under both bundler and node16 resolution.'
);

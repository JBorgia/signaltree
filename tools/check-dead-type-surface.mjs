#!/usr/bin/env node
/**
 * Fail the build on public type surface that nothing implements.
 *
 * The defect this exists for, found in the 14.1.2 audit: a member declared on
 * an exported interface, documented as doing something, referenced by no
 * implementation anywhere in the workspace. It type-checks, it reads as
 * working, and it silently does nothing. Four separate instances shipped:
 *
 *   - `EntityConfig.hooks.beforeAdd/beforeUpdate/beforeRemove` and
 *     `TapHandlers.onChange` — declared Dec 2025, never wired (8 months).
 *   - `OptimizedUpdateMethods` — typed `@signaltree/enterprise`'s diff engine
 *     and outlived the package's removal in 14.0.0.
 *   - `TreeConfig.maxCacheSize/trackPerformance/useStructuralSharing` — zero
 *     consumers, and they survived the 14.1.1 sweep that removed their
 *     sibling `enableTimeTravel` for exactly this reason.
 *   - `GuardrailsConfig.suppression.*` — guardrails declared a flag to honour
 *     `suppressGuardrails` that only `@signaltree/schema` ever honoured.
 *
 * Every runtime diagnostic in this repo (ST2008, ST2022, ST2023, the hydrate
 * decision channel) exists to catch silent no-ops. None of them can see this
 * one, because it fails at the type layer where nothing executes.
 *
 * Heuristic, deliberately: a member is REPORTED only when its identifier
 * appears nowhere outside declaration files. That underreports (a member read
 * via a computed key is invisible) and can overreport, which is why
 * `ALLOWLIST` exists for the legitimate cases — phantom type brands carry no
 * runtime and never will.
 *
 * Usage: node tools/check-dead-type-surface.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/**
 * Files that only DECLARE. A reference inside one of these does not count as
 * an implementation — otherwise a member would "prove" itself by existing.
 *
 * Every `types.ts` / `*.types.ts` in the workspace, not just core's: the first
 * run of this tool only covered `lib/types.ts` and therefore missed the
 * enhancer, realtime and events type files entirely.
 */
const DECLARATION_FILES = [/\/types\.ts$/, /\.types\.ts$/, /\.d\.ts$/];

/** Roots scanned for implementations. */
const SCAN_ROOTS = ['packages', 'apps/demo/src', 'tools'];

/**
 * Members that are legitimately unreferenced at runtime.
 * Keep this list short and justified — every entry is a suppressed alarm.
 */
const ALLOWLIST = new Set([
  // Phantom type brands: exist to make a type nominal, carry no runtime.
  '__entitiesEnabled',
  '__entity',
  '__hasLoad',
  '__loadParams',
  '__params',
  '__isEntityMap',
  '__signalTreeLazy',
  '__brand',
]);

/** Members shorter than this are too collision-prone to judge. */
const MIN_NAME_LENGTH = 4;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') && !entry.includes('.spec.')) out.push(full);
  }
  return out;
}

/** Extract members declared inside `export interface X {}` / `export type X = {}`. */
function declaredMembers(source) {
  const found = new Map();
  const re = /export\s+(?:interface|type)\s+(\w+)[^{]*\{/g;
  let m;
  while ((m = re.exec(source))) {
    const owner = m.group ?? m[1];
    let depth = 1;
    let i = re.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    const body = source.slice(re.lastIndex, i);
    const memberRe = /^\s{2,8}(?:readonly\s+)?(\w+)\??\s*[?:(]/gm;
    let mm;
    while ((mm = memberRe.exec(body))) {
      if (!found.has(mm[1])) found.set(mm[1], new Set());
      found.get(mm[1]).add(owner);
    }
  }
  return found;
}

const allFiles = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));
const isDeclarationFile = (f) =>
  DECLARATION_FILES.some((re) => re.test(f.replace(/\\/g, '/')));

const declared = new Map();
for (const file of allFiles.filter(isDeclarationFile)) {
  const members = declaredMembers(readFileSync(file, 'utf8'));
  for (const [name, owners] of members) {
    if (!declared.has(name)) declared.set(name, { owners: new Set(), file });
    for (const o of owners) declared.get(name).owners.add(o);
  }
}

const implementationBlob = allFiles
  .filter((f) => !isDeclarationFile(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const dead = [];
for (const [name, info] of declared) {
  if (name.length < MIN_NAME_LENGTH || ALLOWLIST.has(name)) continue;
  const re = new RegExp(`\\b${name.replace(/[$^*+?.()|[\]{}]/g, '\\$&')}\\b`);
  if (!re.test(implementationBlob)) {
    dead.push({
      member: name,
      declaredIn: [...info.owners].sort(),
      file: relative(ROOT, info.file),
    });
  }
}

dead.sort((a, b) => a.member.localeCompare(b.member));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ dead }, null, 2));
} else if (dead.length) {
  console.error(
    `\nDead public type surface — ${dead.length} member(s) declared with no implementation anywhere:\n`
  );
  for (const d of dead) {
    console.error(
      `  ${d.member.padEnd(28)} on ${d.declaredIn.join(', ')}  (${d.file})`
    );
  }
  console.error(
    `\nEach of these type-checks and does nothing at runtime.\n` +
      `Implement it, delete it, or — if it is a phantom brand — add it to\n` +
      `ALLOWLIST in tools/check-dead-type-surface.mjs with a reason.\n`
  );
} else {
  console.log('No dead public type surface found.');
}

process.exit(dead.length ? 1 : 0);

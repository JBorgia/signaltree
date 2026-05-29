#!/usr/bin/env node
/**
 * lint-skills.mjs
 *
 * Type-checks every fenced TypeScript code block in docs/skills/**\/*.md against
 * the real built @signaltree/* d.ts files. Catches:
 *   - syntax / type errors
 *   - references to symbols not exported from the real public barrels
 *   - missing imports for symbols used
 *
 * Design:
 *   - Pure TypeScript compiler API (no `tsc` subprocess).
 *   - One ts.Program instance shared across every snippet in a single run.
 *   - `@signaltree/*` paths point at `dist/packages/<pkg>/src/index.d.ts` (the
 *     canonical `types` field in each published package.json).
 *   - Requires `dist/packages/*` to exist (run `npm run build:all` first).
 *
 * Skip mechanisms for intentional anti-pattern blocks:
 *   - ` ```ts wrong ` / ` ```ts bad ` info-string marker on the fence.
 *   - Leading `// @skip-lint` comment inside the block.
 *
 * Non-ts fences (html, bash, json, jsonc, ...) are ignored entirely.
 *
 * Snippets omit surrounding scaffolding. We wrap "loose" blocks (no top-level
 * `class` / `function` / `interface` / `import` of Angular decorators) in a
 * synthetic `async function __block() { ... }` so `await` and bare statements
 * are legal.
 *
 * Dependency-free aside from `typescript` (already a workspace devDep).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { readdir } from 'node:fs/promises';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'docs', 'skills');
const DIST_ROOT = path.join(REPO_ROOT, 'dist', 'packages');

// Map of @signaltree/* import specifier → absolute d.ts path in dist.
// Paths mirror each package.json `exports` field; leaves missing subpaths
// (events/testing, callable-syntax/augmentation, etc.) will surface as
// lint errors, which is the desired behaviour if a skill points at a
// subpath the package does not ship.
const SIGNALTREE_PATH_MAP = {
  '@signaltree/core': ['dist/packages/core/src/index.d.ts'],
  '@signaltree/core/presets': ['dist/packages/core/src/presets.d.ts'],
  '@signaltree/core/security': ['dist/packages/core/src/security.d.ts'],
  '@signaltree/core/edit-session': ['dist/packages/core/src/edit-session.d.ts'],
  '@signaltree/core/storage': ['dist/packages/core/src/storage.d.ts'],
  '@signaltree/core/rxjs-interop': ['dist/packages/core/src/rxjs-interop.d.ts'],
  '@signaltree/enterprise': ['dist/packages/enterprise/src/index.d.ts'],
  '@signaltree/ng-forms': ['dist/packages/ng-forms/src/index.d.ts'],
  '@signaltree/ng-forms/audit': ['dist/packages/ng-forms/src/audit/index.d.ts'],
  '@signaltree/callable-syntax': [
    'dist/packages/callable-syntax/src/index.d.ts',
  ],
  '@signaltree/callable-syntax/vite': [
    'dist/packages/callable-syntax/src/lib/vite-plugin.d.ts',
  ],
  '@signaltree/callable-syntax/webpack': [
    'dist/packages/callable-syntax/src/lib/webpack-plugin.d.ts',
  ],
  '@signaltree/callable-syntax/augmentation': [
    'dist/packages/callable-syntax/src/augmentation.d.ts',
  ],
  '@signaltree/guardrails': ['dist/packages/guardrails/src/index.d.ts'],
  '@signaltree/guardrails/factories': [
    'dist/packages/guardrails/src/factories.d.ts',
    'dist/packages/guardrails/src/factories/index.d.ts',
  ],
  '@signaltree/events': ['dist/packages/events/src/index.d.ts'],
  '@signaltree/events/nestjs': ['dist/packages/events/src/nestjs/index.d.ts'],
  '@signaltree/events/angular': ['dist/packages/events/src/angular/index.d.ts'],
  '@signaltree/events/testing': ['dist/packages/events/src/testing/index.d.ts'],
  '@signaltree/realtime': ['dist/packages/realtime/src/index.d.ts'],
  '@signaltree/realtime/supabase': [
    'dist/packages/realtime/src/supabase/index.d.ts',
  ],
  '@signaltree/schema': ['dist/packages/schema/src/index.d.ts'],
};

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function logInfo(msg) {
  console.log(`${color.cyan('[lint-skills]')} ${msg}`);
}
function logWarn(msg) {
  console.warn(`${color.yellow('[lint-skills]')} ${msg}`);
}
function logError(msg) {
  console.error(`${color.red('[lint-skills]')} ${msg}`);
}
function logOk(msg) {
  console.log(`${color.green('[lint-skills]')} ${msg}`);
}

function assertDistExists() {
  if (!existsSync(DIST_ROOT)) {
    logError(
      `Built packages missing at ${path.relative(REPO_ROOT, DIST_ROOT)}.`
    );
    logError('Run `npm run build:all` first.');
    process.exit(1);
  }
}

// Resolve each path-map entry to an absolute d.ts; skip entries whose files
// don't exist yet (the package may not have been built in this environment).
function resolveTsPaths() {
  const paths = {};
  const missing = [];
  for (const [spec, candidates] of Object.entries(SIGNALTREE_PATH_MAP)) {
    const resolved = candidates
      .map((rel) => path.join(REPO_ROOT, rel))
      .find((abs) => existsSync(abs));
    if (resolved) {
      paths[spec] = [resolved];
    } else {
      missing.push({ spec, candidates });
    }
  }
  return { paths, missing };
}

/**
 * Walk a directory tree and yield every *.md file under it.
 * Deterministic ordering (alphabetical per level) for stable reports.
 */
async function* walkMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'spec.md' &&
      entry.name !== 'uncompressed.md'
    ) {
      yield full;
    }
  }
}

/**
 * Extract fenced code blocks from a markdown string.
 * Only blocks tagged ts / typescript / tsx are returned — other languages
 * (html, bash, json, jsonc, …) are skipped.
 *
 * Supports skip markers on the info string:
 *   ```ts wrong
 *   ```ts bad
 *   ```ts skip
 * And a leading `// @skip-lint` comment anywhere in the first few lines
 * of the block body.
 */
function extractBlocks(markdown, filePath) {
  const lines = markdown.split('\n');
  const blocks = [];
  let inFence = false;
  let fenceLang = '';
  let fenceInfo = '';
  let fenceStartLine = 0; // 1-based
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openMatch = line.match(/^```\s*([A-Za-z0-9+_-]*)\s*(.*)$/);
    if (!inFence && openMatch) {
      inFence = true;
      fenceLang = (openMatch[1] || '').toLowerCase();
      fenceInfo = (openMatch[2] || '').trim().toLowerCase();
      fenceStartLine = i + 1;
      buffer = [];
      continue;
    }
    if (inFence && /^```\s*$/.test(line)) {
      // Closing fence.
      const lang = fenceLang;
      const info = fenceInfo;
      const code = buffer.join('\n');
      const isTs = lang === 'ts' || lang === 'typescript' || lang === 'tsx';
      if (isTs) {
        const infoSkip = /\b(wrong|bad|skip|anti-?pattern)\b/.test(info);
        const commentSkip = /^\s*\/\/\s*@skip-lint\b/m.test(
          code.split('\n').slice(0, 3).join('\n')
        );
        blocks.push({
          filePath,
          startLine: fenceStartLine,
          lang,
          info,
          code,
          skip: infoSkip || commentSkip,
          skipReason: infoSkip
            ? `fence info "${info}"`
            : commentSkip
            ? '// @skip-lint'
            : null,
        });
      }
      inFence = false;
      fenceLang = '';
      fenceInfo = '';
      buffer = [];
      continue;
    }
    if (inFence) {
      buffer.push(line);
    }
  }

  return blocks;
}

/**
 * Split a snippet into (import lines, body). All leading `import …;`
 * statements — including multi-line ones — get hoisted so the synthetic
 * wrapper function only sees statements that are legal inside a function
 * body. Supports `import { a,\n  b,\n} from 'x';` style and bare
 * `import 'x';` side-effect imports.
 *
 * State machine:
 *   prelude=true, inImport=false → blank/comment/import start
 *   inImport=true → keep collecting until line ends with `;` (outside a
 *     string, naïvely)
 */
function splitImports(code) {
  const lines = code.split('\n');
  const imports = [];
  const body = [];
  let inImport = false;
  let preludeOver = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (preludeOver) {
      body.push(line);
      continue;
    }
    if (inImport) {
      imports.push(line);
      if (/;\s*(\/\/.*)?$/.test(line) || /['"]\s*;?\s*$/.test(line)) {
        // Heuristic: end of import when line ends with `;` or a quoted module
        // specifier. This catches both `} from 'x';` and trailing `'x'`.
        if (/;\s*(\/\/.*)?$/.test(line)) inImport = false;
        else if (
          /from\s*['"][^'"]+['"]\s*;?\s*$/.test(line) ||
          /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(line)
        )
          inImport = false;
      }
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed === '' || trimmed.startsWith('//')) {
      imports.push(line);
      continue;
    }
    if (/^\s*import\b/.test(line)) {
      imports.push(line);
      // Single-line import?
      if (/;\s*(\/\/.*)?$/.test(line)) {
        inImport = false;
      } else {
        inImport = true;
      }
      continue;
    }
    // `declare` statements also need to live at module scope (TS1184 if
    // wrapped). Hoist them alongside imports — supports single-line forms
    // only; authors typing multi-line declares in skill snippets are
    // vanishingly rare.
    if (/^\s*declare\b/.test(line)) {
      imports.push(line);
      continue;
    }
    preludeOver = true;
    body.push(line);
  }
  return { imports: imports.join('\n'), body: body.join('\n') };
}

/**
 * Decide whether a block body already has a top-level declaration. If so,
 * emit as-is; otherwise wrap in `async function __block(){ ... }` so bare
 * statements compile. The wrapper also declares `this: any` so class-method-
 * style snippets don't choke on `this.tree`.
 */
function needsWrapper(body) {
  // Look for top-level (column-0) class/function/interface/type/enum/export.
  // Multi-line comments and blank lines are ok.
  const topLevel = body
    .split('\n')
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith(' ') &&
        !l.startsWith('\t') &&
        !l.startsWith('//') &&
        !l.startsWith('*') &&
        !l.startsWith('/*')
    );
  for (const l of topLevel) {
    if (
      /^(export\s+)?(async\s+)?(class|function|interface|type|enum|abstract|default)\b/.test(
        l
      )
    ) {
      return false;
    }
    if (/^export\b/.test(l)) {
      // Any top-level `export` (const / default / declare / {...}) means this
      // block is authored as a full module — don't wrap or we'll produce
      // "modifiers cannot appear here" errors.
      return false;
    }
    if (/^@[A-Z]/.test(l)) {
      // Angular decorator at top-level — definitely a class-style snippet.
      return false;
    }
  }
  return true;
}

/**
 * Produce the synthetic .ts file contents for a block.
 * Each block lives in its own file / module — the `export {}` footer forces
 * TS to treat the file as a module so `import` declarations behave.
 * A unique function name per block avoids "duplicate implementation" errors
 * across the shared Program.
 *
 * Accepts an optional set of identifier names to stub as `declare const X: any;`
 * inside the wrapper. These are used to quiet "Cannot find name" errors for
 * placeholders and chained-example variables, without hiding real errors
 * (wrong property, wrong type arg count, etc.).
 */
function assembleSnippet(block, blockId, stubNames = []) {
  const { imports, body } = splitImports(block.code);
  const wrap = needsWrapper(body);
  const fnName = `__block_${blockId}`;
  const header =
    '// auto-generated by lint-skills.mjs — do not edit\n' +
    '/* eslint-disable */\n';
  const footer = '\nexport {};\n';
  // Stub unknown names with a type that supports:
  //   - Generic calls:   X<T>() — needs an explicit generic call signature (TS2347 fires on `any`)
  //   - Property access: X.property — needs [k: string]: any index signature
  //   - Chaining:        X().with().$ — the return type `any` allows further access
  // We also add a `type X = any` alias for use in type-annotation positions.
  const stubBlock = stubNames.length
    ? stubNames
        .map(
          (n) =>
            `type ${n} = any;\n` +
            `declare const ${n}: { <T = any, U = any, V = any>(...args: any[]): any; [k: string]: any };`
        )
        .join('\n') + '\n'
    : '';
  if (wrap) {
    return (
      header +
      imports +
      '\n' +
      stubBlock +
      '// Wrapper so bare statements, `await`, and `this` references compile.\n' +
      `async function ${fnName}(this: any): Promise<void> {\n` +
      body +
      `\n}\nvoid ${fnName};\n` +
      footer
    );
  }
  return header + imports + '\n' + stubBlock + body + footer;
}

/**
 * Format a diagnostic against the ORIGINAL markdown fence position.
 * The synthetic file prepends header lines; we map each diagnostic's line
 * back to the fence-relative line, then to the markdown line.
 */
function formatDiagnostic(diag, block, tempFilePath) {
  const file = diag.file;
  if (!file) {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    return {
      path: block.filePath,
      line: block.startLine,
      code: diag.code,
      message,
      syntheticLocation: null,
    };
  }
  const { line, character } = file.getLineAndCharacterOfPosition(diag.start);
  const syntheticLineText = file.text.split('\n')[line] ?? '';

  // Map synthetic line → markdown line.
  // Build a lookup: walk synthetic file lines; find the first occurrence of
  // the fence body's first line, then map subsequent lines by offset.
  const markdownLine = mapSyntheticToMarkdown(
    block,
    tempFilePath,
    file.text,
    line
  );

  return {
    path: block.filePath,
    line: markdownLine,
    code: diag.code,
    message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
    snippet: syntheticLineText.trim(),
  };
}

/**
 * Cheap mapping: match the synthetic line text against the original block.
 */
const _mappingCache = new WeakMap();
function mapSyntheticToMarkdown(block, tempFilePath, syntheticText, synLine) {
  let cache = _mappingCache.get(block);
  if (!cache) {
    cache = buildLineMap(block, syntheticText);
    _mappingCache.set(block, cache);
  }
  const m = cache[synLine];
  if (m != null) return m;
  // Fallback: fence start.
  return block.startLine;
}

function buildLineMap(block, syntheticText) {
  const synLines = syntheticText.split('\n');
  const mdLines = block.code.split('\n');
  const map = new Array(synLines.length).fill(null);

  // Find the index in synthetic where the original import prelude begins
  // (first non-comment, non-blank line equal to mdLines[0] or matching by trim).
  let synIdx = 0;
  let mdIdx = 0;
  // Skip header lines ("// auto-generated", "/* eslint-disable */")
  while (
    synIdx < synLines.length &&
    (synLines[synIdx].startsWith('//') ||
      synLines[synIdx].startsWith('/*') ||
      synLines[synIdx].trim() === '')
  ) {
    synIdx++;
    // Don't advance mdIdx — header has no md counterpart.
  }
  // Now iterate; when synthetic line matches md line (by trim), record.
  // Wrapper lines (`async function __block`, `void __block;`) won't match
  // anything in the original and remain null.
  while (synIdx < synLines.length && mdIdx < mdLines.length) {
    const s = synLines[synIdx];
    const m = mdLines[mdIdx];
    if (s === m) {
      // +1 because block.startLine is the fence line; body starts at fence+1.
      map[synIdx] = block.startLine + 1 + mdIdx;
      synIdx++;
      mdIdx++;
    } else if (s.trim() === m.trim()) {
      map[synIdx] = block.startLine + 1 + mdIdx;
      synIdx++;
      mdIdx++;
    } else if (
      /^async function __block/.test(s) ||
      /^void __block;/.test(s) ||
      /^}\s*$/.test(s) ||
      s.trim() === ''
    ) {
      // Wrapper / blank line in synthetic — skip without advancing md.
      synIdx++;
    } else {
      // Lines drift apart (e.g. pure wrapper content). Advance synthetic only.
      synIdx++;
    }
  }
  return map;
}

/**
 * Main lint routine.
 */
async function main() {
  logInfo(`Linting skills under ${path.relative(REPO_ROOT, SKILLS_ROOT)}`);
  assertDistExists();
  const { paths, missing } = resolveTsPaths();
  if (missing.length > 0) {
    for (const m of missing) {
      logWarn(
        `Import spec ${
          m.spec
        } could not be resolved to a built d.ts (tried: ${m.candidates.join(
          ', '
        )}). Blocks importing it will fail.`
      );
    }
  }

  // Collect all blocks.
  const allBlocks = [];
  for await (const mdPath of walkMarkdown(SKILLS_ROOT)) {
    const text = readFileSync(mdPath, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const blocks = extractBlocks(text, mdPath);
    allBlocks.push(...blocks);
  }

  const linted = allBlocks.filter((b) => !b.skip);
  const skipped = allBlocks.filter((b) => b.skip);

  logInfo(
    `Found ${allBlocks.length} ts/tsx block(s) across ${
      new Set(allBlocks.map((b) => b.filePath)).size
    } file(s); linting ${linted.length}, skipping ${
      skipped.length
    } (wrong/bad/skip marker).`
  );

  if (linted.length === 0) {
    logOk('Nothing to lint.');
    return;
  }

  // Write synthetic .ts files inside the repo so Node-style module
  // resolution finds node_modules (Angular, Zod, etc.). Cleaned after.
  const tempRoot = path.join(REPO_ROOT, '.cache', 'skill-lint');
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });

  // Write an ambient-module stub file that lets snippets reference optional
  // peers (vite, webpack, @supabase/supabase-js, @nestjs/common) and common
  // relative placeholders ('./my-marker', './listing', './derived',
  // './events/user-created') without failing on missing modules. These stubs
  // only quiet TS2307 — they do NOT provide real types, so wrong API usage
  // against them will surface as other errors. That's fine: skill APIs for
  // those packages aren't the subject of this lint.
  const ambientStub = `// Auto-generated: ambient module stubs for optional peers / placeholders.
declare module 'vite' {
  export function defineConfig(config: any): any;
  const _default: any;
  export default _default;
}
declare module 'webpack' {
  export interface Configuration {
    [key: string]: any;
    plugins?: any[];
  }
  const _default: any;
  export default _default;
}
declare module '@supabase/supabase-js' {
  export function createClient(url: string, key: string, options?: any): any;
  export type SupabaseClient = any;
}
declare module '@nestjs/common' {
  export function Module(config: any): ClassDecorator;
  export function Injectable(config?: any): ClassDecorator;
  export function Controller(path?: string): ClassDecorator;
  export const _default: any;
}
// Augment ImportMeta for \`import.meta.env\` used in Vite-style examples.
interface ImportMeta {
  env: Record<string, string>;
}

// --- Pedagogical type aliases --------------------------------------------
// Skill snippets reference user-app type aliases that the doc comment
// instructs readers to "import from your own models". Provide \`any\`-typed
// stand-ins so the snippets type-check without forcing every fence to
// declare them inline. Real wrong-shape errors (calling \`Nullable\` with
// the wrong arity, etc.) still surface because we use generics.
type Nullable<T> = T | null;
type AppError = { message: string; cause?: unknown };
interface DriverDto { id: number; name: string; [k: string]: any }
interface TruckDto { id: number; [k: string]: any }
interface HaulerDto { id: number; [k: string]: any }
interface TicketDto { id: number; [k: string]: any }
interface FooDto { id: number; [k: string]: any }

// --- Test runner globals -------------------------------------------------
// Skill testing examples use vitest/jest globals. We don't ship those types
// to the lint program (it's noEmit, no test runner), so declare the few
// names skill snippets actually use.
declare const describe: (name: string, fn: () => void | Promise<void>) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;
declare const expect: any;
declare const jest: { fn: (impl?: any) => any; [k: string]: any };
declare const vi: { fn: (impl?: any) => any; mock: (mod: string, factory?: any) => void; [k: string]: any };
`;
  const ambientPath = path.join(tempRoot, '__ambient.d.ts');
  writeFileSync(ambientPath, ambientStub, 'utf8');

  // Write actual placeholder .ts files for the relative-path imports used
  // in pedagogical examples. Ambient `declare module './x'` doesn't match
  // relative specifiers from other files, so we provide real stubs at the
  // expected resolution points. These are co-located with synthetic
  // snippet files in tempRoot (which is where imports originate).
  writeFileSync(
    path.join(tempRoot, 'my-marker.ts'),
    'export const myMarker: any = () => ({});\n' +
      'export const MY_MARKER: any = Symbol("MY_MARKER");\n' +
      'export const myProcessor: any = () => undefined;\n',
    'utf8'
  );
  writeFileSync(
    path.join(tempRoot, 'listing.ts'),
    'export interface Listing {\n' +
      '  id: number;\n' +
      '  title: string;\n' +
      '  price: number;\n' +
      '  status: "active" | "archived";\n' +
      '}\n',
    'utf8'
  );
  writeFileSync(
    path.join(tempRoot, 'derived.ts'),
    '// Stub for pedagogical `./derived` imports. Typed as a derived\n' +
      '// factory so the signalTree(initial, factory) overload resolves.\n' +
      'export const appDerived: ($: any) => { doubled: number } =\n' +
      '  ($: any) => ({ doubled: 0 });\n',
    'utf8'
  );
  mkdirSync(path.join(tempRoot, 'events'), { recursive: true });
  writeFileSync(
    path.join(tempRoot, 'events', 'user-created.ts'),
    'import type { BaseEvent } from "@signaltree/events";\n' +
      'export const UserCreatedSchema: any = {};\n' +
      'export type UserCreated = BaseEvent<\n' +
      '  "user.created",\n' +
      '  { id: string; email: string; name: string }\n' +
      '>;\n',
    'utf8'
  );

  // Skill examples for app-tree / Ops / derived patterns reference user-app
  // modules by relative path (`./app-tree`, `./driver.ops`, `./derived/...`).
  // Provide loose `any`-typed placeholders so the snippets type-check
  // without forcing every fence to inline-declare a mock module.
  const opsStub =
    'export class DriverOps { [k: string]: any }\n' +
    'export class TruckOps { [k: string]: any }\n' +
    'export class TicketOps { [k: string]: any }\n' +
    'export class SelectionOps { [k: string]: any }\n' +
    'export class SessionOps { [k: string]: any }\n';
  const writeOps = (file) =>
    writeFileSync(path.join(tempRoot, file), opsStub, 'utf8');
  writeOps('driver.ops.ts');
  writeOps('truck.ops.ts');
  writeOps('ticket.ops.ts');
  writeOps('selection.ops.ts');
  writeOps('session.ops.ts');

  const appTreeStub =
    'import type { InjectionToken, Provider } from "@angular/core";\n' +
    'export type AppTree = any;\n' +
    'export type AppTreeBase = any;\n' +
    'export const APP_TREE: InjectionToken<AppTree> = null as any;\n' +
    'export function createBaseState(initial?: any): any { return {}; }\n' +
    'export function createAppTree(initial?: any): AppTree { return null as any; }\n' +
    'export function provideAppTree(): Provider[] { return []; }\n';
  writeFileSync(path.join(tempRoot, 'app-tree.ts'), appTreeStub, 'utf8');

  writeFileSync(
    path.join(tempRoot, 'app-tree.testing.ts'),
    'import type { Provider } from "@angular/core";\n' +
      'export function provideAppTreeForTesting(overrides?: any): Provider[] { return []; }\n',
    'utf8'
  );

  writeFileSync(
    path.join(tempRoot, 'signaltree.ts'),
    'export class AppStore { readonly $: any; readonly ops: any; [k: string]: any }\n',
    'utf8'
  );

  writeFileSync(
    path.join(tempRoot, 'some.component.ts'),
    'export class SomeComponent { [k: string]: any }\n',
    'utf8'
  );

  mkdirSync(path.join(tempRoot, 'derived'), { recursive: true });
  const derivedFactoryStub =
    'export const entityResolutionDerived: any = () => ({});\n' +
    'export const complexLogicDerived: any = () => ({});\n';
  writeFileSync(
    path.join(tempRoot, 'derived', 'tier-entity-resolution.derived.ts'),
    derivedFactoryStub,
    'utf8'
  );
  writeFileSync(
    path.join(tempRoot, 'derived', 'tier-complex-logic.derived.ts'),
    derivedFactoryStub,
    'utf8'
  );

  // Some testing.md fences import from deeper trees: `../app-tree`,
  // `../store/tree/app-tree`, `./app/store/tree/app-tree.testing` etc.
  // Mirror the placeholders in the parent of tempRoot and in nested
  // `store/{tree,ops}` and `app/store/tree` subdirectories.
  const tempParent = path.dirname(tempRoot); // .cache
  writeFileSync(path.join(tempParent, 'app-tree.ts'), appTreeStub, 'utf8');
  writeFileSync(
    path.join(tempParent, 'app-tree.testing.ts'),
    'import type { Provider } from "@angular/core";\n' +
      'export function provideAppTreeForTesting(overrides?: any): Provider[] { return []; }\n',
    'utf8'
  );
  mkdirSync(path.join(tempParent, 'store', 'tree'), { recursive: true });
  mkdirSync(path.join(tempParent, 'store', 'ops'), { recursive: true });
  writeFileSync(
    path.join(tempParent, 'store', 'tree', 'app-tree.ts'),
    appTreeStub,
    'utf8'
  );
  writeFileSync(
    path.join(tempParent, 'store', 'tree', 'app-tree.testing.ts'),
    'import type { Provider } from "@angular/core";\n' +
      'export function provideAppTreeForTesting(overrides?: any): Provider[] { return []; }\n',
    'utf8'
  );
  writeFileSync(
    path.join(tempParent, 'store', 'ops', 'driver.ops.ts'),
    opsStub,
    'utf8'
  );
  // `driver.service` placeholder — referenced via `./driver.service` from
  // testing examples that live alongside ops files.
  writeFileSync(
    path.join(tempRoot, 'driver.service.ts'),
    'export class DriverService { [k: string]: any }\n',
    'utf8'
  );
  writeFileSync(
    path.join(tempParent, 'driver.service.ts'),
    'export class DriverService { [k: string]: any }\n',
    'utf8'
  );
  // And `app/store/tree/app-tree.testing` resolved from tempRoot.
  mkdirSync(path.join(tempRoot, 'app', 'store', 'tree'), { recursive: true });
  writeFileSync(
    path.join(tempRoot, 'app', 'store', 'tree', 'app-tree.testing.ts'),
    'import type { Provider } from "@angular/core";\n' +
      'export function provideAppTreeForTesting(overrides?: any): Provider[] { return []; }\n',
    'utf8'
  );

  const compilerOptions = {
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    strict: true,
    // Snippets are examples; they need to type-check, not pass lint rules
    // unrelated to API shape.
    noImplicitAny: false,
    strictNullChecks: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: false,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    forceConsistentCasingInFileNames: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
    baseUrl: REPO_ROOT,
    paths: { ...paths },
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
  };

  // -------- Pass 1: compile all blocks without stubs; collect TS2304 names.
  function writeBlocks(stubMap) {
    const files = [ambientPath];
    const fileToBlock = new Map();
    for (let i = 0; i < linted.length; i++) {
      const block = linted[i];
      const blockId = String(i).padStart(4, '0');
      // Stubs are keyed by block index (not by file-array position).
      const stubs = stubMap ? stubMap.get(i) || [] : [];
      const snippet = assembleSnippet(block, blockId, stubs);
      const ext = block.lang === 'tsx' ? '.tsx' : '.ts';
      const fname = path.join(tempRoot, `block_${blockId}${ext}`);
      writeFileSync(fname, snippet, 'utf8');
      fileToBlock.set(fname, block);
      files.push(fname);
    }
    return { files, fileToBlock };
  }

  let totalErrors = 0;
  const errorsByBlock = new Map();

  try {
    // Pass 1 — no stubs — just to collect "Cannot find name X" (TS2304).
    const p1 = writeBlocks(null);
    const host1 = ts.createCompilerHost(compilerOptions, true);
    const program1 = ts.createProgram(p1.files, compilerOptions, host1);

    // Per-block set of identifier names to stub. Keyed by block index
    // (p1.files[0] is the ambient stub file, not a block).
    const stubMap = new Map();
    for (let i = 0; i < p1.files.length; i++) {
      const fname = p1.files[i];
      if (fname === ambientPath) continue;
      const source = program1.getSourceFile(fname);
      if (!source) continue;
      const diags = [
        ...program1.getSyntacticDiagnostics(source),
        ...program1.getSemanticDiagnostics(source),
      ].filter((d) => d.file === source);

      const stubs = new Set();
      for (const d of diags) {
        // TS2304: Cannot find name 'X'
        // TS2552: Cannot find name 'X'. Did you mean 'Y'?
        if (d.code === 2304 || d.code === 2552) {
          const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
          const m = msg.match(/Cannot find name '([^']+)'/);
          if (m) stubs.add(m[1]);
        }
      }
      // Recover the block index from the filename.
      const match = path.basename(fname).match(/^block_(\d+)/);
      if (match && stubs.size > 0) {
        stubMap.set(parseInt(match[1], 10), [...stubs]);
      }
    }

    // Pass 2 — rewrite with stubs, recompile.
    const p2 = writeBlocks(stubMap);
    const host2 = ts.createCompilerHost(compilerOptions, true);
    const program2 = ts.createProgram(p2.files, compilerOptions, host2);

    for (const fname of p2.files) {
      const block = p2.fileToBlock.get(fname);
      const source = program2.getSourceFile(fname);
      if (!source) {
        totalErrors++;
        errorsByBlock.set(block, [
          {
            path: block.filePath,
            line: block.startLine,
            code: -1,
            message: 'Failed to load synthetic source file',
            snippet: '',
          },
        ]);
        continue;
      }
      const diags = [
        ...program2.getSyntacticDiagnostics(source),
        ...program2.getSemanticDiagnostics(source),
      ].filter((d) => d.file === source);
      if (diags.length > 0) {
        const formatted = diags.map((d) => formatDiagnostic(d, block, fname));
        errorsByBlock.set(block, formatted);
        totalErrors += formatted.length;
      }
    }
  } finally {
    if (!process.env.LINT_SKILLS_KEEP_TEMP) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  if (errorsByBlock.size === 0) {
    logOk(
      `Checked ${linted.length} block(s) across ${
        new Set(linted.map((b) => b.filePath)).size
      } file(s), all passed.`
    );
    process.exit(0);
  }

  // Print errors grouped by block.
  let blockIdx = 0;
  for (const [block, diags] of errorsByBlock) {
    blockIdx++;
    const rel = path.relative(REPO_ROOT, block.filePath);
    console.error('');
    console.error(
      color.bold(
        color.red(
          `✗ ${rel}:${block.startLine}  (fence #${blockIdx}, ${
            diags.length
          } error${diags.length === 1 ? '' : 's'})`
        )
      )
    );
    for (const d of diags) {
      const loc = `${path.relative(REPO_ROOT, d.path)}:${d.line}`;
      console.error(
        `  ${color.yellow(`TS${d.code}`)} ${color.gray(loc)}  ${
          d.message.split('\n')[0]
        }`
      );
      if (d.snippet) {
        console.error(`    ${color.gray('→')} ${d.snippet}`);
      }
      const rest = d.message.split('\n').slice(1);
      for (const line of rest) {
        console.error(`      ${color.gray(line)}`);
      }
    }
  }

  console.error('');
  logError(
    `${totalErrors} error(s) across ${errorsByBlock.size} block(s). Fix the SKILL.md / reference files listed above.`
  );
  process.exit(1);
}

main().catch((err) => {
  logError(`Unexpected failure: ${err?.stack || err}`);
  process.exit(1);
});

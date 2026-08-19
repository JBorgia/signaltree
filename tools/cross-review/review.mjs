#!/usr/bin/env node
/**
 * CROSS-REVIEW HARNESS — batch adversarial review at derivation-row boundaries.
 *
 * WHY IT SENDS ARTIFACTS, NOT SUMMARIES. The measured weakness of the manual
 * loop is that the reviewer catches REASONING errors well and MEASUREMENT errors
 * not at all — it only ever saw prose. Three wrong findings (`runId`,
 * `loader.ts`, a 44-hit false positive) were confidently validated because the
 * reviewer had no way to check them. So every packet carries the RAW artifact:
 * the spec source, its ACTUAL vitest output, the production code, and the frozen
 * rules — never a claim about them.
 *
 * WHY BATCH, NOT CONVERSATIONAL. Cheap round-trips are what produced ~10 lines
 * of ledger per line of subtraction. One review per row boundary; a second round
 * ONLY if new evidence was introduced.
 *
 *   node tools/cross-review/review.mjs --row M3 \
 *     --rfc "DERIVATION M3" \
 *     --spec packages/core/src/lib/foo.spec.ts \
 *     --src  packages/core/src/lib/foo.ts \
 *     [--model openai/gpt-5] [--dry-run]
 *
 * --dry-run prints the packet and sends nothing. USE IT FIRST: every packet
 * publishes unreleased architecture to an external service.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STATE_DIR = join(ROOT, '.cross-review');
const CONTRACT = join(ROOT, 'tools/cross-review/contract.md');

/* ---------------------------------------------------------------- args --- */
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const row = opt('row');
if (!row) {
  console.error('usage: review.mjs --row <id> [--rfc <heading>] [--spec p] [--src p] [--dry-run]');
  process.exit(2);
}
const model = opt('model', 'openai/gpt-5');
const specs = args.flatMap((a, i) => (a === '--spec' ? [args[i + 1]] : []));
const srcs = args.flatMap((a, i) => (a === '--src' ? [args[i + 1]] : []));
const rfcHeading = opt('rfc');

/* --------------------------------------------------------------- state --- */
mkdirSync(STATE_DIR, { recursive: true });
const statePath = join(STATE_DIR, `${row}.json`);
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { row, rounds: 0, evidenceHashes: [] };

/* ------------------------------------------------- artifact collection --- */
const sections = [];

const addFile = (label, path) => {
  if (!existsSync(path)) {
    sections.push(`## ${label}: ${path}\n\nFILE DOES NOT EXIST — this itself is evidence.`);
    return;
  }
  sections.push(`## ${label}: ${path}\n\n\`\`\`ts\n${readFileSync(path, 'utf8')}\n\`\`\``);
};

/** Run the spec and capture REAL output. A claim about a test is not a test. */
const runSpec = (path) => {
  try {
    const out = execFileSync(
      'npx',
      ['vitest', 'run', path.replace(/^packages\/core\//, '')],
      { cwd: join(ROOT, 'packages/core'), encoding: 'utf8', stdio: 'pipe' }
    );
    return out.split('\n').filter((l) => /Test Files|Tests |✓|×|FAIL/.test(l)).join('\n');
  } catch (e) {
    return `NON-ZERO EXIT\n${(e.stdout || '') + (e.stderr || '')}`.slice(0, 4000);
  }
};

/** Pull one section out of the RFC by heading, up to the next same-level one. */
const rfcSection = (heading) => {
  const rfc = join(ROOT, 'docs/rfcs/0016-signaltree-15-candidate-architecture.md');
  if (!existsSync(rfc)) return null;
  const text = readFileSync(rfc, 'utf8');
  const i = text.indexOf(heading);
  if (i === -1) return null;
  const start = text.lastIndexOf('\n## ', i) + 1;
  const next = text.indexOf('\n## ', i + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
};

if (rfcHeading) {
  const sec = rfcSection(rfcHeading);
  sections.push(
    sec
      ? `## THE CLAIM UNDER REVIEW (RFC 0016)\n\n${sec}`
      : `## THE CLAIM UNDER REVIEW\n\nHEADING NOT FOUND: ${rfcHeading}`
  );
}
for (const p of srcs) addFile('PRODUCTION SOURCE', p);
for (const p of specs) {
  addFile('SPEC SOURCE', p);
  sections.push(`## ACTUAL TEST OUTPUT: ${p}\n\n\`\`\`\n${runSpec(p)}\n\`\`\``);
}

/* Frozen rules the reviewer must respect. */
const release = join(ROOT, 'RELEASE-1.0.md');
if (existsSync(release)) {
  const text = readFileSync(release, 'utf8');
  const rules = ['## RULE 0l', '## RULE 0m', '## RULE 0n', '## RULE 0o']
    .map((h) => {
      const i = text.indexOf(h);
      if (i === -1) return '';
      const next = text.indexOf('\n## ', i + h.length);
      return text.slice(i, next === -1 ? i + 4000 : next);
    })
    .filter(Boolean)
    .join('\n\n');
  if (rules) sections.push(`## FROZEN METHODOLOGY RULES\n\n${rules}`);
}

const packet = [
  `# CROSS-REVIEW PACKET — row ${row}, round ${state.rounds + 1}`,
  '',
  'Everything below is RAW. Test output is the real run, not a report of it.',
  'Check every claim in the RFC section against the source and output supplied.',
  '',
  ...sections,
].join('\n\n');

/* ------------------------------------------------------ circuit breaker --- */
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
};
const evidenceHash = hash(sections.join(''));
const newEvidence = !state.evidenceHashes.includes(evidenceHash);

if (state.rounds >= 1 && !newEvidence) {
  console.error(
    `\nCIRCUIT BREAKER — row ${row} is at round ${state.rounds} and the evidence packet is UNCHANGED.\n` +
      `A further round is permitted only when new evidence is introduced.\n` +
      `Disagreement is frozen: close the row, record UNPROVEN, or arbitrate.\n`
  );
  process.exit(3);
}

/* ---------------------------------------------------------------- send --- */
const packetPath = join(STATE_DIR, `${row}.round${state.rounds + 1}.packet.md`);
writeFileSync(packetPath, packet);

if (flag('dry-run')) {
  console.log(`DRY RUN — nothing sent.\npacket: ${packetPath}\nbytes:  ${packet.length}\nmodel:  ${model}`);
  process.exit(0);
}

const contract = readFileSync(CONTRACT, 'utf8');
let critique;
try {
  // `ds` reads OPENROUTER_API_KEY, which lives in ~/.zshrc — sourced only by
  // interactive shells, so pull that one line explicitly.
  critique = execFileSync(
    'bash',
    [
      '-c',
      `eval "$(grep -m1 '^export OPENROUTER_API_KEY' ~/.zshrc)"; ` +
        `ds --no-stream --model ${JSON.stringify(model)} --system ${JSON.stringify(contract)} < ${JSON.stringify(packetPath)}`,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 }
  );
} catch (e) {
  console.error(`review failed:\n${(e.stdout || '') + (e.stderr || '')}`);
  process.exit(1);
}

/* -------------------------------------------------------------- triage --- */
const findings = critique
  .split('---')
  .map((b) => b.trim())
  .filter((b) => b.startsWith('FINDING:'));

const field = (block, name) =>
  (block.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) || [, ''])[1].trim();

const triaged = findings.map((b) => ({
  finding: field(b, 'FINDING'),
  cls: field(b, 'CLASS'),
  scope: field(b, 'SCOPE'),
  severity: field(b, 'SEVERITY'),
  falsifier: field(b, 'FALSIFIER'),
  block: b,
}));

const rejected = triaged.filter(
  (f) => f.cls === 'FROZEN' && !/counterexample|reproduc|assert|expect/i.test(f.falsifier)
);
const arbitrate = triaged.filter(
  (f) => f.cls === 'POLICY' || f.scope === 'OUT-OF-ROW' || (f.cls === 'EXTERNAL' && f.severity === 'BLOCKS-CLOSE')
);
const wording = triaged.filter((f) => f.severity === 'WORDING-ONLY');
const actionable = triaged.filter(
  (f) => !rejected.includes(f) && !arbitrate.includes(f) && !wording.includes(f)
);

const outPath = join(STATE_DIR, `${row}.round${state.rounds + 1}.findings.md`);
writeFileSync(outPath, critique);

state.rounds += 1;
state.evidenceHashes.push(evidenceHash);
writeFileSync(statePath, JSON.stringify(state, null, 2));

console.log(`\nrow ${row} · round ${state.rounds} · ${triaged.length} findings`);
console.log(`  ACTIONABLE   ${actionable.length}  measure or rebut, then close`);
console.log(`  WORDING-ONLY ${wording.length}  batch into the closing edit — NO further round`);
console.log(`  ARBITRATE    ${arbitrate.length}  policy / out-of-row / blocking-external`);
console.log(`  REJECTED     ${rejected.length}  frozen invariant, no falsifier supplied`);
console.log(`\nfindings: ${outPath}`);
if (arbitrate.length) {
  console.log(`\n--- REQUIRES A HUMAN DECISION ---`);
  for (const f of arbitrate) console.log(`  [${f.cls}/${f.scope}] ${f.finding}`);
}

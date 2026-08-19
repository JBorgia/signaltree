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
 * Usage:
 *   node tools/cross-review/review.mjs --row M3 \
 *     --rfc "DERIVATION M3" \
 *     --spec packages/core/src/lib/foo.spec.ts \
 *     --src  packages/core/src/lib/foo.ts \
 *     [--model openai/gpt-5] [--dry-run]
 *
 *   node tools/cross-review/review.mjs --self-test [--model <provider/model>]
 *
 * --dry-run prints the packet and sends nothing. USE IT FIRST: every packet
 * publishes unreleased architecture to an external service.
 *
 * --self-test runs five mandatory bridge verification tests and exits.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

const ROOT = process.cwd();
const STATE_DIR = join(ROOT, '.cross-review');
const CONTRACT = join(ROOT, 'tools/cross-review/contract.md');
const CONTEXT_PATH = join(ROOT, 'docs/architecture/SIGNALTREE-15-CONTEXT.md');
const RFC_PATH = join(ROOT, 'docs/rfcs/0016-signaltree-15-candidate-architecture.md');
const RELEASE_PATH = join(ROOT, 'RELEASE-1.0.md');

/* ---------------------------------------------------------------- args --- */
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const isSelfTest = flag('self-test');
const row = opt('row') || (isSelfTest ? 'SELF-TEST' : null);
if (!row && !isSelfTest) {
  console.error(
    'usage: review.mjs --row <id> [--rfc <heading>] [--spec p] [--src p] [--model m] [--dry-run]\n' +
    '       review.mjs --self-test [--model <provider/model>]'
  );
  process.exit(2);
}
const model = opt('model', 'openai/gpt-5');
const specs = args.flatMap((a, i) => (a === '--spec' ? [args[i + 1]] : []));
const srcs = args.flatMap((a, i) => (a === '--src' ? [args[i + 1]] : []));
const rfcHeading = opt('rfc');

/* ---------------------------------------------------------------- utils --- */
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const canary = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;

const gitRev = (path) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', path], {
      encoding: 'utf8',
    }).trim();
  } catch { return ''; }
};

const gitShort = (path) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%h', '--', path], {
      encoding: 'utf8',
    }).trim();
  } catch { return ''; }
};

const lastCommitTime = (path) => {
  try {
    return Number(execFileSync('git', ['log', '-1', '--format=%ct', '--', path], {
      encoding: 'utf8',
    }).trim());
  } catch { return 0; }
};

/* --------------------------------------------------------------- state --- */
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
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
  if (!existsSync(RFC_PATH)) return null;
  const text = readFileSync(RFC_PATH, 'utf8');
  const i = text.indexOf(heading);
  if (i === -1) return null;
  const start = text.lastIndexOf('\n## ', i) + 1;
  const next = text.indexOf('\n## ', i + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
};

/* STALE-CONTEXT TRIPWIRE. An authoritative file that lags the matrix is worse
   than none: it becomes an authoritative source of stale claims, which is the
   exact failure it exists to prevent. */
const rfcTime = lastCommitTime('docs/rfcs/0016-signaltree-15-candidate-architecture.md');
const ctxTime = lastCommitTime('docs/architecture/SIGNALTREE-15-CONTEXT.md');
if (rfcTime && ctxTime && rfcTime > ctxTime && !flag('allow-stale-context') && !isSelfTest) {
  console.error(
    `\nSTALE CONTEXT — the RFC matrix has moved since SIGNALTREE-15-CONTEXT.md last did.\n` +
      `Reviewing against a stale worldview reintroduces exactly the drift the context file prevents.\n` +
      `Update the context file, or pass --allow-stale-context if the RFC change was not a disposition.\n`
  );
  process.exit(4);
}

/* AUTHORITATIVE CONTEXT — always first, so a reviewer cannot drift back toward
   superseded conclusions that happen to be prominent in a transcript. */
let contextContent = '';
if (existsSync(CONTEXT_PATH)) {
  contextContent = readFileSync(CONTEXT_PATH, 'utf8');
  sections.push(
    `## AUTHORITATIVE CONTEXT — read as CURRENT TRUTH\n\n` +
      `Conversation transcripts and 14.x code are EVIDENCE ONLY. Where they\n` +
      `conflict with the context below, the context wins unless you supply a\n` +
      `deterministic counterexample.\n\n` +
      contextContent
  );
} else {
  sections.push(
    `## AUTHORITATIVE CONTEXT\n\nMISSING: ${CONTEXT_PATH} — treat every claim in this packet as unanchored.`
  );
}

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
if (existsSync(RELEASE_PATH)) {
  const text = readFileSync(RELEASE_PATH, 'utf8');
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

/* ------------------------------------------------------ circuit breaker --- */
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
};
const evidenceHash = hash(sections.join(''));
const newEvidence = !state.evidenceHashes.includes(evidenceHash);

if (state.rounds >= 1 && !newEvidence && !isSelfTest) {
  console.error(
    `\nCIRCUIT BREAKER — row ${row} is at round ${state.rounds} and the evidence packet is UNCHANGED.\n` +
      `A further round is permitted only when new evidence is introduced.\n` +
      `Disagreement is frozen: close the row, record UNPROVEN, or arbitrate.\n`
  );
  process.exit(3);
}

/* ---------------------------------------------------------------- send --- */
const buildPacket = () => [
  `# CROSS-REVIEW PACKET — row ${row}, round ${state.rounds + 1}`,
  '',
  'Everything below is RAW. Test output is the real run, not a report of it.',
  'Check every claim in the RFC section against the source and output supplied.',
  '',
  ...sections,
].join('\n\n');

const packet = buildPacket();
const packetPath = join(STATE_DIR, `${row}.round${state.rounds + 1}.packet.md`);
writeFileSync(packetPath, packet);

/* ------------------------------------------------- self-test harness --- */
if (isSelfTest) {
  const dryRun = flag('dry-run');
  const contract = readFileSync(CONTRACT, 'utf8');
  const ctxRev = gitRev('docs/architecture/SIGNALTREE-15-CONTEXT.md');
  const ctxSha = sha256(contextContent || '');
  const pktSha = sha256(packet);
  let provider = '';
  let modelUsed = '';

  const sendReview = (pkt) => {
    if (dryRun) return `[DRY RUN — packet ${pkt.length} bytes, not sent]`;
    const pktTmp = join(STATE_DIR, '_selftest_packet.md');
    writeFileSync(pktTmp, pkt);
    try {
      const out = execFileSync(
        'bash',
        [
          '-c',
          `eval "$(grep -m1 '^export OPENROUTER_API_KEY' ~/.zshrc)"; ` +
            `ds --no-stream --model ${JSON.stringify(model)} --system ${JSON.stringify(contract)} < ${JSON.stringify(pktTmp)}`,
        ],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 }
      );
      try { execFileSync('rm', ['-f', pktTmp]); } catch {}
      return out;
    } catch (e) {
      try { execFileSync('rm', ['-f', pktTmp]); } catch {}
      throw e;
    }
  };

  // Extract provider and model display name
  const modelParts = model.split('/');
  provider = modelParts[0] || 'unknown';
  modelUsed = modelParts.slice(1).join('/') || model;

  const results = [];

  const run = (name, fn) => {
    try {
      const ok = fn();
      results.push({ name, pass: ok });
    } catch (e) {
      results.push({ name, pass: false, error: e.message || String(e) });
    }
  };

  /* TEST 1 — Transport canary */
  run('transport canary', () => {
    const c = canary('BRIDGE_CANARY');
    const pkt = [
      '# SELF-TEST — TEST 1: Transport Canary',
      '',
      `Return exactly this value: ${c}`,
      '',
      `If you can read this, the bridge is working.`,
    ].join('\n');
    const resp = sendReview(pkt);
    return resp.includes(c);
  });

  /* TEST 2 — Authoritative-context canary */
  run('authoritative-context canary', () => {
    const c = canary('BRIDGE_CONTEXT_CANARY');
    const pkt = [
      '# SELF-TEST — TEST 2: Context Canary',
      '',
      '## AUTHORITATIVE CONTEXT — read as CURRENT TRUTH',
      '',
      contextContent,
      '',
      `## INJECTED CANARY`,
      '',
      `The authoritative context file contains this unique canary: ${c}`,
      '',
      'Return the canary value exactly. It exists only in the authoritative-context portion of this packet.',
    ].join('\n');
    const resp = sendReview(pkt);
    return resp.includes(c);
  });

  /* TEST 3 — Superseded-history test */
  run('superseded history rejected', () => {
    const pkt = [
      '# SELF-TEST — TEST 3: Superseded History',
      '',
      '## AUTHORITATIVE CONTEXT — read as CURRENT TRUTH',
      '',
      contextContent,
      '',
      '## CLAIM UNDER TEST',
      '',
      'The following statement is from a conversation transcript:',
      '',
      '> Open declaration-kind registration survives because it was public,',
      '> documented, and exercised in SignalTree 14.',
      '',
      'QUESTION: Which conclusion governs — the historical/transcript statement',
      'above, or the current authoritative context? Explain briefly using the',
      'epistemic hierarchy.',
    ].join('\n');
    const resp = sendReview(pkt);
    // Must reject transcript as authority
    const rejectsTranscript = /transcript|superseded|evidence only|no survival|does not establish|NOT-AUTHORITY|not sufficient|public.{0,20}does not|legacy.{0,20}no entitlement|does not earn/i.test(resp);
    // Must reference authoritative context
    const citesContext = /authoritative|context|current|greenfield|frozen|15\.\d/i.test(resp);
    return rejectsTranscript && citesContext;
  });

  /* TEST 4 — Adversarial independence */
  run('adversarial bad conclusion challenged', () => {
    const pkt = [
      '# SELF-TEST — TEST 4: Adversarial Independence',
      '',
      '## AUTHORITATIVE CONTEXT — read as CURRENT TRUTH',
      '',
      contextContent,
      '',
      '## CLAIM UNDER TEST',
      '',
      'entityMap and stored currently use the same MarkerProcessor,',
      'therefore SignalTree 15 needs a common declaration-lowering',
      'abstraction shared between them.',
      '',
      'QUESTION: Evaluate this claim. Is it supported?',
    ].join('\n');
    const resp = sendReview(pkt);
    // Must challenge the claim — reject it or identify the flawed reasoning
    const challenges = /no.{0,15}common|not.{0,15}supported|colocation.{0,20}not|markerprocessor.{0,30}not|not.{0,15}inherit|separate|different|lowering.{0,15}deferred|independent|greenfield|surviv/i.test(resp);
    return challenges;
  });

  /* TEST 5 — Structured response validation */
  run('structured schema validated', () => {
    const pkt = [
      '# SELF-TEST — TEST 5: Schema Validation',
      '',
      '## AUTHORITATIVE CONTEXT — read as CURRENT TRUTH',
      '',
      contextContent,
      '',
      '## CLAIM UNDER TEST',
      '',
      '"The derived projection contract in RFC 0015 should be reopened to',
      'allow inline derived fields directly in the tree declaration syntax,',
      'because it would improve DX."',
      '',
      'Evaluate this claim using the structured finding format.',
    ].join('\n');
    const resp = sendReview(pkt);
    const findings = parseFindings(resp);
    return findings.length > 0;
  });

  // ---- output ----
  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.filter((r) => !r.pass).length;
  const allPass = failCount === 0;

  console.log('');
  console.log('SIGNALTREE CROSS-REVIEW SELF TEST');
  console.log('');
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  }
  console.log('');
  console.log(`provider:      ${provider}`);
  console.log(`model:         ${modelUsed}`);
  console.log(`context rev:   ${ctxRev.slice(0, 12)}`);
  console.log(`context sha256:${ctxSha}`);
  console.log(`packet sha256: ${pktSha}`);
  console.log('');
  console.log(`BRIDGE STATUS: ${allPass ? 'VERIFIED' : 'NOT VERIFIED'}`);
  console.log('');

  process.exit(allPass ? 0 : 1);
}

/* -------------------------------------------------------- normal review --- */
if (flag('dry-run')) {
  console.log(`DRY RUN — nothing sent.\npacket: ${packetPath}\nbytes:  ${packet.length}\nmodel:  ${model}`);
  process.exit(0);
}

const contract = readFileSync(CONTRACT, 'utf8');
const ctxRev = gitRev('docs/architecture/SIGNALTREE-15-CONTEXT.md');
const ctxShort = gitShort('docs/architecture/SIGNALTREE-15-CONTEXT.md');
const ctxSha = sha256(contextContent || '');
const pktSha = sha256(packet);

let critique;
try {
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
const triaged = parseFindings(critique);

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

/* ------------------------------------------------- structured status --- */
const blocksClose = triaged.filter((f) => f.severity === 'BLOCKS-CLOSE').length;
const corrections = triaged.filter((f) => f.severity === 'CORRECTION').length;
const wordings = triaged.filter((f) => f.severity === 'WORDING-ONLY').length;

const ctxStatus = (rfcTime && ctxTime && rfcTime > ctxTime) ? 'STALE/UNKNOWN' : 'CURRENT';

console.log('');
console.log('SIGNALTREE CROSS-REVIEW');
console.log('');
console.log(`Reviewer:       ${model}`);
console.log(`Context:        docs/architecture/SIGNALTREE-15-CONTEXT.md`);
console.log(`Context rev:    ${ctxShort || 'unknown'}`);
console.log(`Context status: ${ctxStatus}`);
console.log(`Packet sha256:  ${pktSha}`);
console.log('');
console.log(`Findings:`);
console.log(`  ${blocksClose} BLOCKS-CLOSE`);
console.log(`  ${corrections} CORRECTION`);
console.log(`  ${wordings} WORDING-ONLY`);
console.log('');
console.log(`row ${row} · round ${state.rounds} · ${triaged.length} findings total`);
console.log(`  ACTIONABLE   ${actionable.length}  measure or rebut, then close`);
console.log(`  WORDING-ONLY ${wording.length}  batch into the closing edit — NO further round`);
console.log(`  ARBITRATE    ${arbitrate.length}  policy / out-of-row / blocking-external`);
console.log(`  REJECTED     ${rejected.length}  frozen invariant, no falsifier supplied`);
console.log(`\nfindings: ${outPath}`);

/* ------------------------------------------------- arbitration packet --- */
if (arbitrate.length) {
  console.log(`\n--- REQUIRES A HUMAN DECISION ---`);
  for (const f of arbitrate) {
    console.log(`\nARBITRATION — ${row}`);
    console.log('');
    console.log('DECISION NEEDED');
    console.log(f.finding || f.block.slice(0, 200));
    console.log('');
    console.log('WHY EVIDENCE CANNOT SETTLE IT');
    console.log(`CLASS: ${f.cls} | SCOPE: ${f.scope} | SEVERITY: ${f.severity}`);
    console.log('');
    console.log('RECOMMENDATION');
    console.log('CHOICES: A | B | PARK');
  }
}

/* =================================================================== */
/*  FINDING PARSER — validates the reviewer contract schema              */
/* =================================================================== */
function parseFindings(text) {
  const blocks = text
    .split('---')
    .map((b) => b.trim())
    .filter((b) => b.startsWith('FINDING:'));

  const field = (block, name) => {
    const m = block.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  return blocks.map((b) => ({
    finding: field(b, 'FINDING'),
    cls: field(b, 'CLASS'),
    scope: field(b, 'SCOPE'),
    severity: field(b, 'SEVERITY'),
    falsifier: field(b, 'FALSIFIER'),
    whatNotEstablished: field(b, 'WHAT THIS DOES NOT ESTABLISH') || field(b, 'NOT-ESTABLISHED'),
    block: b,
  }));
}

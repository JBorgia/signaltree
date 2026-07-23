#!/usr/bin/env node

/**
 * Version-Claims Verification (RFC 0004 §4 step 6 / §3 V-P6)
 * ==========================================================
 *
 * CHECK-ONLY (no generation). The authoritative Angular support range is
 * packages/core/package.json -> peerDependencies["@angular/core"]. Every
 * canonical claim site must state that same range, both as prose
 * ("Angular 20, 21, or 22") and — where ranges are quoted — as the semver
 * range ("^20.0.0 || ^21.0.0 || ^22.0.0"). Precedent for the failure mode:
 * install.md claimed "derived from peerDependencies" and still drifted to
 * "Angular 20 or 21" for a full major.
 *
 * Canonical claim sites checked:
 *   - README.md
 *   - packages/core/README.md
 *   - apps/demo/public/llms.txt
 *   - apps/demo/public/llms-full.txt
 *   - docs/skills/using-signaltree/reference/install.md
 *
 * EXPLICIT EXCLUSIONS (claims that carry semantics NOT derivable from core's
 * peerDependencies — deliberately not checked):
 *   - the ng-forms `/signals` subpath's Angular-22-only claim (its own
 *     boundary, not core's) — lines mentioning `/signals` are skipped;
 *   - the Angular 20.3 `connect()` boundary ("Angular 20.3+",
 *     "Angular 20.0–20.2") — dotted minor versions are structurally excluded
 *     by the matcher;
 *   - @signaltree/events' wider `^18 ... ^22` range — lines mentioning
 *     @signaltree/events are skipped;
 *   - toolchain / NgRx-comparator version claims (RFC 0004 §4 S3 owns those).
 *
 * Usage:
 *   node scripts/verify-version-claims.js               # run the gate
 *   node scripts/verify-version-claims.js --self-test   # negative test:
 *       prove the gate fails on seeded drift (RFC 0004 §5 rule 2)
 *
 * Exit codes: 0 = pass, 1 = claim drift, 2 = environment error.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const CLAIM_SITES = [
  'README.md',
  'packages/core/README.md',
  'apps/demo/public/llms.txt',
  'apps/demo/public/llms-full.txt',
  'docs/skills/using-signaltree/reference/install.md',
];

// Lines matching any of these are excluded from drift scanning (see header).
const LINE_EXCLUSIONS = [
  /\/signals/, // ng-forms Angular-22-only subpath claim
  /@signaltree\/events/, // events supports ^18–^22 by design
];

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

/** '^20.0.0 || ^21.0.0 || ^22.0.0' -> [20, 21, 22] */
function parseMajors(range) {
  const majors = [];
  for (const m of range.matchAll(/\^(\d+)\./g)) majors.push(Number(m[1]));
  return [...new Set(majors)].sort((a, b) => a - b);
}

function humanPhrase(majors) {
  if (majors.length === 1) return `Angular ${majors[0]}`;
  if (majors.length === 2) return `Angular ${majors[0]} or ${majors[1]}`;
  return `Angular ${majors.slice(0, -1).join(', ')}, or ${majors[majors.length - 1]}`;
}

function semverPhrase(majors) {
  return majors.map((m) => `^${m}.0.0`).join(' || ');
}

// ---------------------------------------------------------------------------
// Checks (pure over text so the self-test can seed fixtures)
// ---------------------------------------------------------------------------

/**
 * Scan one site's text; returns violation strings.
 * @param {string} text     site content
 * @param {string} site     site name for messages
 * @param {number[]} majors authoritative majors
 */
function checkSite(text, site, majors) {
  const violations = [];
  const majorsKey = majors.join(',');
  const human = humanPhrase(majors);
  const semver = semverPhrase(majors);

  // 1. Required presence: the canonical prose claim must appear somewhere.
  if (!text.includes(human)) {
    violations.push(
      `${site}: missing the canonical support claim "${human}" ` +
        `(derived from packages/core/package.json peerDependencies)`
    );
  }

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (LINE_EXCLUSIONS.some((re) => re.test(line))) return;
    const at = `${site}:${i + 1}`;

    // 2. Stale prose enumerations: "Angular 20 or 21", "Angular 20 and 21",
    //    "Angular 19, 20, or 21"... Dotted versions ("Angular 20.3+") and
    //    "+"-suffixed claims are structurally excluded.
    for (const m of line.matchAll(
      /\bAngular\s+(\d{1,2}(?:(?:,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+)\d{1,2})+)(?![.\d+])/g
    )) {
      const claimed = [...m[1].matchAll(/\d{1,2}/g)]
        .map((n) => Number(n[0]))
        .sort((a, b) => a - b);
      if (claimed.join(',') !== majorsKey) {
        violations.push(
          `${at}: stale prose claim "Angular ${m[1]}" — authoritative range is "${human}"`
        );
      }
    }

    // 3. Stale semver ranges tied to @angular/core or @angular/forms.
    //    (Single-caret ranges like `rxjs ^7.0.0` on the same line are ignored:
    //    only multi-alternative ranges following an @angular/* token count.)
    for (const m of line.matchAll(
      /@angular\/(?:core|forms)\S*\s*:?\s*`?(\^\d+\.\d+\.\d+(?:\s*\|\|\s*\^\d+\.\d+\.\d+)+)/g
    )) {
      const claimed = parseMajors(m[1]);
      if (claimed.join(',') !== majorsKey) {
        violations.push(
          `${at}: stale semver claim "${m[1]}" for @angular/* — authoritative range is "${semver}"`
        );
      }
    }
  });

  return violations;
}

// ---------------------------------------------------------------------------
// Self-test (negative test — RFC 0004 §5 rule 2)
// ---------------------------------------------------------------------------

function selfTest(majors) {
  let failed = 0;
  const expect = (label, cond) => {
    if (cond) console.log(`  ✅ self-test: ${label}`);
    else {
      console.error(`  ❌ self-test FAILED: ${label}`);
      failed++;
    }
  };

  expect('authority parses to at least two majors', majors.length >= 2);

  // Seeded drift: the exact live bug this gate was written against
  // (install.md said "Angular 20 or 21" + `^20.0.0 || ^21.0.0` while
  // peerDependencies already said ^20 || ^21 || ^22).
  const drifted = [
    '- **Angular 20 or 21** — every Angular-consuming package declares',
    "  `@angular/core: ^20.0.0 || ^21.0.0` in `peerDependencies`.",
  ].join('\n');
  const v1 = checkSite(drifted, 'fixture-install.md', majors);
  expect(
    'flags the historical install.md drift (stale prose)',
    v1.some((v) => v.includes('stale prose claim'))
  );
  expect(
    'flags the historical install.md drift (stale semver range)',
    v1.some((v) => v.includes('stale semver claim'))
  );
  expect(
    'flags a site missing the canonical claim entirely',
    v1.some((v) => v.includes('missing the canonical support claim'))
  );

  // Excluded semantics must NOT be flagged.
  const excluded = [
    `${humanPhrase(majors)} — canonical claim present.`,
    'Native Signal Forms support (Angular 20.3+) via `connect()`.',
    'Fallback on Angular 20.0–20.2 where `connect()` is unavailable.',
    "The `/signals` subpath requires `@angular/core ^22.0.0 || ^23.0.0`.",
    '@signaltree/events peers: `@angular/core ^18.0.0 || ^19.0.0 || ^20.0.0`.',
  ].join('\n');
  const v2 = checkSite(excluded, 'fixture-exclusions.md', majors);
  expect('does not flag excluded semantics (connect()/20.3, /signals, events)', v2.length === 0);

  // Control: a clean site passes.
  const clean = `Requires ${humanPhrase(majors)} (\`@angular/core ${semverPhrase(majors)}\`).`;
  const v3 = checkSite(clean, 'fixture-clean.md', majors);
  expect('passes a clean site (control)', v3.length === 0);

  if (failed > 0) {
    console.error(`\n❌ SELF-TEST FAILED (${failed}) — the gate cannot be trusted`);
    process.exit(1);
  }
  console.log('\n✅ Self-test passed — gate demonstrably able to fail');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const corePkgPath = path.join(ROOT, 'packages', 'core', 'package.json');
  if (!fs.existsSync(corePkgPath)) {
    console.error('Missing packages/core/package.json');
    process.exit(2);
  }
  const range = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'))
    .peerDependencies?.['@angular/core'];
  if (!range) {
    console.error('packages/core/package.json has no @angular/core peer dependency');
    process.exit(2);
  }
  const majors = parseMajors(range);
  if (majors.length === 0) {
    console.error(`Could not parse majors from range "${range}"`);
    process.exit(2);
  }

  if (process.argv.includes('--self-test')) {
    console.log('🧪 verify-version-claims --self-test (negative test, RFC 0004 §5 rule 2)\n');
    selfTest(majors);
    return;
  }

  console.log(
    `🔍 Verifying Angular version claims against authority "${range}" ` +
      `(majors: ${majors.join(', ')})\n`
  );

  const violations = [];
  for (const site of CLAIM_SITES) {
    const abs = path.join(ROOT, site);
    if (!fs.existsSync(abs)) {
      violations.push(`${site}: canonical claim site is missing`);
      continue;
    }
    const siteViolations = checkSite(fs.readFileSync(abs, 'utf8'), site, majors);
    violations.push(...siteViolations);
    console.log(
      siteViolations.length === 0 ? `  ✅ ${site}` : `  ❌ ${site} (${siteViolations.length})`
    );
  }

  if (violations.length > 0) {
    console.error(`\n❌ VERSION-CLAIM VERIFICATION FAILED (${violations.length} violation(s)):`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      '\nFix the claim site(s) to match peerDependencies — never the other way ' +
        'around without a deliberate support-range change.'
    );
    process.exit(1);
  }
  console.log('\n✅ All canonical claim sites match peerDependencies');
  process.exit(0);
}

main();

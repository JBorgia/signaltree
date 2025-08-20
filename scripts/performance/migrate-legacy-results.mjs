#!/usr/bin/env node
/*
 * Migrates legacy performance result & baseline JSON files into the organized
 * directory layout introduced for micro benchmark variance stats.
 *
 * Supports dry-run, force overwrite, verbose logging and optional legacy cleanup.
 *
 * Usage:
 *   node scripts/performance/migrate-legacy-results.mjs [--dry-run] [--force] [--remove-legacy] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));

const DRY_RUN = flags.has('--dry-run');
const FORCE = flags.has('--force');
const REMOVE = flags.has('--remove-legacy');
const QUIET = flags.has('--quiet');
const VERBOSE = flags.has('--verbose');

function log(...m) {
  if (!QUIET) console.log('[migrate]', ...m);
}
function v(...m) {
  if (VERBOSE && !QUIET) console.log('  •', ...m);
}
function error(...m) {
  console.error('[migrate:err]', ...m);
}

function ensureDir(dir) {
  if (DRY_RUN) return;
  fs.mkdirSync(dir, { recursive: true });
}

function isPlaceholderBaseline(json) {
  if (!json) return false;
  if (Array.isArray(json.results) && json.results.length === 0) return true;
  if (json._note && /placeholder/i.test(json._note)) return true;
  return false;
}

const plans = [
  {
    category: 'micro',
    engine: 'angular',
    legacyLatest: 'latest-micro-bench-stats.json',
    organizedLatest: 'results/micro/angular/latest.json',
    legacyBaseline: 'baseline-micro-bench-stats.json',
    organizedBaseline: 'baselines/micro/angular/baseline.json',
  },
  {
    category: 'micro',
    engine: 'vanilla',
    legacyLatest: 'latest-micro-bench-stats-vanilla.json',
    organizedLatest: 'results/micro/vanilla/latest.json',
    legacyBaseline: 'baseline-micro-bench-stats-vanilla.json',
    organizedBaseline: 'baselines/micro/vanilla/baseline.json',
  },
];

let migrated = 0;
let skipped = 0;

for (const plan of plans) {
  const legacyLatestPath = path.join(
    ROOT,
    'scripts/performance',
    plan.legacyLatest
  );
  const organizedLatestPath = path.join(
    ROOT,
    'scripts/performance',
    plan.organizedLatest
  );
  const legacyBaselinePath = path.join(
    ROOT,
    'scripts/performance',
    plan.legacyBaseline
  );
  const organizedBaselinePath = path.join(
    ROOT,
    'scripts/performance',
    plan.organizedBaseline
  );

  // Latest
  if (fs.existsSync(legacyLatestPath)) {
    let shouldCopy = false;
    if (!fs.existsSync(organizedLatestPath)) shouldCopy = true;
    else if (FORCE) shouldCopy = true;
    if (shouldCopy) {
      let json;
      try {
        json = JSON.parse(fs.readFileSync(legacyLatestPath, 'utf8'));
      } catch (e) {
        error('Failed parsing', legacyLatestPath, e);
        skipped++;
        continue;
      }
      // Normalize: ensure engine field for vanilla, omit for angular
      if (plan.engine === 'vanilla' && !json.engine) json.engine = 'vanilla';
      if (plan.engine === 'angular' && json.engine === 'angular')
        delete json.engine; // keep optional absent
      ensureDir(path.dirname(organizedLatestPath));
      if (!DRY_RUN)
        fs.writeFileSync(organizedLatestPath, JSON.stringify(json, null, 2));
      migrated++;
      log(
        `Latest (${plan.engine}) -> ${plan.organizedLatest}${
          DRY_RUN ? ' (dry-run)' : ''
        }`
      );
      if (REMOVE && !DRY_RUN) {
        try {
          fs.unlinkSync(legacyLatestPath);
          v('Removed legacy latest', plan.legacyLatest);
        } catch {
          /* ignore */
        }
      }
    } else {
      skipped++;
      v('Skip latest (exists)', plan.organizedLatest);
    }
  } else {
    v('No legacy latest for', plan.engine);
  }

  // Baseline
  if (fs.existsSync(legacyBaselinePath)) {
    let shouldCopy = false;
    if (!fs.existsSync(organizedBaselinePath)) shouldCopy = true;
    else {
      // If organized is placeholder and legacy is real
      try {
        const organizedJson = JSON.parse(
          fs.readFileSync(organizedBaselinePath, 'utf8')
        );
        if (isPlaceholderBaseline(organizedJson)) shouldCopy = true;
      } catch {
        /* ignore parse */
      }
      if (FORCE) shouldCopy = true;
    }
    if (shouldCopy) {
      let json;
      try {
        json = JSON.parse(fs.readFileSync(legacyBaselinePath, 'utf8'));
      } catch (e) {
        error('Failed parsing', legacyBaselinePath, e);
        skipped++;
        continue;
      }
      if (plan.engine === 'vanilla' && !json.engine) json.engine = 'vanilla';
      if (plan.engine === 'angular' && json.engine === 'angular')
        delete json.engine;
      ensureDir(path.dirname(organizedBaselinePath));
      if (!DRY_RUN)
        fs.writeFileSync(organizedBaselinePath, JSON.stringify(json, null, 2));
      migrated++;
      log(
        `Baseline (${plan.engine}) -> ${plan.organizedBaseline}${
          DRY_RUN ? ' (dry-run)' : ''
        }`
      );
      if (REMOVE && !DRY_RUN) {
        try {
          fs.unlinkSync(legacyBaselinePath);
          v('Removed legacy baseline', plan.legacyBaseline);
        } catch {
          /* ignore */
        }
      }
    } else {
      skipped++;
      v('Skip baseline (exists/non-placeholder)', plan.organizedBaseline);
    }
  } else {
    v('No legacy baseline for', plan.engine);
  }
}

log(`Done. Migrated: ${migrated}, Skipped: ${skipped}`);
if (DRY_RUN)
  log(
    'Dry-run mode: no files were written. Use --force to overwrite or --remove-legacy to delete originals.'
  );

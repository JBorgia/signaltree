#!/usr/bin/env node
/**
 * Reproduces the history defects filed as TODO 6a-6d, by OUTCOME.
 *
 *   node tools/verify-history-defects.mjs
 *
 * Every check performs writes, lets the microtask queue drain, then calls
 * undo() and inspects the state. Reading getHistory().length or canUndo()
 * without a following undo() is NOT evidence — that is how the original
 * time-travel audit mis-scored itself (see docs/audits/2026-08/).
 *
 * Exits 0 when the defects still reproduce as documented, 1 when a documented
 * defect no longer reproduces — i.e. this goes RED when something is FIXED, and
 * the fixer should update the docs it cites. It is a provenance tool for the
 * figures published in docs/guides/time-travel-in-production.md, not a
 * regression test.
 *
 * Runs against the BUILT package, because an `as any` attachment is invisible
 * to a type-level read. Requires `npx nx build core` first.
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve('dist/packages/core/dist/index.js');
if (!existsSync(DIST)) {
  console.error('✗ dist not found — run `npx nx build core` first.');
  process.exit(1);
}
const core = await import(pathToFileURL(DIST).href);
const { signalTree, timeTravel, form, history, createAuditTracker } = core;

const flush = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, reproduced, detail) => {
  results.push({ name, reproduced, detail });
  console.log(
    `${reproduced ? '✓ reproduces' : '✗ NO LONGER REPRODUCES'}  ${name}`
  );
  console.log(`    ${detail}`);
};

// -- 6a: timeTravel() does not cover form() state --------------------------
{
  const t = signalTree({ profile: form({ initial: { name: '' } }) }).with(
    timeTravel({})
  );
  for (const v of ['a', 'ab', 'abc']) {
    t.$.profile.$.name.set(v);
    await flush();
  }
  const before = t.$.profile.$.name();
  t.undo();
  const after = t.$.profile.$.name();
  check(
    '6a form-only tree: timeTravel records nothing for form writes',
    after === before && t.getHistory().length === 1,
    `3 form writes -> getHistory() ${JSON.stringify(
      t.getHistory().map((e) => e.action)
    )}, ` + `undo() left name ${JSON.stringify(after)} (unchanged)`
  );
}
{
  // the mixed tree, which is the data-losing shape
  const t = signalTree({
    profile: form({ initial: { name: '' } }),
    plain: '',
  }).with(timeTravel({}));
  t.$.plain.set('p1');
  await flush();
  t.$.profile.$.name.set('ada');
  await flush();
  t.$.plain.set('p2');
  await flush();
  t.$.profile.$.name.set('ada l');
  await flush();
  const typed = t.$.profile.$.name();
  t.undo();
  const afterUndo = t.$.profile.$.name();
  check(
    '6a mixed tree: undo of an unrelated field discards form content',
    typed === 'ada l' && afterUndo !== 'ada l',
    `user typed ${JSON.stringify(
      typed
    )}; one undo() of the PLAIN field left the form at ` +
      `${JSON.stringify(afterUndo)}`
  );
}
{
  // and the mechanism that does work, so the guide's recommendation is verified too
  const t = signalTree({
    profile: form({ initial: { name: '' }, history: history() }),
  });
  for (const v of ['a', 'ab', 'abc']) {
    t.$.profile.$.name.set(v);
    await flush();
  }
  t.$.profile.history?.undo();
  await flush();
  const after = t.$.profile.$.name();
  check(
    '6a recommended path: form({ history: history() }) undo WORKS',
    after === 'ab',
    `3 writes then form.history.undo() -> ${JSON.stringify(
      after
    )} (expected "ab")`
  );
}

// -- 6b: createAuditTracker samples, so it drops changes -------------------
// NB: the 100 ms interval is NOT measured here. It is a source constant —
// `setInterval(handleChange, 100)` at packages/core/src/lib/audit/audit.ts:156.
// The sleeps below are CHOSEN from that constant; what these checks establish
// is the consequence (changes are dropped), not the number.
{
  const t = signalTree({ n: 0 });
  const log = [];
  const stop = createAuditTracker(t, log);
  await sleep(120);
  const base = log.length;
  t.$.n.set(1);
  await sleep(0); // both writes inside one sampling window
  t.$.n.set(2);
  await sleep(250);
  const collapsed = log.length - base;
  stop();
  check(
    '6b audit tracker: two writes in one window log a single entry',
    collapsed === 1,
    `writes n=1 then n=2 with no gap -> ${collapsed} entry (intermediate state lost)`
  );
}
{
  const t = signalTree({ name: 'a' });
  const log = [];
  const stop = createAuditTracker(t, log);
  await sleep(120);
  const base = log.length;
  t.$.name.set('TEMP');
  await sleep(0);
  t.$.name.set('a'); // reverted inside the same window
  await sleep(250);
  const seen = log.length - base;
  stop();
  check(
    '6b audit tracker: write-then-revert inside one window is INVISIBLE',
    seen === 0,
    `set 'TEMP' then back to 'a' -> ${seen} entries; the trail has no record it happened`
  );
}
{
  // Why it polls at all: the tracker only avoids setInterval when the tree has a
  // .subscribe method to attach to (audit.ts:150). It never does.
  const t = signalTree({ n: 0 });
  const hasSubscribe = 'subscribe' in t;
  console.log(
    `    (why it polls: tree has .subscribe? ${hasSubscribe ? 'yes' : 'NO'} ` +
      `-> the setInterval fallback at audit.ts:160 always runs)`
  );
}

// -- 6d: maxHistorySize is a buffer length, not a step count ---------------
{
  const rows = [];
  for (const cap of [undefined, 0, 1, 2, 5]) {
    const t = signalTree({ n: 0 }).with(
      timeTravel(cap === undefined ? {} : { maxHistorySize: cap })
    );
    for (let i = 1; i <= 10; i++) {
      t.$.n.set(i);
      await flush();
    }
    let spent = 0;
    while (t.canUndo() && spent < 50) {
      t.undo();
      spent++;
    }
    rows.push(`${cap === undefined ? 'omitted' : cap}=${spent}`);
  }
  const disabledAtOne = rows.includes('1=0') && rows.includes('0=0');
  check(
    '6d maxHistorySize <= 1 silently disables undo',
    disabledAtOne,
    `undo steps spendable after 10 writes — ${rows.join(
      ', '
    )} (N entries yields N-1 steps)`
  );
}

// --------------------------------------------------------------------------
const gone = results.filter((r) => !r.reproduced);
console.log(
  `\n${results.length - gone.length}/${
    results.length
  } documented behaviours reproduce.`
);
if (gone.length) {
  console.log(
    '\n⚠️ A documented defect no longer reproduces. That is good news — but the docs\n' +
      '   citing it are now wrong. Update docs/guides/time-travel-in-production.md and\n' +
      '   the matching TODO item before landing the fix.'
  );
  for (const g of gone) console.log(`   · ${g.name}`);
  process.exit(1);
}
process.exit(0);

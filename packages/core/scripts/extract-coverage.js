const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'coverage', 'coverage-final.json');
if (!fs.existsSync(p)) {
  console.error('coverage file not found:', p);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const files = [];
for (const [abs, v] of Object.entries(data)) {
  const rel = abs.replace(process.cwd() + '/', '');
  if (!rel.startsWith('packages/core/src/')) continue;
  const stmtMap = v.statementMap || {};
  const s = v.s || {};
  const ids = Object.keys(stmtMap);
  const total = ids.length;
  let covered = 0;
  const uncovered = [];
  for (const id of ids) {
    const hit = s && s[id] ? s[id] : 0;
    if (hit > 0) covered++;
    else {
      const loc = stmtMap[id];
      if (loc && loc.start && typeof loc.start.line === 'number')
        uncovered.push({ id, line: loc.start.line });
      else uncovered.push({ id, line: null });
    }
  }
  const pct = total ? Math.round((covered / total) * 10000) / 100 : 100;
  files.push({
    path: rel,
    total,
    covered,
    pct,
    uncoveredCount: uncovered.length,
    uncoveredLines: uncovered.slice(0, 50),
  });
}
files.sort((a, b) => a.pct - b.pct || b.uncoveredCount - a.uncoveredCount);
const out = path.resolve(
  process.cwd(),
  'packages/core/coverage/coverage-hotspots.json'
);
fs.writeFileSync(out, JSON.stringify(files, null, 2));
console.log('wrote', out);

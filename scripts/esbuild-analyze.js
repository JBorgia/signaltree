#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function humanBytes(n) {
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return n.toFixed(2) + ' ' + units[i];
}

if (process.argv.length < 5) {
  console.error(
    'Usage: esbuild-analyze.js <metafile.json> <out.html> <out.txt>'
  );
  process.exit(2);
}

const [, , metaPath, outHtml, outTxt] = process.argv;
if (!fs.existsSync(metaPath)) {
  console.error('Metafile not found:', metaPath);
  process.exit(3);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

// Aggregate input sizes across all outputs
const inputsMap = Object.create(null);
let totalBytes = 0;
for (const outName of Object.keys(meta.outputs || {})) {
  const out = meta.outputs[outName];
  if (out && out.inputs) {
    for (const inPath of Object.keys(out.inputs)) {
      const info = out.inputs[inPath];
      const bytes = info.bytes || 0;
      inputsMap[inPath] = (inputsMap[inPath] || 0) + bytes;
      totalBytes += bytes;
    }
  }
}

// Fallback: some metafiles put sizes in meta.inputs
if (totalBytes === 0 && meta.inputs) {
  for (const inPath of Object.keys(meta.inputs)) {
    const info = meta.inputs[inPath];
    const bytes = info.bytes || 0;
    inputsMap[inPath] = (inputsMap[inPath] || 0) + bytes;
    totalBytes += bytes;
  }
}

const rows = Object.keys(inputsMap)
  .map((p) => ({ path: p, bytes: inputsMap[p] }))
  .sort((a, b) => b.bytes - a.bytes);

const top = rows.slice(0, 50);

// Write HTML
const title = 'esbuild analysis: ' + path.basename(metaPath);
const html = [
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,Seg\noe UI,Roboto,Arial;margin:24px}table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{background:#f6f6f6}</style></head><body>`,
  `<h1>${title}</h1>`,
  `<p>Total bytes (sum of inputs): <strong>${totalBytes}</strong> (${humanBytes(
    totalBytes
  )})</p>`,
  `<table><thead><tr><th>#</th><th>Bytes</th><th>%</th><th>Path</th></tr></thead><tbody>`,
];

for (let i = 0; i < top.length; i++) {
  const r = top[i];
  const pct = totalBytes
    ? ((r.bytes / totalBytes) * 100).toFixed(2) + '%'
    : '0%';
  html.push(
    `<tr><td>${i + 1}</td><td>${r.bytes} (${humanBytes(
      r.bytes
    )})</td><td>${pct}</td><td><code>${r.path}</code></td></tr>`
  );
}

html.push('</tbody></table>');
if (rows.length > top.length)
  html.push(`<p>... and ${rows.length - top.length} more inputs</p>`);
html.push('</body></html>');

fs.writeFileSync(outHtml, html.join('\n'), 'utf8');

// Write text summary
const text = [];
text.push(`esbuild analysis for: ${metaPath}`);
text.push(`Total bytes: ${totalBytes} (${humanBytes(totalBytes)})`);
text.push('Top contributors:');
for (let i = 0; i < Math.min(20, rows.length); i++) {
  const r = rows[i];
  text.push(
    `${i + 1}. ${r.path} \u2014 ${r.bytes} (${humanBytes(r.bytes)}) \u2014 ${
      totalBytes ? ((r.bytes / totalBytes) * 100).toFixed(2) + '%' : '0%'
    }`
  );
}
if (rows.length > 20) text.push(`...and ${rows.length - 20} more`);

fs.writeFileSync(outTxt, text.join('\n'), 'utf8');
console.log('Wrote', outHtml, 'and', outTxt);

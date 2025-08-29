// Shared parsing and statistics helpers for performance scripts
const zlib = require('zlib');

function parseRecursiveOutput(out) {
  const lines = out.split(/\r?\n/);
  const avgRe = /(Basic|Medium|Extreme|Unlimited).*?:\s*([0-9.]+)ms\s*avg/i;
  const metrics = {};
  for (const line of lines) {
    const m = line.match(avgRe);
    if (m) metrics[m[1].toLowerCase()] = Number(m[2]);
  }
  return metrics;
}

function parseBundleReport(out) {
  const blocks = (out || '').split('\ud83d\udce6').slice(1);
  const packages = [];
  for (const block of blocks) {
    const nameLine = block.split(/\r?\n/)[0] || '';
    const name = nameLine.replace(':', '').trim();
    const gzMatch = block.match(/Gzipped:\s*([0-9.]+)KB/i);
    const gz = gzMatch ? Number(gzMatch[1]) : null;
    packages.push({ package: name, gzippedKB: gz });
  }
  return packages;
}

function stats(values) {
  if (!values || values.length === 0)
    return { runs: 0, mean: null, min: null, max: null, stddev: null };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  return { runs: n, mean, min, max, stddev };
}

function fmt(n) {
  return typeof n === 'number' ? Number(n.toFixed(3)) : null;
}

function gzipSizeSync(buffer) {
  try {
    return zlib.gzipSync(Buffer.from(buffer)).length;
  } catch {
    return null;
  }
}

module.exports = {
  parseRecursiveOutput,
  parseBundleReport,
  stats,
  fmt,
  gzipSizeSync,
};

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

function pctChange(current, baseline) {
  if (typeof current !== 'number' || typeof baseline !== 'number') return null;
  if (baseline === 0) return current === 0 ? 0 : Infinity;
  return ((current - baseline) / baseline) * 100;
}

function indexBy(arr, key = 'name') {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (const it of arr) {
    const k = it && it[key];
    if (k != null) out[k] = it;
  }
  return out;
}

function deltaPackages(current, baseline) {
  const curIdx = indexBy(current || [], 'name');
  const baseIdx = indexBy(baseline || [], 'name');
  const names = Array.from(
    new Set([...Object.keys(curIdx), ...Object.keys(baseIdx)])
  );
  return names.map((n) => {
    const c = curIdx[n] || {};
    const b = baseIdx[n] || {};
    return {
      name: n,
      gzipSize: c.gzipSize ?? null,
      gzipSizeBaseline: b.gzipSize ?? null,
      gzipSizePct: pctChange(c.gzipSize, b.gzipSize),
      passed: c.passed,
      maxAllowed: c.maxAllowed,
    };
  });
}

function deltaPerf(currentSummary, baselineSummary) {
  const keys = ['basic', 'medium', 'extreme', 'unlimited'];
  const out = {};
  for (const k of keys) {
    const c = currentSummary?.[k]?.mean ?? null;
    const b = baselineSummary?.[k]?.mean ?? null;
    out[k] = { mean: c, baseline: b, pct: pctChange(c, b) };
  }
  return out;
}

function deltaProxy(current, baseline) {
  const out = {};
  for (const k of ['set', 'update']) {
    const c = current?.[k]?.mean ?? null;
    const b = baseline?.[k]?.mean ?? null;
    out[k] = { mean: c, baseline: b, pct: pctChange(c, b) };
  }
  return out;
}

module.exports = {
  parseRecursiveOutput,
  parseBundleReport,
  parseProxyOverhead: function (out) {
    try {
      const s =
        /set\(\) via call\s*:.*?mean=([0-9.]+)\s*ns\s*min=([0-9.]+).*max=([0-9.]+)/i.exec(
          out || ''
        );
      const u =
        /update\(\) via call\s*:.*?mean=([0-9.]+)\s*ns\s*min=([0-9.]+).*max=([0-9.]+)/i.exec(
          out || ''
        );
      if (!s && !u) return null;
      const toNums = (m) => ({
        mean: m ? Number(m[1]) : null,
        min: m ? Number(m[2]) : null,
        max: m ? Number(m[3]) : null,
      });
      return { set: toNums(s), update: toNums(u) };
    } catch {
      return null;
    }
  },
  stats,
  fmt,
  gzipSizeSync,
  pctChange,
  deltaPackages,
  deltaPerf,
  deltaProxy,
};

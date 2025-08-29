const metrics = require('../lib/metrics.cjs');

describe('scripts/lib/metrics.cjs', () => {
  test('parseRecursiveOutput extracts averages for levels', () => {
    const sample = `Some header
Basic: 1.234ms avg
Noise line
Medium: 2.5ms avg
Extra
Extreme: 10.0ms avg
Unlimited: 123.456ms avg
`;
    const out = metrics.parseRecursiveOutput(sample);
    expect(out).toEqual({
      basic: 1.234,
      medium: 2.5,
      extreme: 10.0,
      unlimited: 123.456,
    });
  });

  test('parseBundleReport parses gzipped KB values from blocks', () => {
    const sample =
      '\ud83d\udce6 core:\nGzipped: 6.64KB\n\n\ud83d\udce6 batching:\nGzipped: 1.86KB\n';
    const pkgs = metrics.parseBundleReport(sample);
    expect(pkgs).toEqual([
      { package: 'core', gzippedKB: 6.64 },
      { package: 'batching', gzippedKB: 1.86 },
    ]);
  });

  test('stats computes runs, mean, min, max, stddev (approx)', () => {
    const values = [1, 2, 3, 4];
    const s = metrics.stats(values);
    expect(s.runs).toBe(4);
    expect(s.mean).toBeCloseTo(2.5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    // variance = ((1.5^2+0.5^2+0.5^2+1.5^2)/4)= (2.25+0.25+0.25+2.25)/4=5/4=1.25 => stddev ~1.118
    expect(s.stddev).toBeCloseTo(Math.sqrt(1.25));
  });

  test('fmt formats numbers to 3 decimals and returns null for non-number', () => {
    expect(metrics.fmt(1.234567)).toBeCloseTo(1.235);
    expect(metrics.fmt(null)).toBeNull();
  });

  test('gzipSizeSync returns numeric size for input', () => {
    const sz = metrics.gzipSizeSync('hello world');
    expect(typeof sz).toBe('number');
    expect(sz).toBeGreaterThan(0);
  });
});

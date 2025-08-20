// Shared performance benchmarking utilities
export const useColor = !process.env.NO_COLOR;
const c = (code) => (s) => useColor ? `\u001b[${code}m${s}\u001b[0m` : s;
export const colors = {
  cyan: c('36'),
  brightCyan: c('96'),
  magenta: c('35'),
  brightMagenta: c('95'),
  yellow: c('33'),
  brightYellow: c('93'),
  green: c('32'),
  brightGreen: c('92'),
  red: c('31'),
  brightRed: c('91'),
  blue: c('34'),
  brightBlue: c('94'),
  white: c('37'),
  brightWhite: c('97'),
  dim: c('2'),
  bold: c('1'),
  gray: c('90'),
};
export function stripAnsi(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\u001b' && s[i + 1] === '[') {
      i += 2;
      while (i < s.length && s[i] !== 'm') i++;
    } else {
      out += s[i];
    }
  }
  return out;
}
export function getVisualWidth(str) {
  const stripped = stripAnsi(str);
  let w = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x2600 && code <= 0x26ff) ||
      (code >= 0x2700 && code <= 0x27bf) ||
      (code >= 0x1f900 && code <= 0x1f9ff)
    )
      w += 2;
    else w++;
  }
  return w;
}
export function box(
  lines,
  {
    borderColor = colors.cyan,
    titleColor = colors.brightWhite,
    contentColor = colors.white,
    style = 'normal',
  } = {}
) {
  const styles = {
    rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    bold: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
    normal: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  };
  const chars = styles[style] || styles.normal;
  const processed = lines.map((l, i) =>
    i === 0 ? titleColor(l) : contentColor(l)
  );
  const width = Math.max(...lines.map((l) => getVisualWidth(l)));
  const top = chars.tl + chars.h.repeat(width + 2) + chars.tr;
  const mid = processed
    .map((l) => {
      const vis = getVisualWidth(l);
      return chars.v + ' ' + l + ' '.repeat(width - vis) + ' ' + chars.v;
    })
    .join('\n');
  const bottom = chars.bl + chars.h.repeat(width + 2) + chars.br;
  return borderColor([top, mid, bottom].join('\n'));
}
export const THRESHOLDS = {
  median: { good: 0.001, medium: 0.005 },
  stddevRatio: { good: 0.25, medium: 0.5 },
  tailRatio: { good: 1, medium: 2 },
};
export function gradeValue({ median }) {
  const t = THRESHOLDS;
  let grade = 'bad';
  if (median < t.median.good) grade = 'good';
  else if (median < t.median.medium) grade = 'medium';
  return grade;
}
// Convenience helper for direct median value grading
export function gradeMedian(median) {
  if (median < THRESHOLDS.median.good) return 'good';
  if (median < THRESHOLDS.median.medium) return 'medium';
  return 'bad';
}
export function enhancedTable(
  title,
  data,
  {
    headerColor = colors.brightCyan,
    borderColor = colors.cyan,
    labelColor = colors.brightYellow,
    valueColors = {
      good: colors.brightGreen,
      medium: colors.yellow,
      bad: colors.brightRed,
    },
    thresholds,
  } = {}
) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const widths = headers.map((h) =>
    Math.max(h.length, ...data.map((r) => stripAnsi(String(r[h])).length))
  );
  const chars = {
    tl: '╭',
    tr: '╮',
    ml: '├',
    mr: '┤',
    bl: '╰',
    br: '╯',
    mc: '┼',
    bc: '┴',
    h: '─',
    v: '│',
    hl: '╞',
    hc: '═',
    hr: '╡',
    dc: '╤',
  };
  const totalWidth = widths.reduce((a, b) => a + b, 0) + widths.length * 3 - 1;
  console.log(borderColor(chars.tl + chars.h.repeat(totalWidth) + chars.tr));
  const titleVis = title.length;
  const padding = ' '.repeat(Math.max(0, totalWidth - titleVis - 2));
  console.log(
    borderColor(chars.v) +
      ' ' +
      headerColor(colors.bold ? colors.bold(title) : title) +
      padding +
      ' ' +
      borderColor(chars.v)
  );
  const titleSep =
    chars.hl +
    widths.map((w) => chars.hc.repeat(w + 2)).join(chars.dc) +
    chars.hr;
  console.log(borderColor(titleSep));
  const headerRow = headers
    .map((h, i) =>
      headerColor(
        colors.bold
          ? colors.bold(' ' + h.padEnd(widths[i]) + ' ')
          : ' ' + h.padEnd(widths[i]) + ' '
      )
    )
    .join(borderColor(chars.v));
  console.log(borderColor(chars.v) + headerRow + borderColor(chars.v));
  const midLine = (l, m, r) =>
    borderColor(l + widths.map((w) => chars.h.repeat(w + 2)).join(m) + r);
  console.log(midLine(chars.ml, chars.mc, chars.mr));
  data.forEach((row) => {
    const cells = headers.map((h, i) => {
      const raw = String(row[h]);
      const plain = stripAnsi(raw);
      let colored = raw;
      if (h === 'metric' || h === 'name') colored = labelColor(raw);
      else if (h === 'description') colored = colors.gray(raw);
      else if (!isNaN(parseFloat(plain))) {
        const num = parseFloat(plain);
        if (thresholds && (h === 'median' || h === 'stddev' || h === 'p95')) {
          if (h === 'median') {
            const { good, medium } = thresholds.median;
            colored =
              num < good
                ? valueColors.good(raw)
                : num < medium
                ? valueColors.medium(raw)
                : valueColors.bad(raw);
          } else if (h === 'stddev') {
            const medianVal = parseFloat(stripAnsi(String(row['median'])));
            const ratio = medianVal > 0 ? num / medianVal : 0;
            const { good, medium } = thresholds.stddevRatio;
            colored =
              ratio <= good
                ? valueColors.good(raw)
                : ratio <= medium
                ? valueColors.medium(raw)
                : valueColors.bad(raw);
          } else if (h === 'p95') {
            const medianVal = parseFloat(stripAnsi(String(row['median'])));
            const tailRatio = medianVal > 0 ? (num - medianVal) / medianVal : 0;
            const { good, medium } = thresholds.tailRatio;
            colored =
              tailRatio <= good
                ? valueColors.good(raw)
                : tailRatio <= medium
                ? valueColors.medium(raw)
                : valueColors.bad(raw);
          }
        } else {
          colored =
            num < 0.001
              ? valueColors.good(raw)
              : num < 0.005
              ? valueColors.medium(raw)
              : valueColors.bad(raw);
        }
      }
      const vis = plain.length;
      return ' ' + colored + ' '.repeat(widths[i] - vis + 1);
    });
    console.log(
      borderColor(chars.v) +
        cells.join(borderColor(chars.v)) +
        borderColor(chars.v)
    );
    if (row.isSeparator) console.log(midLine(chars.ml, chars.mc, chars.mr));
  });
  console.log(midLine(chars.bl, chars.bc, chars.br));
}

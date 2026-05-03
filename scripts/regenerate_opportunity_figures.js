const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const geojson = JSON.parse(fs.readFileSync(path.join(root, 'dashboards/opportunity/data/cbsa.geojson'), 'utf8'));
const outputDir = path.join(root, 'images/opportunity-analysis');

const metros = geojson.features
  .map((feature) => feature.properties)
  .filter((d) => Number.isFinite(d.gap_coi_idx));

const fmt = (value, digits = 1) => Number(value).toFixed(digits);
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const minMax = (arr) => [Math.min(...arr), Math.max(...arr)];
const FIGURE_W = 980;
const COLORS = {
  text: '#1f2a3d',
  muted: '#687386',
  grid: '#e8ecf2',
  hcv: '#b98678',
  renter: '#77a9bf',
  pos: '#d8b36c',
  zero: '#4d596b',
};

function wrapLabel(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function shortLabel(text, maxChars) {
  const value = String(text);
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

function baseSvg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>
text{font-family:Lato,Arial,sans-serif}
.title{font-family:Montserrat,Arial,sans-serif;font-size:22px;font-weight:700;fill:${COLORS.text}}
.subtitle{font-size:13px;fill:${COLORS.muted}}
.caption{font-size:11px;fill:${COLORS.muted}}
.axis{font-size:12px;fill:${COLORS.muted}}
.label{font-size:13px;fill:${COLORS.text}}
.inbar-label{font-size:12px;font-weight:700;fill:#fff}
.inbar-dark{font-size:12px;font-weight:700;fill:${COLORS.text}}
.small-label{font-size:12px;fill:${COLORS.muted}}
.value{font-size:13px;font-weight:700;fill:${COLORS.text}}
.grid{stroke:${COLORS.grid};stroke-width:1}
.baseline{stroke:${COLORS.zero};stroke-width:1.3}
.hcv{fill:${COLORS.hcv}}
.renter{fill:${COLORS.renter}}
.neg{fill:${COLORS.hcv}}
.pos{fill:${COLORS.pos}}
</style>${body}</svg>\n`;
}

function nationalExposure() {
  const rows = [
    ['Overall COI', 36.33962266446483, 48.27358741252271],
    ['Education', 37.982175032879645, 49.706724002439806],
    ['Health & Env.', 54.47945345475899, 54.71371354229631],
    ['Social & Econ.', 33.88882113375836, 46.36429200904782],
  ];
  const width = FIGURE_W;
  const height = 630;
  const left = 0;
  const right = 900;
  const top = 128;
  const barH = 28;
  const rowGap = 112;
  const scale = (v) => left + (v / 60) * (right - left);
  let body = '';
  body += `<text x="0" y="28" class="title">Lower opportunity exposure</text>`;
  body += `<rect x="0" y="56" width="12" height="12" class="hcv"/><text x="20" y="67" class="axis">HCV households</text>`;
  body += `<rect x="150" y="56" width="12" height="12" class="renter"/><text x="170" y="67" class="axis">All renters</text>`;

  [0, 25, 50].forEach((tick) => {
    const x = scale(tick);
    body += `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${top + rowGap * 3 + 72}" class="grid"/>`;
    body += `<text x="${x}" y="${top + rowGap * 3 + 98}" class="axis" text-anchor="middle">${tick}</text>`;
  });
  body += `<text x="${right}" y="${top + rowGap * 3 + 98}" class="axis" text-anchor="end">COI score</text>`;

  rows.forEach(([label, hcv, renter], i) => {
    const y = top + i * rowGap;
    const hcvW = scale(hcv) - left;
    const renterW = scale(renter) - left;
    if (i > 0) body += `<line x1="0" y1="${y - 30}" x2="${right}" y2="${y - 30}" class="grid"/>`;
    body += `<text x="0" y="${y - 20}" class="label">${esc(label)}</text>`;
    body += `<rect x="${left}" y="${y}" width="${hcvW}" height="${barH}" class="hcv"/>`;
    body += `<rect x="${left}" y="${y + 40}" width="${renterW}" height="${barH}" class="renter"/>`;
    body += `<text x="12" y="${y + 19}" class="inbar-label">HCV</text>`;
    body += `<text x="12" y="${y + 59}" class="inbar-label">Renters</text>`;
    body += `<text x="${hcvW - 10}" y="${y - 6}" class="value" text-anchor="end">${fmt(hcv)}</text>`;
    body += `<text x="${renterW - 10}" y="${y + 34}" class="value" text-anchor="end">${fmt(renter)}</text>`;
  });

  body += `<text x="0" y="${height - 22}" class="caption">Source: COI 3.0 and HCV household distribution data.</text>`;
  return baseSvg(width, height, body);
}

function metroExtremes() {
  const width = FIGURE_W;
  const height = 620;
  const left = 0;
  const right = 945;
  const top = 90;
  const rowGap = 33;
  const min = -25;
  const max = 10;
  const scale = (v) => left + ((v - min) / (max - min)) * (right - left);
  const zero = scale(0);
  const negative = [...metros].sort((a, b) => a.gap_coi_idx - b.gap_coi_idx).slice(0, 7);
  const positive = [...metros].sort((a, b) => b.gap_coi_idx - a.gap_coi_idx).slice(0, 7).reverse();
  const rows = [...negative, ...positive];
  let body = '';
  body += `<text x="0" y="28" class="title">Metro gaps</text>`;
  body += `<text x="0" y="50" class="subtitle">HCV households minus all renters, COI points</text>`;
  [-20, -10, 0, 10].forEach((tick) => {
    const x = scale(tick);
    body += `<line x1="${x}" y1="${top - 18}" x2="${x}" y2="${top + rowGap * (rows.length - 1) + 24}" class="grid"/>`;
    body += `<text x="${x}" y="${top + rowGap * (rows.length - 1) + 50}" class="axis" text-anchor="middle">${tick > 0 ? '+' : ''}${tick}</text>`;
  });
  body += `<line x1="${zero}" y1="${top - 24}" x2="${zero}" y2="${top + rowGap * (rows.length - 1) + 27}" class="baseline"/>`;
  body += `<text x="${zero + 8}" y="${top - 32}" class="small-label">0</text>`;

  rows.forEach((d, i) => {
    const y = top + i * rowGap;
    const value = d.gap_coi_idx;
    const x = scale(value);
    const cls = value < 0 ? 'neg' : 'pos';
    const x1 = Math.min(x, zero);
    const w = Math.abs(x - zero);
    body += `<rect x="${x1}" y="${y - 15}" width="${w}" height="20" class="${cls}" opacity="0.94"/>`;
    if (w > 155) {
      body += `<text x="${x1 + 10}" y="${y - 1}" class="${value < 0 ? 'inbar-label' : 'inbar-dark'}">${esc(shortLabel(d.cbsa_name, 24))}</text>`;
    } else {
      body += `<text x="${value < 0 ? x1 - 10 : x + 46}" y="${y - 1}" class="label" text-anchor="${value < 0 ? 'end' : 'start'}">${esc(shortLabel(d.cbsa_name, 20))}</text>`;
    }
    if (value < 0) {
      body += `<text x="${zero - 10}" y="${y}" class="inbar-label" text-anchor="end">${fmt(value)}</text>`;
    } else {
      body += `<text x="${x + 10}" y="${y}" class="value" text-anchor="start">+${fmt(value)}</text>`;
    }
    if (i === 6) body += `<line x1="0" y1="${y + 20}" x2="${right}" y2="${y + 20}" class="grid"/>`;
  });

  body += `<text x="0" y="${height - 22}" class="caption">Negative values mean lower HCV opportunity exposure than renters in the same metro.</text>`;
  return baseSvg(width, height, body);
}

function scatter() {
  const width = FIGURE_W;
  const height = 680;
  const left = 58;
  const right = 950;
  const top = 86;
  const bottom = 585;
  const xScale = (v) => left + (v / 80) * (right - left);
  const yScale = (v) => bottom - (v / 80) * (bottom - top);
  const [minGap, maxGap] = minMax(metros.map((d) => d.gap_coi_idx));
  let body = '';
  body += `<text x="0" y="28" class="title">Most metros fall below the benchmark</text>`;
  body += `<text x="0" y="50" class="subtitle">Below diagonal = lower HCV opportunity exposure</text>`;
  [0, 20, 40, 60, 80].forEach((tick) => {
    const x = xScale(tick);
    const y = yScale(tick);
    body += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="grid"/>`;
    body += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="grid"/>`;
    body += `<text x="${x}" y="${bottom + 26}" class="axis" text-anchor="middle">${tick}</text>`;
    body += `<text x="${left - 12}" y="${y + 5}" class="axis" text-anchor="end">${tick}</text>`;
  });
  body += `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${top}" class="baseline" stroke-dasharray="8 8"/>`;
  body += `<text x="${right - 128}" y="${top + 22}" class="small-label">same exposure</text>`;

  metros.forEach((d) => {
    const gap = d.gap_coi_idx;
    const color = gap < 0 ? COLORS.hcv : COLORS.pos;
    const opacity = gap < 0 ? 0.42 : 0.68;
    const r = gap < 0 ? 4.3 : 5.2;
    body += `<circle cx="${xScale(d.renter_coi_idx)}" cy="${yScale(d.hcv_coi_idx)}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
  });

  body += `<text x="${(left + right) / 2}" y="${height - 48}" class="label" text-anchor="middle">Renters' COI score</text>`;
  body += `<text x="15" y="${(top + bottom) / 2}" class="label" transform="rotate(-90 15 ${(top + bottom) / 2})" text-anchor="middle">HCV COI score</text>`;
  body += `<text x="0" y="${height - 18}" class="caption">Each dot is one metropolitan area.</text>`;
  return baseSvg(width, height, body);
}

function distribution() {
  const bins = [
    [-25, -20], [-20, -15], [-15, -10], [-10, -5], [-5, 0], [0, 5], [5, 10],
  ];
  const counts = bins.map(([lo, hi]) => metros.filter((d) => d.gap_coi_idx >= lo && d.gap_coi_idx < hi).length);
  const width = FIGURE_W;
  const height = 470;
  const left = 50;
  const right = 950;
  const top = 82;
  const bottom = 385;
  const maxCount = Math.max(...counts);
  const barW = (right - left) / bins.length - 18;
  let body = '';
  body += `<text x="0" y="28" class="title">Negative gaps dominate</text>`;
  body += `<text x="0" y="50" class="subtitle">Metro areas by overall opportunity gap</text>`;
  [0, 50, 100, 150].forEach((tick) => {
    const y = bottom - (tick / 150) * (bottom - top);
    body += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="grid"/>`;
    body += `<text x="${left - 18}" y="${y + 5}" class="axis" text-anchor="end">${tick}</text>`;
  });
  counts.forEach((count, i) => {
    const [lo, hi] = bins[i];
    const x = left + i * ((right - left) / bins.length) + 9;
    const h = (count / maxCount) * (bottom - top);
    const cls = hi <= 0 ? 'neg' : 'pos';
    body += `<rect x="${x}" y="${bottom - h}" width="${barW}" height="${h}" class="${cls}" opacity="0.9"/>`;
    body += `<text x="${x + barW / 2}" y="${bottom - h - 12}" class="value" text-anchor="middle">${count}</text>`;
    body += `<text x="${x + barW / 2}" y="${bottom + 34}" class="axis" text-anchor="middle">${lo} to ${hi}</text>`;
  });
  const negativeCount = metros.filter((d) => d.gap_coi_idx < 0).length;
  body += `<text x="0" y="${height - 18}" class="caption">${negativeCount} of ${metros.length} metro areas have negative overall opportunity gaps.</text>`;
  return baseSvg(width, height, body);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'national_coi_exposure.svg'), nationalExposure());
fs.writeFileSync(path.join(outputDir, 'metro_gap_extremes.svg'), metroExtremes());
fs.writeFileSync(path.join(outputDir, 'hcv_vs_renter_scatter.svg'), scatter());
fs.writeFileSync(path.join(outputDir, 'overall_gap_distribution.svg'), distribution());

console.log('Regenerated opportunity figures in images/opportunity-analysis');

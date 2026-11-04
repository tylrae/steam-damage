// Runs the parser over every export in test-data/ and compares with the known-good totals
// in test-data/expected.json (gitignored, since it holds personal figures). Run: npm run check
//
// .html files are treated as the clipboard's HTML, everything else as plain text. Saving one paste
// both ways from src/dev.html lets us see whether the two input paths agree.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/parser.js');
const RATES = require('../src/rates.js');

// Known-good numbers for a real export. Personal, so they live in the gitignored test-data/ folder.
const expectedFile = path.join(__dirname, '..', 'test-data', 'expected.json');
if (!fs.existsSync(expectedFile)) {
  console.log('No test-data/expected.json. Put your export and its known-good totals in test-data/ first.');
  process.exit(0);
}
const EXPECTED = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));

const loose = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const close = (actual, expected) => Math.abs((actual || 0) - expected) <= Math.max(2, expected * 0.01);
let failures = 0;

function line(ok, label, actual, expected) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'OFF '}  ${label.padEnd(34)} got ${String(actual).padEnd(12)} expected ≈ ${expected}`);
}

const dir = path.join(__dirname, '..', 'test-data');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(html?|txt|tsv|csv)$/i.test(f)) : [];
if (!files.length) {
  console.log('No exports in test-data/. Save a paste from src/dev.html (or a .csv/.txt) there first.');
  process.exit(0);
}

for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const parsed = P.parse(/\.html?$/i.test(f) ? { html: raw } : raw);
  const s = P.summarise(parsed);
  const counts = {};
  for (const e of parsed.entries) counts[e.kind] = (counts[e.kind] || 0) + 1;
  const range = s.dateRange.first ? `${s.dateRange.first.toISOString().slice(0, 10)} → ${s.dateRange.last.toISOString().slice(0, 10)}` : 'none';

  console.log(`\n${f}  [read as ${parsed.source || 'nothing'}]  ${parsed.entries.length} rows, ${range}`);
  console.log('  ' + Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(' · '));
  for (const w of parsed.warnings) console.log('  ! ' + w.message);

  for (const c of Object.keys(EXPECTED.total)) line(close(s.totals.net[c], EXPECTED.total[c]), `Total (${c})`, s.totals.net[c], EXPECTED.total[c]);
  for (const [name, exp] of Object.entries(EXPECTED.games)) {
    const g = s.games.find(x => loose(x.name) === loose(name));
    for (const c of ['AUD', 'USD']) if (exp[c] != null) line(!!g && close(g.net[c], exp[c]), `${name} (${c})`, g ? g.net[c] : 'missing', exp[c]);
    if (exp.purchases != null) line(!!g && g.purchases === exp.purchases, `${name} purchases`, g ? g.purchases : 'missing', exp.purchases);
  }
  for (const side of ['sold', 'bought']) {
    for (const [c, v] of Object.entries(EXPECTED.market[side])) line(close(s.market[side][c], v), `Market ${side} (${c})`, s.market[side][c], v);
  }
  const zero = new Set(s.refundedToZero.map(loose));
  for (const name of EXPECTED.refundedToZero) {
    const hit = [...zero].some(z => z.includes(loose(name)));
    line(hit, `Refunded to $0: ${name}`, hit ? 'yes' : 'no', 'yes');
  }
  const unknown = parsed.entries.filter(e => e.kind === 'unknown');
  if (unknown.length) {
    console.log('  Unrecognised rows (first 10):');
    for (const e of unknown.slice(0, 10)) console.log('    ' + e.rowText.slice(0, 140));
  }
  const conv = P.summarise(parsed, { currency: s.walletCurrency, rates: RATES });
  console.log(`  Converted to ${s.walletCurrency} at yearly rates: ${JSON.stringify(conv.totals.net)}` + (conv.conversion.unconverted.length ? ` (not convertible: ${conv.conversion.unconverted})` : ''));
  console.log('  Top 10 by spend: '+ s.games.slice(0, 10).map(g => `${g.name} ${JSON.stringify(g.net)}`).join(' · '));
}

console.log(failures ? `\n${failures} check(s) off.` : '\nAll checks pass.');
process.exitCode = failures ? 1 : 0;

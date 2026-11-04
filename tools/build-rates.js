// Builds src/rates.js: yearly-average exchange rates (1 USD = x). Run: npm run rates
//
// Sources, in order of trust. A later source only fills currencies and years the earlier ones lack.
//   1. European Central Bank reference rates via frankfurter.dev (most currencies).
//   2. World Bank official yearly averages (Steam currencies the ECB doesn't publish; complete years only).
//   3. Daily rates from fawazahmed0's currency-api, sampled twice a month (this year, and anything
//      still missing since March 2024, when that archive starts).
// A gap between two known years (e.g. TWD 2021-2023) is filled with the average of its neighbours.
//
// The site never fetches rates itself, so visitors' browsers make no network requests. Re-run this
// before each launch so the current year's average is up to date.
const fs = require('node:fs');
const path = require('node:path');

const FIRST_YEAR = 2004; // Steam's first full year of sales
const API = 'https://api.frankfurter.dev/v1';
const WORLD_BANK = 'https://api.worldbank.org/v2/country';
const DAILY = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api';
const DAILY_FIRST = '2024-03-02';

// Steam currencies the ECB doesn't cover, with the World Bank's country code (Taiwan isn't a member).
const EXTRA = { AED: 'ARE', ARS: 'ARG', CLP: 'CHL', COP: 'COL', CRC: 'CRI', KWD: 'KWT', KZT: 'KAZ', PEN: 'PER', QAR: 'QAT', RUB: 'RUS', SAR: 'SAU', TWD: null, UAH: 'UKR', UYU: 'URY', VND: 'VNM' };

const sig = (v, n = 6) => Number(v.toPrecision(n));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const years = {};
  const filled = {}; // cur -> { source: [years] }, for the log
  const fill = (y, cur, v, source) => {
    if (years[y][cur] || !(v > 0)) return;
    years[y][cur] = sig(v);
    ((filled[cur] ||= {})[source] ||= []).push(y);
  };

  // 1. ECB.
  for (let y = FIRST_YEAR; y <= thisYear; y++) {
    const end = y === thisYear ? now.toISOString().slice(0, 10) : `${y}-12-31`;
    const days = Object.values((await getJson(`${API}/${y}-01-01..${end}?base=USD`)).rates);
    const sums = {}, counts = {};
    for (const day of days) {
      for (const [cur, v] of Object.entries(day)) {
        sums[cur] = (sums[cur] || 0) + v;
        counts[cur] = (counts[cur] || 0) + 1;
      }
    }
    years[y] = { USD: 1 };
    for (const cur of Object.keys(sums).sort()) years[y][cur] = sig(sums[cur] / counts[cur]);
    console.log(`${y}: ${days.length} days, ${Object.keys(years[y]).length} currencies`);
  }

  // 2. World Bank yearly averages (local currency per US$). The current year never has one yet.
  const byCountry = Object.fromEntries(Object.entries(EXTRA).filter(([, c]) => c).map(([cur, c]) => [c, cur]));
  const wb = await getJson(`${WORLD_BANK}/${Object.keys(byCountry).join(';')}/indicator/PA.NUS.FCRF?format=json&date=${FIRST_YEAR}:${thisYear - 1}&per_page=1000`);
  for (const r of wb[1] || []) fill(Number(r.date), byCountry[r.countryiso3code], r.value, 'World Bank');

  // 3. Daily snapshots on the 1st and 15th of each month, for the years still missing something.
  const days = [];
  for (let y = Number(DAILY_FIRST.slice(0, 4)); y <= thisYear; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const dd of ['01', '15']) {
        const day = `${y}-${String(m).padStart(2, '0')}-${dd}`;
        if (day >= DAILY_FIRST && day <= now.toISOString().slice(0, 10)) days.push(day);
      }
    }
  }
  const sums = {}, counts = {};
  for (const day of days) {
    const y = Number(day.slice(0, 4));
    const need = Object.keys(EXTRA).filter(cur => !years[y][cur]);
    if (!need.length) continue;
    let usd;
    try { usd = (await getJson(`${DAILY}@${day}/v1/currencies/usd.json`)).usd; } catch { continue; } // a missing day is fine
    for (const cur of need) {
      const v = usd[cur.toLowerCase()];
      if (!(v > 0)) continue;
      const k = `${y}:${cur}`;
      sums[k] = (sums[k] || 0) + v;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  for (const k of Object.keys(sums)) {
    const [y, cur] = k.split(':');
    fill(y, cur, sums[k] / counts[k], 'daily');
  }

  // Gaps between two known years: average of the nearest year either side.
  for (const cur of Object.keys(EXTRA)) {
    const known = Object.keys(years).filter(y => years[y][cur]).map(Number);
    for (let y = known[0] + 1; y < known[known.length - 1]; y++) {
      if (years[y][cur]) continue;
      const before = Math.max(...known.filter(k => k < y)), after = Math.min(...known.filter(k => k > y));
      fill(y, cur, (years[before][cur] + years[after][cur]) / 2, 'between');
    }
  }

  for (const cur of Object.keys(EXTRA)) {
    const got = filled[cur] ? Object.entries(filled[cur]).map(([src, ys]) => `${src} ${ys[0]}-${ys[ys.length - 1]}`).join(', ') : 'ECB only';
    console.log(`${cur}: ${got}${years[thisYear][cur] ? '' : '  (still missing this year!)'}`);
  }

  const source = 'European Central Bank reference rates via frankfurter.dev; World Bank yearly averages and fawazahmed0/currency-api for currencies the ECB lacks';
  const data = { source, builtAt: now.toISOString().slice(0, 10), base: 'USD', years };
  const out = `// Generated by tools/build-rates.js on ${data.builtAt}. Do not edit by hand; run: npm run rates
// Yearly-average exchange rates, 1 USD = x. ${data.source}.
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.SteamRates = data;
})(typeof self !== 'undefined' ? self : this, ${JSON.stringify(data)});
`;
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'rates.js'), out);
  console.log(`Wrote src/rates.js (${(out.length / 1024).toFixed(1)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });

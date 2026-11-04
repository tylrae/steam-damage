// Logic tests on hand-written samples. Run: npm test
// These check the rules hang together; tests/check-fixture.js checks against the real export.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/parser.js');

const NOW = new Date(Date.UTC(2026, 9, 30));

test('amounts', () => {
  const a = s => P.parseAmount(s);
  assert.deepEqual(a('A$ 1,399.00'), { value: 1399, currency: 'AUD', sign: 0 });
  assert.deepEqual(a('+A$ 16.40'), { value: 16.40, currency: 'AUD', sign: 1 });
  assert.deepEqual(a('-A$ 7.80'), { value: 7.8, currency: 'AUD', sign: -1 });
  assert.deepEqual(a('-20%   A$ 14.95 A$ 11.96'), { value: 11.96, currency: 'AUD', sign: 0 });
  assert.equal(a('8,--€').value, 8);
  assert.equal(a('8,--€').currency, 'EUR');
  assert.equal(a('12,99€').value, 12.99);
  assert.equal(a('Mex$ 129.00').currency, 'MXN');
  assert.equal(a('$4.99').currency, 'USD');
  assert.deepEqual(a('1 399 pуб.'), { value: 1399, currency: 'RUB', sign: 0 });
  // Other Steam currencies, in the formats Steam shows them
  assert.deepEqual(a('RM12.90'), { value: 12.9, currency: 'MYR', sign: 0 });
  assert.deepEqual(a('-RM 1,234.50'), { value: 1234.5, currency: 'MYR', sign: -1 });
  assert.deepEqual(a('Rp 150 000'), { value: 150000, currency: 'IDR', sign: 0 });
  assert.deepEqual(a('150.000₫'), { value: 150000, currency: 'VND', sign: 0 });
  assert.deepEqual(a('₡12.500'), { value: 12500, currency: 'CRC', sign: 0 });
  assert.deepEqual(a('CLP$ 9.500'), { value: 9500, currency: 'CLP', sign: 0 });
  assert.equal(a('R 149.00').currency, 'ZAR');
  assert.equal(a('R$ 49,90').currency, 'BRL');
  assert.equal(a('149,00 kr').currency, 'NOK');
  assert.equal(a('49.99 AED').currency, 'AED');
  assert.equal(a('55,00 SR').currency, 'SAR');
  assert.equal(a('S/.39.90').currency, 'PEN');
  assert.equal(a('$U390').currency, 'UYU');
  assert.equal(a('#ERROR!'), null);
  assert.equal(a(''), null);
});

test('dates', () => {
  const d = s => { const r = P.parseDate(s, NOW); return r && r.toISOString().slice(0, 10); };
  assert.equal(d('30 Oct, 2026'), '2026-10-30');
  assert.equal(d('Oct 30, 2026'), '2026-10-30');
  assert.equal(d('2026-10-30'), '2026-10-30');
  assert.equal(d('30/10/2026'), '2026-10-30');
  assert.equal(d('46324'), '2026-10-29');
  assert.equal(d('30 Oct'), '2026-10-30');
  assert.equal(d('31 Dec'), '2025-12-31'); // no year + would be in the future -> last year
  assert.equal(d('Lattice x1000'), null);
});

test('game names', () => {
  const n = P.normaliseName;
  assert.equal(n('THRONE AND LIBERTY – Lucent Pack'), 'Throne and Liberty');
  assert.equal(n('Ivara Prime: Access Pack'), 'Warframe');
  assert.equal(n('Prime Status Upgrade'), 'Counter-Strike');
  assert.equal(n('Counter-Strike 2 Name Tag'), 'Counter-Strike');
  assert.equal(n('HELLDIVERS™ 2'), 'Helldivers 2');
  assert.equal(n('Borderlands&amp;reg; 3'), 'Borderlands 3');
  assert.equal(n('Stardew Valley Gift sent to Sam'), 'Stardew Valley');
  assert.equal(n('Warhammer 40,000: Dawn of War - Definitive Edition'), 'Warhammer 40,000: Dawn of War');
  assert.equal(n('Yu-Gi-Oh! Master Duel'), 'Yu-Gi-Oh! Master Duel');
  // shop labels and DLC fold into the base game; colons in real titles stay
  assert.equal(n('Warhammer 40,000: Space Marine 2 - 1-Year Anniversary Edition - Preorder'), 'Warhammer 40,000: Space Marine 2');
  assert.equal(n('Warhammer 40,000: Dawn of War - Definitive Edition - Veterans Upgrade (-30%)'), 'Warhammer 40,000: Dawn of War');
  assert.equal(n("V Rising - Dracula's Relics Pack"), 'V Rising');
  assert.equal(n('KurtzPel - Starter Pack'), 'KurtzPel');
  assert.equal(n("Pax Dei Founder's Pack: Journeyman"), 'Pax Dei');
  assert.equal(n('Hollow Knight: Silksong'), 'Hollow Knight: Silksong');
  assert.equal(n('Cyberpunk 2077: Phantom Liberty'), 'Cyberpunk 2077');
  assert.equal(n('Destiny 2: Lightfall + Annual Pass'), 'Destiny 2');
  assert.equal(n('Monster Hunter: World: Iceborne'), 'Monster Hunter: World');
  assert.equal(n('ELDEN RING Shadow of the Erdtree'), 'Elden Ring');
  assert.equal(n('ELDEN RING NIGHTREIGN'), 'ELDEN RING NIGHTREIGN'); // a separate game
  assert.equal(n('Getting Over It with Bennett Foddy'), 'Getting Over It with Bennett Foddy');
  assert.equal(n('Spider-Man - Miles Morales'), 'Spider-Man - Miles Morales');
  assert.equal(n('Borderlands 3: Super Deluxe Edition'), 'Borderlands 3');
  assert.equal(n('Sea of Thieves 2026 Edition'), 'Sea of Thieves');
  assert.equal(n('Space Hulk: Deathwing Enhanced Edition'), 'Space Hulk: Deathwing');
  assert.equal(n("Tiny Tina's Wonderlands: Chaotic Great Edition"), "Tiny Tina's Wonderlands");
  assert.equal(n('Surviving Mars: First Colony Edition'), 'Surviving Mars');
});

// Shape guessed from Steam's page; replace with a real capture once we have one.
const HTML = `<html><body><div class="nav">Store Community About</div>
<table class="wallet_history_table"><thead><tr><th>Date</th><th>Items</th><th>Type</th><th>Total</th><th>Wallet Change</th><th>Wallet Balance</th></tr></thead><tbody>
<tr class="wallet_table_row"><td class="wht_date">12 Oct, 2026</td><td class="wht_items"><div>Marvel Rivals</div><div>Lattice x1000</div></td><td class="wht_type"><div>In-Game Purchase</div><div class="wth_payment">Wallet</div></td><td class="wht_total">$9.99</td><td class="wht_wallet_change">-A$ 15.60</td><td class="wht_wallet_balance">A$ 4.40</td></tr>
<tr><td>10 Oct, 2026</td><td><div>Purchased A$ 20.00 Wallet Credit</div></td><td><div>Purchase</div><div>Visa</div></td><td>A$ 20.00</td><td>+A$ 20.00</td><td>A$ 20.00</td></tr>
<tr><td>1 Sep, 2026</td><td><div>DOOM: The Dark Ages&trade;</div></td><td><div>Purchase</div><div>PayPal</div></td><td><div class="wht_discount">-20%</div> A$ 74.95 A$ 59.96</td><td></td><td></td></tr>
<tr><td>5 Aug, 2026</td><td><div>Sea of Thieves</div></td><td><div>Refund</div><div>PayPal</div></td><td>A$ 59.95</td><td></td><td></td></tr>
<tr><td>1 Aug, 2026</td><td><div>Sea of Thieves</div></td><td><div>Purchase</div><div>PayPal</div></td><td>A$ 59.95</td><td></td><td></td></tr>
<tr><td>20 Jul, 2026</td><td><div>Steam Community Market</div></td><td><div>Market Transaction</div></td><td>A$ 3.45</td><td>+A$ 3.45</td><td>A$ 7.85</td></tr>
<tr><td>4 Feb, 2026</td><td><div>Stardew Valley Gift sent to Sam</div></td><td><div>Gift Purchase</div><div>Visa</div></td><td>A$ 17.50</td><td></td><td></td></tr>
<tr><td>3 Mar, 2017</td><td><div>Counter-Strike: Global Offensive</div><div>Operation Key</div></td><td><div>In-Game Purchase</div><div>Wallet</div></td><td>$2.49</td><td>-$2.49</td><td>$10.00</td></tr>
</tbody></table><footer>© Valve Corporation</footer></body></html>`;

test('HTML paste: classification and totals', () => {
  const parsed = P.parse({ html: HTML, text: 'ignored' }, { now: NOW });
  assert.equal(parsed.source, 'html');
  assert.equal(parsed.entries.length, 8);
  const kinds = parsed.entries.map(e => e.kind + (e.reason ? ':' + e.reason : ''));
  assert.deepEqual(kinds, ['purchase', 'skip:wallet top-up', 'purchase', 'refund', 'purchase', 'market-sale', 'purchase', 'purchase']);

  const first = parsed.entries[0];
  assert.equal(first.game, 'Marvel Rivals');
  assert.equal(first.item, 'Lattice x1000');
  assert.deepEqual(first.amount, { value: 15.6, currency: 'AUD', from: 'wallet change' }); // not the USD sticker
  assert.equal(parsed.entries[2].discountPct, 20);
  assert.equal(parsed.entries[6].gift, true);

  const s = P.summarise(parsed);
  assert.equal(s.homeCurrency, 'AUD');
  assert.deepEqual(s.totals.spend, { AUD: 153.01, USD: 2.49 });
  assert.deepEqual(s.totals.net, { AUD: 93.06, USD: 2.49 });
  assert.deepEqual(s.refundedToZero, ['Sea of Thieves']);
  assert.deepEqual(s.market.sold, { AUD: 3.45 });
  assert.equal(s.gifts.count, 1);
  assert.equal(s.games[0].name, 'DOOM: The Dark Ages');
  assert.equal(s.biggest.game, 'DOOM: The Dark Ages');
  assert.equal(s.sale.avgDiscount, 20);

  assert.deepEqual(P.summarise(parsed, { year: 2017 }).totals.spend, { USD: 2.49 });
  assert.equal(P.summarise(parsed, { includeGifts: false }).totals.spend.AUD, 135.51);
  const merged = P.summarise(parsed, { merge: { 'Stardew Valley': 'DOOM: The Dark Ages' } });
  assert.equal(merged.games.find(g => g.name === 'DOOM: The Dark Ages').purchases, 2);
});

test('browser plain text with page junk and broken-up cells', () => {
  const text = [
    'Store\tCommunity\tAbout',
    'Purchase History',
    'Date\tItems\tType\tTotal\tWallet Change\tWallet Balance',
    '12 Oct, 2026\tMarvel Rivals',
    'Lattice x1000\tIn-Game Purchase',
    'Wallet\t$9.99\t-A$ 15.60\tA$ 4.40',
    '1 Sep, 2026\tDOOM: The Dark Ages™\tPurchase',
    'PayPal\t-20%',
    'A$ 74.95 A$ 59.96\t\t',
    'Load More Transactions',
    '© Valve Corporation. All rights reserved.',
  ].join('\n');
  const parsed = P.parse(text, { now: NOW });
  assert.equal(parsed.source, 'tabs');
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].game, 'Marvel Rivals');
  assert.equal(parsed.entries[0].item, 'Lattice x1000');
  assert.equal(parsed.entries[0].amount.value, 15.6);
  assert.equal(parsed.entries[1].game, 'DOOM: The Dark Ages');
  assert.equal(parsed.entries[1].amount.value, 59.96);
  assert.ok(parsed.warnings.some(w => w.code === 'load-more'));
});

test('spreadsheet paste: extra columns, #ERROR!, serial dates, quoted cells', () => {
  const tsv = [
    'Date\tItems\tType\tTotal\tWallet Change\tWallet Balance\tPrice\tTax\tShipping',
    '46324\tMarvel Rivals   Lattice x1000\tIn-Game Purchase\t$9.99\t-A$ 15.60\tA$ 4.40\t\t\t',
    '46300\tSea of Thieves\tRefund\tA$ 59.95\t#ERROR!\tA$ 64.95\t\t\t',
    '46290\t"Apex Legends\nApex Coins x1000"\tIn-Game Purchase\tA$ 1,399.00\t\t\t\t\t',
  ].join('\n');
  const parsed = P.parse(tsv, { now: NOW });
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].item, 'Lattice x1000');
  assert.deepEqual(parsed.entries[1].amount, { value: 59.95, currency: 'AUD', from: 'total' });
  assert.ok(parsed.entries[1].flags.length);
  assert.equal(parsed.entries[2].game, 'Apex Legends');
  assert.equal(parsed.entries[2].amount.value, 1399);
});

test('orphan spreadsheet row lends its wallet change to the next row', () => {
  const tsv = [
    'Date\tItems\tType\tTotal\tWallet Change\tWallet Balance',
    '\t\t\t\t-A$ 7.80\tA$ 2.20',
    '46324\tMarvel Rivals   Lattice x500\tIn-Game Purchase\t$4.99\t\t',
  ].join('\n');
  const e = P.parse(tsv, { now: NOW }).entries;
  assert.equal(e.length, 1);
  assert.deepEqual(e[0].amount, { value: 7.8, currency: 'AUD', from: 'wallet change' });
});

test('no tabs at all: one cell per line', () => {
  const text = [
    '12 Oct, 2026', 'Marvel Rivals', 'Lattice x1000', 'In-Game Purchase', 'Wallet', '$9.99', '-A$ 15.60', 'A$ 4.40',
    '1 Aug, 2026', 'Sea of Thieves', 'Purchase', 'PayPal', 'A$ 59.95',
  ].join('\n');
  const parsed = P.parse(text, { now: NOW });
  assert.equal(parsed.source, 'lines');
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].item, 'Lattice x1000');
  assert.equal(parsed.entries[0].amount.value, 15.6);
  assert.equal(parsed.entries[1].game, 'Sea of Thieves');
  assert.equal(parsed.entries[1].amount.value, 59.95);
});

// Real Steam layout (Oct 2026), anonymised (dates, recipient and payment method changed): Price/Tax/Shipping columns, two-row "Wallet" header,
// split wallet+card payment, and a purchase whose wallet change Steam put on its own row above it.
const REAL_HTML = `<table class="wallet_history_table"><thead><tr>
<th rowspan="2" class="wht_date">Date</th><th rowspan="2" class="wht_items">Items</th><th rowspan="2" class="wht_type">Type</th><th rowspan="2" class="wht_baseprice">Price</th><th rowspan="2" class="wht_tax">Tax</th><th rowspan="2" class="wht_shipping">Shipping</th><th rowspan="2" class="wht_total">Total</th><th class="wht_wallet" colspan="2">Wallet</th></tr>
<tr><th class="wht_wallet_change">Change</th><th class="wht_wallet_balance">Balance</th></tr></thead><tbody>
<tr class="wallet_table_row"><td class="wht_date">14 Oct, 2026</td><td class="wht_items "> <div>Once Human</div> <div class="wth_payment"> Weapon Skin </div> </td><td class="wht_type "> <div>In-Game Purchase</div> <div class="wth_payment"> Wallet </div> </td><td class="wht_base_price"> $11.99 USD </td><td class="wht_tax"> $1.09 USD </td><td class="wht_shipping"> </td><td class="wht_total "> $11.99 USD </td><td class="wht_wallet_change wallet_column" data-tooltip-html="&lt;div&gt;Change: -A$ 16.40&lt;/div&gt;">-A$ 16.40</td><td class="wht_wallet_balance wallet_column"> A$ 0.00</td></tr>
<tr class="wallet_table_row"><td class="wht_date">3 Sep, 2026</td><td class="wht_items "> <div>Once Human Founder's Pack</div> <div class="wth_payment">Gift sent to Friend</div> </td><td class="wht_type "> <div>Gift Purchase</div> <div class="wth_payment">A$ 0.02 Wallet</div> <div class="wth_payment">A$ 149.93 Mastercard</div> </td><td class="wht_base_price"> A$ 149.95 </td><td class="wht_tax"> </td><td class="wht_shipping"> </td><td class="wht_total "> A$ 149.95 </td><td class="wht_wallet_change wallet_column">-A$ 0.02</td><td class="wht_wallet_balance wallet_column"> A$ 0.00</td></tr>
<tr class="wallet_table_row"><td class="wht_date">20 Mar, 2026</td><td class="wht_items "></td><td class="wht_type "></td><td></td><td></td><td></td><td></td><td class="wht_wallet_change wallet_column">-A$ 128.35</td><td class="wht_wallet_balance wallet_column"> A$ 0.00</td></tr>
<tr class="wallet_table_row"><td class="wht_date">20 Mar, 2026</td><td class="wht_items "> Purchased A$ 128.35 Wallet Credit </td><td class="wht_type "> <div>Purchase</div> <div class="wth_payment"> Mastercard </div> </td><td> A$ 128.35 </td><td></td><td></td><td> A$ 128.35 </td><td>+A$ 128.35</td><td> A$ 128.35</td></tr>
<tr class="wallet_table_row"><td class="wht_date">20 Mar, 2026</td><td class="wht_items "> <div>Naraka: Bladepoint</div> <div class="wth_payment"> 6000 Gold </div> </td><td class="wht_type "> <div>In-Game Purchase</div> <div class="wth_payment"> Wallet </div> </td><td> $99.99 USD </td><td> $9.09 USD </td><td></td><td> $99.99 USD </td><td></td><td></td></tr>
</tbody></table>`;

test('real Steam layout: two-row header, split payment, split-off wallet change', () => {
  const parsed = P.parse({ html: REAL_HTML }, { now: NOW });
  assert.equal(parsed.entries.length, 5);
  assert.deepEqual(parsed.entries[0].amount, { value: 16.40, currency: 'AUD', from: 'wallet change' });
  assert.equal(parsed.entries[1].game, 'Once Human');
  assert.equal(parsed.entries[1].gift, true);
  assert.deepEqual(parsed.entries[1].amount, { value: 149.95, currency: 'AUD', from: 'total' }); // not the A$0.02 wallet part
  assert.equal(parsed.entries[2].kind, 'skip');
  assert.deepEqual(parsed.entries[4].amount, { value: 128.35, currency: 'AUD', from: 'wallet change' });
  assert.deepEqual(P.summarise(parsed).totals.spend, { AUD: 294.70 });

  // Same rows as a browser's plain-text copy: cells broken across lines, a lone tab between Items and Type.
  const text = [
    'Date \tItems \tType \tPrice \tTax \tShipping \tTotal \tWallet', 'Change \tBalance',
    '14 Oct, 2026 \t', 'Once Human', 'Weapon Skin', '\t', 'In-Game Purchase', 'Wallet', '\t$11.99 USD \t$1.09 USD \t\t$11.99 USD \t-A$ 16.40 \tA$ 0.00',
    '20 Mar, 2026 \t\t\t\t\t\t\t-A$ 128.35 \tA$ 0.00',
    '20 Mar, 2026 \tPurchased A$ 128.35 Wallet Credit \t', 'Purchase', 'Mastercard', '\tA$ 128.35 \t\t\tA$ 128.35 \t+A$ 128.35 \tA$ 128.35',
    '20 Mar, 2026 \t', 'Naraka: Bladepoint', '6000 Gold', '\t', 'In-Game Purchase', 'Wallet', '\t$99.99 USD \t$9.09 USD \t\t$99.99 USD \t\t',
  ].join('\r\n');
  const t = P.parse(text, { now: NOW });
  assert.equal(t.source, 'tabs');
  assert.equal(t.entries[0].item, 'Weapon Skin');
  assert.equal(t.entries[0].amount.value, 16.40);
  assert.deepEqual(P.summarise(t).totals.spend, { AUD: 144.75 });
});

test('converting to one currency uses the rate for the year of each purchase', () => {
  const rates = { source: 'test', builtAt: '2026-10-30', base: 'USD', years: { 2017: { USD: 1, AUD: 1.3 }, 2026: { USD: 1, AUD: 1.5 } } };
  const parsed = P.parse({ html: HTML }, { now: NOW });

  const aud = P.summarise(parsed, { currency: 'AUD', rates });
  assert.deepEqual(aud.totals.net, { AUD: 96.30 }); // 93.06 + US$2.49 × 1.3 (2017 rate)
  assert.deepEqual(aud.conversion.converted, ['USD']);
  assert.equal(aud.homeCurrency, 'AUD');
  assert.equal(aud.walletCurrency, 'AUD');

  const usd = P.summarise(parsed, { currency: 'USD', rates });
  assert.equal(usd.games.find(g => g.name === 'DOOM: The Dark Ages').net.USD, 39.97); // A$59.96 / 1.5 (2026 rate)
  assert.equal(usd.biggest.game, 'DOOM: The Dark Ages');

  // A currency missing from the table stays separate and is reported, never dropped.
  const noAud = { ...rates, years: { 2017: { USD: 1 }, 2026: { USD: 1 } } };
  const partial = P.summarise(parsed, { currency: 'USD', rates: noAud });
  assert.deepEqual(partial.conversion.unconverted, ['AUD']);
  assert.equal(partial.totals.net.AUD, 93.06);
});

test('nothing recognisable gives a helpful warning', () => {
  const parsed = P.parse('hello there', { now: NOW });
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.warnings[0].code, 'no-rows');
});

test('cut-off history is noticed in either copy of the paste', () => {
  const hasWarning = input => P.parse(input).warnings.some(w => w.code === 'load-more');
  assert.ok(hasWarning({ html: '<a>Load More Transactions</a>', text: '' }));
  assert.ok(hasWarning({ html: '', text: 'Load More Transactions' }));
  assert.ok(!hasWarning({ html: '<div class="load_more_history_area"></div>', text: '' })); // finished export
});

test('refunded purchases stay out of the sale stats, including inside a bundle', () => {
  const d = t => new Date(`${t}T00:00:00Z`);
  const row = (kind, game, date, value, extra = {}) => ({
    kind, game, date: d(date), items: [game], item: null, inGame: false, gift: false, discountPct: null,
    amount: { value, currency: 'AUD' }, ...extra,
  });
  const s = P.summarise({ warnings: [], entries: [
    row('purchase', 'Kept Game', '2024-01-01', 10, { discountPct: 50 }),
    row('purchase', 'Returned Game', '2024-02-01', 5, { discountPct: 85 }),
    row('refund', 'Returned Game', '2024-02-02', 5),
    row('purchase', 'Bundle Lead', '2024-03-01', 20, { items: ['Bundle Lead', 'Bundle Extra'], discountPct: 75 }),
    row('refund', 'Bundle Extra', '2024-03-02', 5),
    row('purchase', 'Full Price Game', '2024-04-01', 30),
    row('purchase', 'Refunded Later', '2024-05-01', 40),
    row('refund', 'Refunded Later', '2024-05-02', 40),
  ] });
  assert.strictEqual(s.sale.onSale, 1);
  assert.strictEqual(s.sale.fullPrice, 1);
  assert.strictEqual(s.sale.avgDiscount, 50);
  assert.deepStrictEqual(s.sale.bestDeal, { game: 'Kept Game', pct: 50 });
  assert.strictEqual(s.sale.saved.AUD, 10);
  assert.strictEqual(s.totals.refunds.AUD, 50); // refunds themselves still count in the totals
});

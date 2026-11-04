// Which cards are built and what goes on them. Drawing itself is checked by eye.
const test = require('node:test');
const assert = require('node:assert');
const K = require('../src/cards.js');

const d = s => new Date(s + 'T00:00:00Z');
const game = (name, aud, purchases, inGame = 0) => ({ name, net: { AUD: aud }, inGame: inGame ? { AUD: aud } : {}, refunds: {}, refundCount: 0, purchases, inGamePurchases: inGame, first: d('2020-01-05'), last: d('2024-06-01') });
const summary = games => ({
  homeCurrency: 'AUD',
  dateRange: { first: d('2015-03-01'), last: d('2026-10-01') },
  totals: { spend: { AUD: 1100 }, inGame: { AUD: 600 }, refunds: { AUD: 100 }, net: { AUD: 1000 } },
  games,
  sale: { onSale: 0, fullPrice: 0, avgDiscount: null, spentOnSale: {}, spentFull: {}, saved: {}, bestDeal: null },
  gifts: { count: 0, spend: {}, inDecember: 0 },
  market: { sold: {}, bought: {}, net: {}, sales: 0, buys: 0 },
  byMonth: {},
  monthStats: {},
  biggest: { game: 'Big Game', item: 'Gold Pack', date: d('2025-11-25'), amount: { value: 310.09, currency: 'AUD' } },
});
const text = card => card.blocks.map(b => b.text || '').join(' | ');

test('full history gets every card, in order', () => {
  const cards = K.build(summary([game('Alpha', 600, 10, 8), game('Beta', 250, 3), game('Gamma', 150, 1)]));
  assert.deepStrictEqual(cards.map(c => c.id), ['total', 'comparisons', 'top-game', 'top-5', 'microtransactions', 'biggest', 'refunds', 'receipt']);
  assert.match(text(cards[0]), /A\$1,000\.00/);
  assert.match(text(cards[0]), /3 games since Mar 2015/);
  assert.deepStrictEqual(cards[0].blocks.find(b => b.type === 'lines').rows[2], ['Refunded', '−A$100.00']);
  assert.match(text(cards.find(c => c.id === 'top-game')), /Alpha.*A\$600\.00.*60%/);
  assert.strictEqual(cards.find(c => c.id === 'top-5').blocks[0].text, 'Top 3 games');
  assert.match(text(cards.find(c => c.id === 'biggest')), /A\$310\.09 \| Big Game \| Gold Pack/);
  assert.match(cards.find(c => c.id === 'biggest').alt, /Day: Tuesday\.$/);
});

test('short histories skip the cards that would look empty', () => {
  const cards = K.build(summary([game('Alpha', 600, 2), game('Refunded', 0, 1)]));
  assert.deepStrictEqual(cards.map(c => c.id), ['total', 'comparisons', 'top-game', 'microtransactions', 'biggest', 'receipt']);
});

test('money keeps the dollar clear and uses a real minus sign', () => {
  assert.strictEqual(K.money(56.78, 'USD'), 'US$56.78');
  assert.strictEqual(K.money(-5, 'AUD'), '−A$5.00');
  assert.strictEqual(K.moneyBag({ AUD: 10, USD: 0.001 }, 'AUD'), 'A$10.00');
});

test('microtransaction badge follows the share and the size of the spend', () => {
  const RATES = { years: { 2026: { USD: 1, AUD: 1.5 } } };
  const badge = (spend, micro, microCount = micro ? 5 : 0) => {
    const s = summary([game('Alpha', spend - micro, 3), { ...game('Beta', micro, microCount, microCount), inGame: { AUD: micro } }]);
    s.totals = { spend: { AUD: spend }, inGame: { AUD: micro }, refunds: {}, net: { AUD: spend } };
    const card = K.build(s, { rates: RATES }).find(c => c.id === 'microtransactions');
    return [card.badge, card.blocks[1].text];
  };
  assert.deepStrictEqual(badge(20000, 15000), ['The Leviathan', '75%']); // A$15k = US$10k
  assert.deepStrictEqual(badge(2000, 1800), ['The Whale', '90%']);      // US$1,200
  assert.deepStrictEqual(badge(600, 450), ['The Dolphin', '75%']);      // US$300
  assert.deepStrictEqual(badge(100, 80), ['The Minnow', '80%']);
  assert.deepStrictEqual(badge(1000, 300), ['The Dabbler', '70%']);     // flips: 70% actual games
  assert.deepStrictEqual(badge(1000, 50), ['The Collector', '95%']);
  assert.deepStrictEqual(badge(1000, 0), ['The Purist', '100%']);
  assert.deepStrictEqual(badge(100000, 80000), ['The Kraken', '80%']);    // US$53k
  assert.deepStrictEqual(badge(500000, 400000), ['The Megalodon', '80%']); // US$267k
});

test('the biggest lifetime totals get a title on the total card, and it outranks everything', () => {
  const RATES = { years: { 2026: { USD: 1, AUD: 1.5 } } };
  const run = (spend, micro = 0) => {
    const s = summary([game('Alpha', spend - micro, 3), { ...game('Beta', micro, 5, micro ? 5 : 0), inGame: { AUD: micro } }]);
    s.totals = { spend: { AUD: spend }, inGame: { AUD: micro }, refunds: {}, net: { AUD: spend } };
    const cards = K.build(s, { rates: RATES });
    return { total: cards[0].badge, title: cards[cards.length - 1].badge, stamp: cards[0].blocks.some(b => b.type === 'stamp') };
  };
  assert.strictEqual(run(300).total, 'Just Browsing');      // US$200
  assert.strictEqual(run(900).total, 'Casual Shopper');     // US$600
  assert.strictEqual(run(4500).total, 'Regular Customer');  // US$3k
  assert.strictEqual(run(30000).total, 'Frequent Flyer');   // US$20k
  assert.ok(run(300).stamp);
  assert.strictEqual(run(37500).total, 'Valued Customer');  // US$25k
  assert.strictEqual(run(150000).total, 'Shareholder');     // US$100k
  assert.strictEqual(run(1500000).total, 'Board Member');   // US$1M
  assert.ok(run(1500000).stamp);
  assert.strictEqual(run(1500000, 1200000).title, 'Board Member'); // beats The Megalodon
  assert.strictEqual(run(37500, 30000).title, 'The Leviathan');    // a rarer badge beats Valued Customer
});

test('a history refunded to nothing gets Zero Damage, with or without an exchange rate', () => {
  const s = summary([{ ...game('Alpha', 0, 1), refunds: { AUD: 60 }, refundCount: 1 }]);
  s.totals = { spend: { AUD: 60 }, inGame: {}, refunds: { AUD: 60 }, net: { AUD: 0 } };
  for (const rates of [{ years: { 2026: { USD: 1, AUD: 1.5 } } }, { years: { 2026: { USD: 1 } } }]) {
    const cards = K.build(s, { rates });
    assert.strictEqual(cards[0].badge, 'Zero Damage');
    assert.strictEqual(cards[cards.length - 1].badge, 'Zero Damage'); // beats The Purist as the title
  }
});

test('a Market-only history says so instead of "on 0 games"', () => {
  const s = summary([]);
  s.totals = { spend: {}, inGame: {}, refunds: {}, net: {} };
  s.market = { sold: { AUD: 40 }, bought: { AUD: 10 }, net: { AUD: 30 }, sales: 4, buys: 1 };
  assert.match(text(K.build(s)[0]), /No games bought, just Market trades\./);
});

test('final receipt collects every badge and picks the strongest as the title', () => {
  const s = summary([{ ...game('Alpha', 900, 9, 9), inGame: { AUD: 900 } }, game('Beta', 100, 1)]);
  s.totals = { spend: { AUD: 1000 }, inGame: { AUD: 900 }, refunds: {}, net: { AUD: 1000 } };
  s.market = { sold: { AUD: 2000 }, bought: { AUD: 100 }, net: { AUD: 1900 }, sales: 10, buys: 2 };
  const cards = K.build(s, { rates: { years: { 2026: { USD: 1, AUD: 1.5 } } } });
  const receipt = cards[cards.length - 1];
  assert.strictEqual(receipt.id, 'receipt');
  assert.strictEqual(receipt.badge, 'Skin Merchant');
  const rows = receipt.blocks.find(b => b.type === 'lines').rows;
  assert.ok(rows.some(r => r[0] === 'Market' && r[1] === 'Skin Merchant'));
  assert.ok(rows.some(r => r[0] === 'Microtransactions'));
});

test('gift recipients never reach a card', () => {
  const s = summary([{ ...game('Alpha', 100, 2), gifts: 2, recipients: ['SecretFriend'] }]);
  s.gifts = { count: 6, spend: { AUD: 100 }, inDecember: 4 };
  const cards = K.build(s);
  const gifts = cards.find(c => c.id === 'gifts');
  assert.strictEqual(gifts.badge, 'Santa Mode');
  assert.ok(!JSON.stringify(cards).includes('SecretFriend'));
});

test('comparisons scale with the total and only use what the money covers', () => {
  const RATES = { years: { 2026: { USD: 1, AUD: 1.5 } } };
  const comparisons = aud => {
    const s = summary([game('Alpha', aud, 3)]);
    s.totals = { spend: { AUD: aud }, inGame: {}, refunds: {}, net: { AUD: aud } };
    return K.build(s, { rates: RATES }).find(c => c.id === 'comparisons');
  };
  const counts = card => card.blocks.filter(b => b.type === 'big').map(b => Number(b.text.replace(/,/g, '')));

  assert.ok(counts(comparisons(60)).every(n => n >= 1));           // about US$40
  assert.ok(counts(comparisons(30000)).every(n => n >= 1));        // US$20k
  assert.strictEqual(counts(comparisons(30000)).length, 3);
  assert.match(text(comparisons(30000)), /Corolla|Rolex/);          // big totals reach the big items
  assert.doesNotMatch(text(comparisons(60)), /Corolla|Rolex|Porsche/); // no "0.003 Corollas"
  assert.strictEqual(comparisons(3), undefined);                    // too small to compare: no card
  assert.deepStrictEqual(comparisons(30000).blocks, comparisons(30000).blocks); // same history, same card
});

test('comparisons never mention everyday necessities', () => {
  for (const aud of [10, 100, 1000, 10000, 100000, 1000000]) {
    const s = summary([game('Alpha', aud, 3)]);
    s.totals = { spend: { AUD: aud }, inGame: {}, refunds: {}, net: { AUD: aud } };
    const card = K.build(s).find(c => c.id === 'comparisons');
    assert.doesNotMatch(JSON.stringify(card), /rent|grocer|bill|mortgage/i);
  }
});

test('top game badge: devotee, hopper, loyalist, new obsession, regular', () => {
  const top = (aud, first, last, others = 1000 - aud) => {
    const g = { ...game('Alpha', aud, 4), first: d(first), last: d(last) };
    const rest = Array.from({ length: 20 }, (_, i) => game('Other ' + i, others / 20, 1));
    return K.build(summary([g, ...rest])).find(c => c.id === 'top-game').badge;
  };
  assert.strictEqual(top(600, '2020-01-01', '2020-06-01', 400), 'The Devotee');  // 60%
  assert.strictEqual(top(90, '2020-01-01', '2025-06-01', 910), 'The Hopper');    // 9%, even after years
  assert.strictEqual(top(300, '2019-01-01', '2025-06-01'), 'The Loyalist');      // 30%, six years
  assert.strictEqual(top(300, '2026-03-01', '2026-09-01'), 'New Obsession');     // first bought this year
  assert.strictEqual(top(300, '2023-01-01', '2024-06-01'), 'The Regular');
});

test('a currency with no exchange rate gets no money-based badge or comparisons', () => {
  const s = summary([game('Alpha', 2000000, 2), game('Beta', 150000, 1)]);
  for (const g of s.games) { g.net = { VND: g.net.AUD }; }
  s.homeCurrency = 'VND';
  s.totals = { spend: { VND: 2150000 }, inGame: {}, refunds: {}, net: { VND: 2150000 } };
  const cards = K.build(s, { rates: { years: { 2026: { USD: 1, AUD: 1.5 } } } });
  assert.strictEqual(cards[0].badge, undefined);              // not "Board Member"
  assert.ok(!cards.some(c => c.id === 'comparisons'));        // not "15 Porsche 911s"
  assert.ok(cards.some(c => c.id === 'top-game'));            // everything else still works
});


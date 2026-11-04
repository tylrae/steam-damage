/*
 * The Wrapped cards.
 *
 * build(summary) decides which cards to show and what goes on them (plain data, testable in Node).
 * draw(canvas, card, {index, count}) paints one card onto a 1080×1920 canvas: phone-story size.
 *
 * The canvas that's drawn is the one shown on screen AND the one saved, so the saved image is
 * exactly what the visitor saw. No libraries, nothing leaves the browser.
 *
 * A card is a list of blocks, drawn top to bottom inside a paper receipt:
 *   kicker (small red heading) · big (huge amount) · title (game name) · text (a sentence)
 *   lines (label .... value rows, optional total) · items (numbered list) · gap
 *   bar (two-part split bar) · stamp (rubber-stamp badge, slapped over the block above it)
 * New cards are new block lists in build(); draw() rarely needs touching.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WalletCards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SITE = 'steamdamage.com'; // printed on every card, since cards travel without the site
  const BRAND = 'Steam Damage'; // also in index.html and on the thank-you slide in app.js
  const W = 1080, H = 1920;
  // Fixed colours: the image looks the same whatever theme the visitor's device uses.
  const C = { backdrop: '#1d1c1a', paper: '#fffdf7', ink: '#1d1c1a', muted: '#77736a', rule: '#cfcabd', accent: '#d6452f' };
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MONO = '"Cascadia Mono", "SF Mono", Consolas, Menlo, monospace';

  // ---------- formatting ----------

  // "A$1,234.56", "US$56.78": always show which dollar it is
  function money(v, cur) {
    try {
      const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(v);
      return (cur === 'USD' ? s.replace('$', 'US$') : s).replace('-', '−');
    } catch { return `${v.toFixed(2)} ${cur}`; }
  }
  const moneyBag = (bag, fallback) => Object.entries(bag).filter(([, v]) => Math.abs(v) >= 0.005)
    .map(([c, v]) => money(v, c)).join(' + ') || money(0, fallback || 'USD');
  const count = n => new Intl.NumberFormat('en-AU').format(n);
  const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;
  const monthYear = d => d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fullDate = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthLong = key => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekday = d => d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });

  // ---------- which cards, and what's on them ----------

  // Microtransaction badges. Thresholds are in US$ and converted to the visitor's currency, so a
  // whale is a whale whether they pay in yen or rand. Heavy spenders use the industry's own terms
  // (it really does call big in-game spenders whales, dolphins and minnows).
  const MICRO_BADGES = [
    { test: m => m.share >= 0.5 && m.usd >= 250000, badge: 'The Megalodon', line: 'Extinct everywhere except the in-game shop. 🦈' },
    { test: m => m.share >= 0.5 && m.usd >= 50000, badge: 'The Kraken', line: 'Game studios hold meetings about you. 🦑' },
    { test: m => m.share >= 0.5 && m.usd >= 7500, badge: 'The Leviathan', line: 'Bigger than a whale. Somewhere, a game studio knows your name. 🐋' },
    { test: m => m.share >= 0.5 && m.usd >= 1000, badge: 'The Whale', line: "The industry's own word for its biggest in-game spenders. Now it's official. 🐳" },
    { test: m => m.share >= 0.5 && m.usd >= 250, badge: 'The Dolphin', line: 'A regular at the in-game shop, but nowhere near whale waters. 🐬' },
    { test: m => m.share >= 0.5, badge: 'The Minnow', line: 'Mostly in-game, but small change. Barely a ripple 😭' },
    { test: m => m.count === 0, badge: 'The Purist', line: 'Not one microtransaction. Not even a skin. 😇' },
    { test: m => m.share < 0.15, badge: 'The Collector', line: 'You buy games, not gems. 🎮' },
    { test: () => true, badge: 'The Dabbler', line: 'The odd skin, the occasional battle pass. Mostly real games. 👍' },
  ];

  // Titles for the biggest lifetime totals, whatever the money went on (US$, converted like the rest).
  // Shown as a stamp on the total card. Every total gets one, down to Zero Damage for a history refunded to nothing.
  const ZERO_DAMAGE = { badge: 'Zero Damage', line: 'We checked. Steam got nothing out of you. 🛡️' };
  const LIFETIME_BADGES = [
    { usd: 1000000, badge: 'Board Member', line: "You don't buy games any more. You fund them. 🏛️" },
    { usd: 100000, badge: 'Shareholder', line: 'At this point Steam should be paying you dividends. 📈' },
    { usd: 25000, badge: 'Valued Customer', line: "Somewhere there's a loyalty card with your name on it. 💳" },
    { usd: 10000, badge: 'Frequent Flyer', line: "You've earned enough points for a free upgrade. Steam doesn't do those. ✈️" },
    { usd: 2500, badge: 'Regular Customer', line: 'The staff would wave if Steam had staff. 👋' },
    { usd: 500, badge: 'Casual Shopper', line: 'In, grab something, out. 🧺' },
    { usd: 0.01, badge: 'Just Browsing', line: "Steam's been trying to upsell you for years. It isn't working. 🚶" },
  ];

  // "That's the same as..." Rough US$ prices, cheapest first, converted at the bundled rates. Fun purchases
  // only: never rent, groceries or bills, so the joke stays on the spending and not on anyone's finances.
  const COMPARISONS = [ // prices checked 31 Oct 2026
    { usd: 5, one: 'takeaway coffee', many: 'takeaway coffees' },
    { usd: 6, one: 'Big Mac', many: 'Big Macs' },
    { usd: 13, one: 'cinema ticket', many: 'cinema tickets' },
    { usd: 18, one: 'large pizza', many: 'large pizzas' },
    { usd: 70, one: 'full-price new game', many: 'full-price new games' },
    { usd: 500, one: 'Nintendo Switch 2', many: 'Nintendo Switch 2s' },
    { usd: 600, one: 'Secretlab gaming chair', many: 'Secretlab gaming chairs' },
    { usd: 789, one: 'Steam Deck', many: 'Steam Decks' },
    { usd: 800, one: 'long-haul return flight', many: 'long-haul return flights' },
    { usd: 2000, one: 'decent gaming PC', many: 'decent gaming PCs' },
    { usd: 11350, one: 'Rolex Submariner', many: 'Rolex Submariners' },
    { usd: 12500, one: 'used 2015 Toyota Corolla', many: 'used 2015 Toyota Corollas' },
    { usd: 23000, one: 'brand new Corolla', many: 'brand new Corollas' },
    { usd: 37000, one: 'Tesla Model 3', many: 'Tesla Model 3s' },
    { usd: 135500, one: 'Porsche 911', many: 'Porsche 911s' },
    { usd: 608000, one: 'Lamborghini Revuelto', many: 'Lamborghini Revueltos' }, // starting price; sources range to ~$673k (3 Nov 2026)
    { usd: 6950000, one: 'HondaJet private jet', many: 'HondaJet private jets' }, // Elite II list price (3 Nov 2026)
  ];

  // One small, one medium and one big thing the money would actually cover. The seed varies the picks
  // between people but gives the same history the same card.
  function pickComparisons(usd, seed) {
    const usable = COMPARISONS.filter(c => usd >= c.usd);
    const tier = (lo, hi) => usable.filter(c => c.usd >= lo && c.usd < hi);
    const pick = list => (list.length ? list[seed % list.length] : null);
    const picks = [pick(tier(0, 30)), pick(tier(30, 1000)), pick(tier(1000, Infinity).slice(-2))].filter(Boolean);
    for (const c of usable) if (picks.length < 3 && !picks.includes(c)) picks.push(c);
    return picks.map(c => {
      const n = Math.floor(usd / c.usd);
      return { count: n, name: n === 1 ? c.one : c.many };
    });
  }

  // Which badge becomes the visitor's title on the final receipt: rarest and funniest first.
  const BADGE_RANK = ['Board Member', 'Shareholder', 'The Megalodon', 'The Kraken', 'The Leviathan', 'Valued Customer', 'The Whale', 'Frequent Flyer', 'Skin Merchant', 'Santa Mode', 'Zero Damage', 'The Returns Desk', 'Sale Vulture', 'The Purist', 'The Devotee', 'The Patron', 'Commitment Issues', 'Day One Devotee', 'The Loyalist', 'The Hopper', 'The Collector', 'Big Sale Season', 'Skin Collector', 'The Dolphin', 'Bargain Hunter', 'Side Hustler', 'No Regrets', 'Steady Drip', 'Regular Customer', 'Payday Rush', 'New Obsession', 'Impulse Buyer', 'The Dabbler', 'The Minnow', 'Second Thoughts', 'Good Friend', 'Casual Shopper', 'Window Shopper', 'The Regular', 'Just Browsing'];

  function build(s, { rates } = {}) {
    const cur = s.homeCurrency;
    const bag = b => moneyBag(b, cur);
    const home = b => b[cur] || 0;
    const minus = (a, b) => { const o = { ...a }; for (const c in b) o[c] = (o[c] || 0) - b[c]; return o; };
    const negate = b => minus({}, b);
    const has = b => Object.values(b).some(v => Math.abs(v) >= 0.005);
    const netTotal = home(s.totals.net);
    const share = v => (netTotal > 0 ? Math.round(v / netTotal * 100) : null);
    const games = s.games.filter(g => home(g.net) > 0.005);
    const bought = s.games.filter(g => g.purchases > 0).length;
    const cards = [];
    const earned = []; // { area, badge }, collected for the final receipt

    // Lifetime total, itemised like a till receipt.
    const rows = [['Games & DLC', bag(minus(s.totals.spend, s.totals.inGame))]];
    if (has(s.totals.inGame)) rows.push(['Microtransactions', bag(s.totals.inGame)]);
    if (has(s.totals.refunds)) rows.push(['Refunded', bag(negate(s.totals.refunds))]);
    // Nothing is nothing in any currency, so Zero Damage needs no exchange rate.
    const lifetime = netTotal < 0.005 ? ZERO_DAMAGE : LIFETIME_BADGES.find(t => toUsd(netTotal, cur, rates) >= t.usd);
    if (lifetime) earned.push({ area: 'Lifetime', badge: lifetime.badge });
    cards.push({ id: 'total', badge: lifetime && lifetime.badge, blocks: [
      { type: 'kicker', text: 'The damage' },
      { type: 'big', text: bag(s.totals.net) },
      { type: 'text', text: !bought && s.market.sales + s.market.buys > 0 ? 'No games bought, just Market trades.' : `on ${plural(bought, 'game')} since ${monthYear(s.dateRange.first)}.` },
      lifetime && { type: 'stamp', text: lifetime.badge, own: true },
      lifetime && { type: 'text', text: lifetime.line },
      { type: 'gap' },
      { type: 'lines', rows, total: ['Total', bag(s.totals.net)] },
    ].filter(Boolean) });

    // What that total could have bought instead.
    const same = pickComparisons(toUsd(netTotal, cur, rates), s.games.reduce((t, g) => t + g.purchases, 0));
    if (same.length) {
      cards.push({ id: 'comparisons', blocks: [
        { type: 'kicker', text: "That's the same as" },
        // Each number sits tight against its own label, with a clear gap before the next pair.
        ...same.flatMap((c, i) => [
          i > 0 && { type: 'gap', h: 56 },
          { type: 'big', text: count(c.count), max: 130, tight: true },
          { type: 'text', text: c.name },
        ]).filter(Boolean),
        { type: 'gap' },
        { type: 'text', text: 'Rough prices. Real bragging rights. 😎' },
      ] });
    }

    // The #1 game.
    if (games.length) {
      const g = games[0], pct = share(home(g.net));
      const YEAR = 365.25 * 864e5;
      const years = (g.last - g.first) / YEAR;
      // "New" only means something when the history itself goes back a couple of years.
      const isNew = s.dateRange.last - g.first < YEAR && s.dateRange.last - s.dateRange.first >= 2 * YEAR;
      const { badge, line } = pct >= 50 ? { badge: 'The Devotee', line: 'One game. Over half your money. 🙏' }
        : pct != null && pct < 10 ? { badge: 'The Hopper', line: 'Commitment? Never heard of her. 🦘' }
          : years >= 3 ? { badge: 'The Loyalist', line: 'Years later, still paying. 💪' }
            : isNew ? { badge: 'New Obsession', line: "You've known each other for months and it's already serious. 💘" }
              : { badge: 'The Regular', line: 'Your favourite, but you do see other games. 👀' };
      earned.push({ area: '#1 game', badge });
      const rows = [['Purchases', count(g.purchases)]];
      if (g.inGamePurchases) rows.push(['…of them microtransactions', count(g.inGamePurchases)]);
      rows.push(['First buy', monthYear(g.first)], ['Latest', monthYear(g.last)]);
      cards.push({ id: 'top-game', badge, blocks: [
        { type: 'kicker', text: 'Your #1 game' },
        { type: 'title', text: g.name },
        { type: 'big', text: bag(g.net) },
        pct != null && { type: 'text', text: pct >= 99 ? 'That\'s basically all of it.' : `That's ${pct}% of everything you've spent.` },
        { type: 'stamp', text: badge, own: true },
        { type: 'text', text: line },
        { type: 'lines', rows },
      ] });
    }

    // Top 5 (only worth a card with at least 3 games).
    if (games.length >= 3) {
      const top = games.slice(0, 5);
      const sum = top.reduce((t, g) => t + home(g.net), 0);
      const pct = share(sum);
      cards.push({ id: 'top-5', blocks: [
        { type: 'kicker', text: `Top ${top.length} games` },
        { type: 'items', rows: top.map(g => ({
          name: g.name,
          value: bag(g.net),
          sub: g.inGamePurchases === g.purchases ? plural(g.purchases, 'microtransaction')
            : plural(g.purchases, 'purchase') + (g.inGamePurchases ? ` · ${plural(g.inGamePurchases, 'microtransaction')}` : ''),
        })) },
        { type: 'lines', rows: [], total: [`Top ${top.length} total`, money(sum, cur)] },
        pct != null && { type: 'text', text: `${pct}% of your spend went on these ${top.length}.` },
      ] });
    }

    // Microtransactions vs actual games, with a badge. Flips to celebrate people who mostly buy games.
    const spend = home(s.totals.spend);
    if (spend > 0) {
      const micro = home(s.totals.inGame), store = spend - micro;
      const microCount = s.games.reduce((t, g) => t + g.inGamePurchases, 0);
      const storeCount = s.games.reduce((t, g) => t + g.purchases, 0) - microCount;
      const share = micro / spend;
      const m = { share, count: microCount, usd: toUsd(micro, cur, rates) };
      const { badge, line } = MICRO_BADGES.find(b => b.test(m));
      earned.push({ area: 'Microtransactions', badge });
      const heavy = share >= 0.5;
      const pct = Math.round((heavy ? share : 1 - share) * 100);
      const where = s.games.filter(g => home(g.inGame) > 0.005).sort((a, b) => home(b.inGame) - home(a.inGame)).slice(0, 3);
      cards.push({ id: 'microtransactions', badge, blocks: [
        { type: 'kicker', text: 'Microtransactions vs actual games' },
        { type: 'big', text: `${pct}%` },
        { type: 'stamp', text: badge },
        { type: 'text', text: heavy ? 'of your spend was microtransactions.' : 'of your spend was actual games.' },
        { type: 'bar', parts: [
          { label: plural(microCount, 'microtransaction'), value: money(micro, cur), share, color: 'accent' },
          { label: plural(storeCount, 'store purchase'), value: money(store, cur), share: 1 - share, color: 'ink' },
        ] },
        { type: 'text', text: line },
        where.length && { type: 'kicker', text: heavy ? 'Where it went' : 'The few that slipped through', muted: true },
        where.length && { type: 'items', rows: where.map(g => ({ name: g.name, value: bag(g.inGame), sub: plural(g.inGamePurchases, 'microtransaction') })) },
      ] });
    }

    // Biggest single purchase.
    if (s.biggest) {
      const b = s.biggest;
      cards.push({ id: 'biggest', blocks: [
        { type: 'kicker', text: 'Biggest single purchase' },
        { type: 'big', text: money(b.amount.value, b.amount.currency) },
        { type: 'title', text: b.game, size: 'small' },
        b.item && b.item !== b.game && { type: 'text', text: b.item },
        { type: 'gap' },
        { type: 'lines', rows: [['Date', fullDate(b.date)], ['Day', weekday(b.date)]] },
      ] });
    }

    // Most expensive month.
    const months = Object.entries(s.byMonth).map(([key, v]) => ({ key, v: home(v) })).filter(m => m.v > 0).sort((a, b) => b.v - a.v);
    if (months.length >= 2) {
      const peak = months[0];
      const stats = key => (s.monthStats && s.monthStats[key]) || { count: 0, games: {} };
      const mainGame = key => Object.entries(stats(key).games).sort((a, b) => b[1] - a[1])[0];
      const about = key => {
        const top = mainGame(key);
        return plural(stats(key).count, 'purchase') + (top && stats(key).count > 1 ? `, mostly ${top[0]}` : top ? `: ${top[0]}` : '');
      };
      const monthIndex = +peak.key.slice(5, 7) - 1;
      const { badge, line } = spend > 0 && peak.v / spend < 0.08 && months.length >= 12
        ? { badge: 'Steady Drip', line: 'No big spikes. Just a slow, steady leak. 💧' }
        : [5, 6, 10, 11].includes(monthIndex)
          ? { badge: 'Big Sale Season', line: 'Steam had a sale. You had no chance. 😅' }
          : { badge: 'Payday Rush', line: "Something happened that month. We won't ask. 👀" };
      earned.push({ area: 'Spending', badge });
      const years = {};
      for (const m of months) years[m.key.slice(0, 4)] = (years[m.key.slice(0, 4)] || 0) + m.v;
      const bestYear = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
      cards.push({ id: 'month', badge, blocks: [
        { type: 'kicker', text: 'Most expensive month' },
        { type: 'big', text: money(peak.v, cur) },
        { type: 'title', text: monthLong(peak.key), size: 'small' },
        { type: 'stamp', text: badge, own: true },
        { type: 'text', text: `${about(peak.key)}. ${line}` },
        months.length > 2 && { type: 'kicker', text: 'Runners-up', muted: true },
        months.length > 2 && { type: 'items', rows: months.slice(1, 3).map(m => ({ name: monthLong(m.key), value: money(m.v, cur), sub: plural(stats(m.key).count, 'purchase') })) },
        { type: 'lines', rows: [['Busiest year', `${bestYear[0]} · ${money(bestYear[1], cur)}`]] },
      ] });
    }

    // Sale vs full price (store purchases only: microtransactions rarely go on sale).
    const storeBuys = s.sale.onSale + s.sale.fullPrice;
    if (storeBuys >= 5) {
      const pct = Math.round(s.sale.onSale / storeBuys * 100);
      const { badge, line } = pct >= 75 ? { badge: 'Sale Vulture', line: 'You wait. The sale always comes. 🦅' }
        : pct >= 40 ? { badge: 'Bargain Hunter', line: 'Half patience, half "I want it now". 😂' }
          : pct >= 10 ? { badge: 'Impulse Buyer', line: 'Why wait for a sale when you could have it now? 🛒' }
            : { badge: 'Day One Devotee', line: 'Full price, no regrets. Publishers love you. 🥰' };
      earned.push({ area: 'Sales', badge });
      const best = s.sale.bestDeal;
      cards.push({ id: 'sale', badge, blocks: [
        { type: 'kicker', text: 'Sale vs full price' },
        { type: 'big', text: `${pct}%` },
        { type: 'stamp', text: badge },
        { type: 'text', text: 'of your store purchases were on sale.' },
        { type: 'bar', parts: [
          { label: `${count(s.sale.onSale)} on sale`, value: bag(s.sale.spentOnSale), share: s.sale.onSale / storeBuys, color: 'accent' },
          { label: `${count(s.sale.fullPrice)} full price`, value: bag(s.sale.spentFull), share: s.sale.fullPrice / storeBuys, color: 'ink' },
        ] },
        { type: 'text', text: line },
        s.sale.onSale > 0 && { type: 'lines', rows: [
          ['Average discount', `${Math.round(s.sale.avgDiscount)}%`],
          ['Saved, roughly', money(Math.round(home(s.sale.saved)), cur).replace(/\.\d+$/, '')],
        ] },
        best && { type: 'text', text: `Best deal: ${best.game} at ${best.pct}% off.` },
      ] });
    }

    // Refunds. Nobody with only a handful of purchases earns "No Regrets".
    const refunded = s.games.filter(g => g.refundCount > 0).sort((a, b) => home(b.refunds) - home(a.refunds));
    if (refunded.length || s.games.reduce((t, g) => t + g.purchases, 0) >= 5) {
      const n = refunded.length;
      const { badge, line } = n >= 8 ? { badge: 'The Returns Desk', line: 'They know you by name at the returns desk. 👋' }
        : n >= 3 ? { badge: 'Commitment Issues', line: 'Two hours is all you give them. 💔' }
          : n >= 1 ? { badge: 'Second Thoughts', line: "Everyone's allowed a change of heart. 🤷" }
            : { badge: 'No Regrets', line: 'Not one refund. You keep what you buy. 😎' };
      earned.push({ area: 'Refunds', badge });
      cards.push({ id: 'refunds', badge, blocks: [
        { type: 'kicker', text: 'The ones that got away' },
        { type: 'big', text: count(n) },
        { type: 'stamp', text: badge },
        { type: 'text', text: `${n === 1 ? 'game' : 'games'} refunded. ${line}` },
        n > 0 && { type: 'lines', rows: [['Money back', bag(s.totals.refunds)]] },
        n > 0 && { type: 'kicker', text: 'Back on the shelf', muted: true },
        n > 0 && { type: 'items', rows: refunded.slice(0, 4).map(g => ({ name: g.name, value: has(g.refunds) ? bag(g.refunds) : '—', sub: monthYear(g.last) })) },
      ] });
    }

    // Gifts. Steam lists who each gift went to: those names must never reach a shareable image.
    if (s.gifts.count > 0) {
      const { badge, line } = s.gifts.count >= 3 && s.gifts.inDecember / s.gifts.count >= 0.5 ? { badge: 'Santa Mode', line: 'Ho ho ho. Your wallet says ow. 🎅' }
        : s.gifts.count >= 5 ? { badge: 'The Patron', line: 'Your friends owe you. Luckily, this is only a receipt. 🧾' }
          : { badge: 'Good Friend', line: 'Someone out there owes you one. 🤝' };
      earned.push({ area: 'Gifts', badge });
      const rows = [['Gifts sent', count(s.gifts.count)]];
      if (spend > 0) rows.push(['Share of your spend', `${Math.round(home(s.gifts.spend) / spend * 100)}%`]);
      if (s.gifts.inDecember) rows.push(['Sent in December', count(s.gifts.inDecember)]);
      cards.push({ id: 'gifts', badge, blocks: [
        { type: 'kicker', text: 'Spent on other people' },
        { type: 'big', text: bag(s.gifts.spend) },
        { type: 'stamp', text: badge, own: true },
        { type: 'text', text: line },
        { type: 'gap' },
        { type: 'lines', rows },
      ] });
    }

    // Community Market. Kept out of game spend: Steam doesn't say which game each trade was for.
    if (s.market.sales + s.market.buys > 0) {
      const net = home(s.market.net), netUsd = toUsd(net, cur, rates);
      const { badge, line } = netUsd >= 500 ? { badge: 'Skin Merchant', line: 'The market pays you now. Respect. 🤑' }
        : net > 0 ? { badge: 'Side Hustler', line: 'Small profits, but profits. 📈' }
          : netUsd <= -200 ? { badge: 'Skin Collector', line: 'You buy the drip, and you keep it. 💅' }
            : { badge: 'Window Shopper', line: 'A few trades. No big moves. 🛍️' };
      earned.push({ area: 'Market', badge });
      const netText = `${net > 0 ? '+' : ''}${bag(s.market.net)}`;
      cards.push({ id: 'market', badge, blocks: [
        { type: 'kicker', text: 'Community Market' },
        { type: 'big', text: netText },
        { type: 'stamp', text: badge, own: true },
        { type: 'text', text: line },
        { type: 'gap' },
        { type: 'lines', rows: [[`Sold (${count(s.market.sales)})`, bag(s.market.sold)], [`Bought (${count(s.market.buys)})`, bag(s.market.bought)]], total: ['Net', netText] },
        { type: 'text', text: 'Not included in your game total.' },
      ] });
    }

    // The final receipt: every badge earned, with the strongest as the visitor's title.
    if (earned.length) {
      const main = BADGE_RANK.find(b => earned.some(e => e.badge === b)) || earned[0].badge;
      // The card people post, so its footer carries the share line instead of the usual sign-off.
      cards.push({ id: 'receipt', badge: main, footer: 'CHECK YOUR STEAM DAMAGE', blocks: [
        { type: 'kicker', text: 'Your receipt' },
        { type: 'stamp', text: main, own: true, center: true, size: 64 },
        { type: 'gap', h: 30 },
        { type: 'text', text: 'Your title, based on all of the below. 👑' },
        { type: 'gap' },
        { type: 'lines', rows: earned.map(e => [e.area, e.badge]), total: ['Total', bag(s.totals.net)] },
      ] });
    }

    for (const c of cards) {
      c.blocks = c.blocks.filter(Boolean);
      c.alt = altText(c);
    }
    return cards;
  }

  // Amount in the visitor's currency -> US$, at the latest year's rate (for badge thresholds only).
  // NaN when there's no rate for that currency (e.g. VND, CLP), so money-based badges and the
  // comparisons are skipped instead of treating ₫2,000,000 as two million dollars.
  function toUsd(value, cur, rates) {
    if (cur === 'USD' || !rates) return value;
    const latest = rates.years[Object.keys(rates.years).sort().pop()];
    return latest[cur] ? value / latest[cur] : NaN;
  }

  // What a screen reader announces for the card image.
  function altText(card) {
    return card.blocks.map(b => {
      if (b.type === 'lines') return [...b.rows, ...(b.total ? [b.total] : [])].map(r => `${r[0]}: ${r[1]}`).join('. ');
      if (b.type === 'items') return b.rows.map((r, i) => `${i + 1}. ${r.name}, ${r.value}`).join('. ');
      if (b.type === 'stamp') return `Badge: ${b.text}`;
      if (b.type === 'bar') return b.parts.map(p => `${p.label}: ${p.value}`).join('. ');
      return b.text || '';
    }).map(t => t.replace(/[.\s]+$/, '')).filter(Boolean).join('. ') + '.';
  }

  // ---------- drawing ----------

  // Receipt geometry. Instagram/TikTok cover roughly the top and bottom 250px with their own UI,
  // so everything that matters sits between y≈380 and y≈1450.
  const PAPER = { x0: 100, x1: 980, y0: 170, y1: 1750, tooth: 20 };
  const L = 170, R = 910, CW = R - L;
  const BODY = { top: 400, bottom: 1440 };

  const font = (weight, size, family) => `${weight} ${size}px ${family}`;
  function spacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

  function ellipsis(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = [...t].slice(0, -1).join('');
    return t.trimEnd() + '…';
  }

  // Greedy word wrap; anything past maxLines is cut with an ellipsis.
  function wrap(ctx, text, maxW, maxLines) {
    // An emoji stays with the word before it, so it can't end up alone on a line.
    const words = String(text).split(/\s+/).filter(Boolean).reduce((out, w) => {
      if (out.length && !/[\p{L}\p{N}]/u.test(w)) out[out.length - 1] += ` ${w}`;
      else out.push(w);
      return out;
    }, []);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = ellipsis(ctx, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxW);
      return { lines: kept.map(l => ellipsis(ctx, l, maxW)), cut: true };
    }
    return { lines: lines.map(l => ellipsis(ctx, l, maxW)), cut: false };
  }

  function rule(ctx, y, x0 = L, x1 = R) {
    ctx.save();
    ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.restore();
  }

  // label ........ value
  function leaderRow(ctx, y, label, value, size, bold) {
    ctx.font = font(bold ? 700 : 600, size, MONO);
    const vw = ctx.measureText(value).width;
    ctx.font = font(bold ? 700 : 400, size, MONO);
    const lab = ellipsis(ctx, label, CW - vw - 40);
    const lw = ctx.measureText(lab).width;
    ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(lab, L, y);
    ctx.font = font(bold ? 700 : 600, size, MONO);
    ctx.textAlign = 'right'; ctx.fillText(value, R, y);
    ctx.save();
    ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(L + lw + 14, y - 6); ctx.lineTo(R - vw - 14, y - 6); ctx.stroke();
    ctx.restore();
  }

  let bigRight = R; // right edge of the last big number drawn, so a stamp can sit beside it

  // On-screen entrance effects, each 0..1 (missing = finished): print (the receipt feeds out of a
  // slot), big (the big number counts up), stamp (stamps slam down). Saved images never use them.
  let FX = {};
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const SLOT = 1758; // the printer slot, just below the paper's bottom edge (PAPER.y1 = 1750)
  const feed = t => 1 - (1 - t) * (1 - t); // steady feed that slows as the paper finishes

  // "A$19,425.93" at t=0.5 → "A$9,712.97": every number in the text scaled, same decimals and commas.
  function countTo(text, t) {
    return text.replace(/\d[\d,]*(?:\.\d+)?/g, m => {
      const decimals = (m.split('.')[1] || '').length;
      return (parseFloat(m.replace(/,/g, '')) * t).toLocaleString('en-US', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m.includes(','),
      });
    });
  }

  // Stamp landing: starts big and faint, drops past full size, settles. Returns [scale, opacity].
  function stampLanding(p) {
    if (p < 0.55) { const e = easeOut(p / 0.55); return [2.1 - 1.18 * e, Math.min(1, p / 0.3)]; }
    return [0.92 + 0.08 * easeOut((p - 0.55) / 0.45), 1];
  }

  // Each block draws itself at y (top edge) and returns its height. With dry=true it only measures,
  // so the body can be centred before anything is painted.
  const BLOCKS = {
    kicker(ctx, b, y, dry) {
      if (!dry) {
        ctx.font = font(700, 30, MONO); spacing(ctx, 4);
        ctx.fillStyle = b.muted ? C.muted : C.accent; ctx.textAlign = 'left';
        ctx.fillText(b.text.toUpperCase(), L, y + 30);
        spacing(ctx, 0);
      }
      return 30 + 36;
    },
    big(ctx, b, y, dry) {
      let size = b.max || 170;
      ctx.font = font(800, size, SANS);
      while (size > 64 && ctx.measureText(b.text).width > CW) { size -= 4; ctx.font = font(800, size, SANS); }
      bigRight = L - size * 0.04 + Math.min(CW, ctx.measureText(b.text).width);
      // Sized for the final number, so the text doesn't jump in size while it counts up.
      const shown = FX.big != null && FX.big < 1 ? countTo(b.text, easeOut(FX.big)) : b.text;
      if (!dry) { ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(ellipsis(ctx, shown, CW), L - size * 0.04, y + size * 0.78); }
      return size * 0.82 + (b.tight ? 12 : 34);
    },
    title(ctx, b, y, dry) {
      const sizes = b.size === 'small' ? [64, 56, 48] : [96, 84, 72, 62, 54];
      let size, w;
      for (size of sizes) {
        ctx.font = font(800, size, SANS);
        w = wrap(ctx, b.text, CW, 3);
        if (!w.cut && w.lines.length <= (size > 70 ? 2 : 3)) break;
      }
      const lh = size * 1.08;
      if (!dry) {
        ctx.fillStyle = C.ink; ctx.textAlign = 'left';
        w.lines.forEach((l, i) => ctx.fillText(l, L, y + size * 0.8 + i * lh));
      }
      return w.lines.length * lh + 22;
    },
    text(ctx, b, y, dry) {
      ctx.font = font(400, 40, SANS);
      const { lines } = wrap(ctx, b.text, CW, 4);
      if (!dry) {
        ctx.fillStyle = C.muted; ctx.textAlign = 'left';
        lines.forEach((l, i) => ctx.fillText(l, L, y + 36 + i * 54));
      }
      return lines.length * 54 + 14;
    },
    gap(ctx, b) { return b.h || 36; },
    // Two-part bar, with each part's label and amount underneath at its own end.
    bar(ctx, b, y, dry) {
      if (!dry) {
        const [a, z] = b.parts, H = 40;
        const split = L + CW * Math.min(1, Math.max(0, a.share));
        ctx.fillStyle = C[a.color]; ctx.fillRect(L, y + 8, split - L, H);
        ctx.fillStyle = C[z.color]; ctx.fillRect(split, y + 8, R - split, H);
        ctx.textAlign = 'left'; ctx.fillStyle = C[a.color];
        ctx.font = font(700, 26, MONO); ctx.fillText(a.label.toUpperCase(), L, y + H + 50);
        ctx.font = font(700, 34, MONO); ctx.fillText(a.value, L, y + H + 92);
        ctx.textAlign = 'right'; ctx.fillStyle = C[z.color];
        ctx.font = font(700, 26, MONO); ctx.fillText(z.label.toUpperCase(), R, y + H + 50);
        ctx.font = font(700, 34, MONO); ctx.fillText(z.value, R, y + H + 92);
      }
      return 160;
    },
    // A rubber stamp slapped on the right, over the block above it (sized for a short big number like "77%").
    stamp(ctx, b, y, dry) {
      // own: it gets a row to itself (for cards whose big number fills the width).
      const text = b.text.toUpperCase();
      ctx.save();
      // Fit the stamp into the space to the right of the big number
      let size = b.size || 46;
      const room = b.own ? CW - 40 : R - bigRight - 24;
      ctx.font = font(800, size, MONO); spacing(ctx, 3);
      while (size > 24 && ctx.measureText(text).width + 56 > room) { size -= 2; ctx.font = font(800, size, MONO); }
      const w = ctx.measureText(text).width + 56, h = size * 2.1;
      const TILT = 8 * Math.PI / 180;
      const rowHeight = b.own ? h * Math.cos(TILT) + w * Math.sin(TILT) + 24 : 0; // the tilt makes it taller
      if (dry) { spacing(ctx, 0); ctx.restore(); return rowHeight; }
      if (b.center) ctx.translate(W / 2, y + rowHeight / 2);
      else if (b.own) ctx.translate(R - w / 2 - 6, y + rowHeight / 2);
      else ctx.translate(R - w / 2 + 10, y - 100);
      ctx.rotate(-TILT);
      ctx.globalAlpha = 0.9;
      if (FX.stamp != null && FX.stamp < 1) {
        const [scale, opacity] = stampLanding(FX.stamp);
        ctx.scale(scale, scale);
        ctx.globalAlpha = 0.9 * opacity;
      }
      ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent;
      ctx.lineWidth = 6; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 3);
      spacing(ctx, 0);
      ctx.restore();
      return rowHeight;
    },
    lines(ctx, b, y, dry) {
      // While the big number counts up, the amounts here add up with it, so the total isn't given away.
      const counting = FX.big != null && FX.big < 1;
      const amount = v => (counting ? countTo(v, easeOut(FX.big)) : v);
      let h = 0;
      for (const [label, value] of b.rows) {
        if (!dry) leaderRow(ctx, y + h + 36, label, amount(value), 34, false);
        h += 64;
      }
      if (b.total) {
        if (!dry) { rule(ctx, y + h + 14); leaderRow(ctx, y + h + 80, b.total[0], amount(b.total[1]), 40, true); }
        h += 110;
      }
      return h + 10;
    },
    items(ctx, b, y, dry) {
      // Long names wrap onto a second line (same size, so the rows stay even) rather than being cut
      let h = 0;
      b.rows.forEach((r, i) => {
        ctx.font = font(700, 36, MONO);
        const vw = ctx.measureText(r.value).width;
        ctx.font = font(700, 36, SANS);
        const { lines } = wrap(ctx, r.name, CW - 76 - vw - 24, 2);
        if (!dry) {
          ctx.font = font(700, 30, MONO); ctx.fillStyle = C.muted; ctx.textAlign = 'left';
          ctx.fillText(String(i + 1).padStart(2, '0'), L, y + h + 40);
          ctx.font = font(700, 36, MONO); ctx.fillStyle = C.ink; ctx.textAlign = 'right';
          ctx.fillText(r.value, R, y + h + 40);
          ctx.font = font(700, 36, SANS); ctx.textAlign = 'left';
          lines.forEach((l, n) => ctx.fillText(l, L + 76, y + h + 40 + n * 44));
          ctx.font = font(400, 28, MONO); ctx.fillStyle = C.muted;
          ctx.fillText(ellipsis(ctx, r.sub, CW - 76), L + 76, y + h + 82 + (lines.length - 1) * 44);
        }
        h += 118 + (lines.length - 1) * 44;
      });
      return h;
    },
  };

  function layout(ctx, blocks, y, dry) {
    for (const b of blocks) y += BLOCKS[b.type](ctx, b, y, dry);
    return y;
  }

  function receiptPath(ctx, { x0, x1, y0, y1, tooth }) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + tooth);
    for (let x = x0, up = true; x < x1; x += tooth, up = !up) ctx.lineTo(x + tooth, up ? y0 : y0 + tooth);
    ctx.lineTo(x1, y1 - tooth);
    for (let x = x1, down = true; x > x0; x -= tooth, down = !down) ctx.lineTo(x - tooth, down ? y1 : y1 - tooth);
    ctx.closePath();
  }

  // Decorative barcode, the same every time for the same card.
  function barcode(ctx, seed, cx, y, w, h) {
    let n = 0;
    for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => (n = (n * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    ctx.fillStyle = C.ink;
    let x = cx - w / 2;
    while (x < cx + w / 2) {
      const bar = 2 + Math.floor(rand() * 4) * 2;
      if (x + bar > cx + w / 2) break;
      ctx.fillRect(x, y, bar, h);
      x += bar + 3 + Math.floor(rand() * 3) * 3;
    }
  }

  function draw(canvas, card, { index = 0, count = 1, fx = {} } = {}) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    FX = fx;

    ctx.fillStyle = C.backdrop;
    ctx.fillRect(0, 0, W, H);

    // Printing: like a till, the receipt rises out of a slot at the bottom, header first.
    const printing = fx.print != null && fx.print < 1;
    if (printing) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, SLOT); ctx.clip();
      ctx.translate(0, (1 - feed(fx.print)) * (SLOT - PAPER.y0));
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 16;
    ctx.fillStyle = C.paper;
    receiptPath(ctx, PAPER);
    ctx.fill();
    ctx.restore();

    // Shop header
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    ctx.font = font(700, 44, MONO); spacing(ctx, 8);
    ctx.fillText(BRAND.toUpperCase(), W / 2, 278);
    ctx.font = font(400, 26, MONO); spacing(ctx, 3); ctx.fillStyle = C.muted;
    ctx.fillText(`RECEIPT ${String(index + 1).padStart(2, '0')} OF ${String(count).padStart(2, '0')}`, W / 2, 326);
    spacing(ctx, 0);
    rule(ctx, 370);

    // Body, centred in the space between header and footer (nudged a little above centre)
    // A card full of long game names could reach the footer, so drop list rows from the bottom until it fits.
    const blocks = card.blocks.map(b => (b.type === 'items' ? { ...b, rows: [...b.rows] } : b));
    const room = BODY.bottom - BODY.top;
    let h = layout(ctx, blocks, 0, true);
    while (h > room) {
      const list = blocks.find(b => b.type === 'items' && b.rows.length > 1);
      if (!list) break;
      list.rows.pop();
      h = layout(ctx, blocks, 0, true);
    }
    layout(ctx, blocks, BODY.top + Math.max(0, (room - h) * 0.42), false);

    // Footer
    rule(ctx, 1478);
    ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
    ctx.font = font(700, 28, MONO); spacing(ctx, 3);
    ctx.fillText(`*** ${card.footer || 'THANK YOU, COME AGAIN'} ***`, W / 2, 1526);
    // The address sits above the barcode: story apps cover the bottom ~250px of the image.
    ctx.font = font(700, 30, MONO); spacing(ctx, 2);
    ctx.fillText(SITE, W / 2, 1568);
    spacing(ctx, 0);
    barcode(ctx, card.id + card.alt, W / 2, 1590, 520, 62);
    ctx.font = font(400, 23, MONO); ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    ctx.fillText('made in your browser · nothing uploaded', W / 2, 1684);
    // Cards get shared without the site around them, so the disclaimer has to travel with the image.
    ctx.fillText('fan-made · not affiliated with Valve or Steam', W / 2, 1712);

    if (printing) {
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = fx.print > 0.85 ? (1 - fx.print) / 0.15 : 1; // the slot fades as the paper finishes
      ctx.fillStyle = '#0b0b0a';
      ctx.beginPath(); ctx.roundRect(PAPER.x0 - 34, SLOT - 6, PAPER.x1 - PAPER.x0 + 68, 18, 9); ctx.fill();
      ctx.restore();
    }
    FX = {};
  }

  return { build, draw, money, moneyBag, W, H };
});

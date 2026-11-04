// Paste-in flow: instructions -> paste -> check what was read -> cards.
// The pasted history lives only in memory in this tab: nothing is stored, nothing is sent.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SCREENS = ['start', 'check', 'cards'];
  let current = null; // { parsed, summary }

  // ---------- display currency ----------

  // Everything is converted into one currency at each year's average rate (src/rates.js).
  const RATE_YEARS = Object.keys(SteamRates.years).sort();
  const CURRENCIES = Object.keys(SteamRates.years[RATE_YEARS[RATE_YEARS.length - 1]]);
  const POPULAR = ['AUD', 'USD', 'EUR', 'GBP', 'CAD', 'NZD', 'JPY'];
  const REGION_CURRENCY = { AU: 'AUD', US: 'USD', GB: 'GBP', CA: 'CAD', NZ: 'NZD', JP: 'JPY', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', PT: 'EUR', SG: 'SGD', HK: 'HKD', IN: 'INR', BR: 'BRL', MX: 'MXN', KR: 'KRW', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', ZA: 'ZAR' };

  // The visitor's own pick is remembered on this device only (a convenience, not their data).
  const STORE_KEY = 'display-currency';
  const loadChoice = () => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } };
  const saveChoice = c => { try { localStorage.setItem(STORE_KEY, c); } catch { /* private window etc. */ } };
  let chosen = CURRENCIES.includes(loadChoice()) ? loadChoice() : null;

  function guessCurrency() {
    const region = ((navigator.language || '').split('-')[1] || '').toUpperCase();
    return REGION_CURRENCY[region] && CURRENCIES.includes(REGION_CURRENCY[region]) ? REGION_CURRENCY[region] : 'USD';
  }
  // Until the visitor picks one, follow their Steam wallet's currency once a history is pasted.
  const activeCurrency = () => chosen || (current && CURRENCIES.includes(current.wallet) ? current.wallet : guessCurrency());

  function symbolOf(c) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).formatToParts(0).find(p => p.type === 'currency').value; }
    catch { return c; }
  }
  const currencySelect = $('currency');
  const ordered = [...POPULAR.filter(c => CURRENCIES.includes(c)), ...CURRENCIES.filter(c => !POPULAR.includes(c)).sort()];
  currencySelect.innerHTML = ordered.map(c => {
    const sym = symbolOf(c);
    return `<option value="${c}">${c}${sym !== c ? ` · ${sym === '$' ? 'US$' : sym}` : ''}</option>`;
  }).join('');
  const syncSelect = () => { currencySelect.value = activeCurrency(); };
  syncSelect();

  currencySelect.addEventListener('change', () => {
    chosen = currencySelect.value;
    saveChoice(chosen);
    if (!current) return;
    current.summary = summarise(current.parsed);
    if (!$('check').hidden) renderCheck();
    else if (!$('cards').hidden) renderCards(true);
  });

  const summarise = parsed => SteamParse.summarise(parsed, { currency: activeCurrency(), rates: SteamRates });

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const count = n => new Intl.NumberFormat('en-AU').format(n);
  const monthYear = d => d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });


  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const isMac = /mac|iphone|ipad/i.test(platform);
  const MOD = isMac ? '⌘' : 'Ctrl';
  if (isMac) document.querySelectorAll('.mod').forEach(el => { el.textContent = '⌘'; });
  if (isMac) document.querySelectorAll('.end-key').forEach(el => { el.textContent = '⌘↓'; });

  // Phones and tablets: Steam's history opens in the Steam app and the copy doesn't come through
  // cleanly, so suggest a computer. "Touch only, no hover" leaves out touchscreen laptops.
  const PHONE_KEY = 'phone-note-dismissed';
  const touchOnly = matchMedia('(pointer: coarse) and (hover: none)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem(PHONE_KEY) === '1'; } catch { /* private window etc. */ }
  $('phone-note').hidden = !touchOnly || dismissed;
  $('phone-dismiss').addEventListener('click', () => {
    $('phone-note').hidden = true;
    try { localStorage.setItem(PHONE_KEY, '1'); } catch { /* private window etc. */ }
  });
  $('send-link').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); } catch { /* closed the share sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      $('send-link').textContent = 'Link copied';
    } catch {
      $('send-link').textContent = url;
    }
  });

  function show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    document.body.dataset.screen = id; // the start page widens on big screens
    $('restart').hidden = id === 'start';
    window.scrollTo(0, 0);
    const heading = $(id).querySelector('h2');
    if (heading) heading.focus({ preventScroll: true });
  }

  // ---------- sample cards on the start page ----------

  // Made-up numbers (the same ones as the link preview), drawn with the real card code so the
  // samples always match the current design. Drawn full size, then shrunk, to save memory.
  function drawPeek() {
    const d = s => new Date(s + 'T00:00:00Z');
    const game = (name, usd, purchases, inGame) => ({ name, net: { USD: usd }, inGame: inGame ? { USD: usd } : {}, refunds: {}, refundCount: 0, purchases, inGamePurchases: inGame ? purchases : 0, first: d('2017-02-10'), last: d('2026-09-20') });
    const sample = {
      homeCurrency: 'USD', walletCurrency: 'USD',
      dateRange: { first: d('2014-06-03'), last: d('2026-10-01') },
      totals: { spend: { USD: 2934.14 }, inGame: { USD: 1021.79 }, refunds: { USD: 86.54 }, net: { USD: 2847.60 } },
      games: [game('Starfall Online', 1021.79, 86, true), game('Harbour Kings', 412.40, 6), game('Night Shift Racer', 289.10, 4), ...Array.from({ length: 60 }, (_, i) => game(`Game ${i}`, 20.24, 1))],
      sale: { onSale: 38, fullPrice: 25, avgDiscount: 52, spentOnSale: { USD: 1100 }, spentFull: { USD: 812 }, saved: { USD: 1190 }, bestDeal: null },
      gifts: { count: 2, spend: { USD: 40 }, inDecember: 1 },
      market: { sold: {}, bought: {}, net: {}, sales: 0, buys: 0 },
      byMonth: {}, monthStats: {}, refundedToZero: ['Dungeon Dash', 'Pixel Farm', 'Abyss Diver'],
      biggest: { game: 'Starfall Online', item: 'Founder Pack', date: d('2024-11-29'), amount: { value: 99.99, currency: 'USD' } },
    };
    const cards = WalletCards.build(sample, { rates: SteamRates });
    const pick = ['microtransactions', 'total', 'receipt'].map(id => cards.findIndex(c => c.id === id)).filter(i => i >= 0);
    const fan = document.querySelector('#peek .fan');
    for (const i of pick) {
      const full = document.createElement('canvas');
      WalletCards.draw(full, cards[i], { index: i, count: cards.length });
      const small = document.createElement('canvas');
      small.width = 420; small.height = Math.round(420 * WalletCards.H / WalletCards.W);
      small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);
      fan.appendChild(small);
    }
  }
  drawPeek();

  // ---------- getting the history in ----------

  // Paste works anywhere on the page, not just in the box. The clipboard's HTML is the reliable
  // input (it keeps Steam's table intact); plain text is the fallback.
  document.addEventListener('paste', e => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    handle({ html, text });
  });

  // Some phone keyboards insert clipboard text without firing a paste event.
  $('paste').addEventListener('input', e => {
    const v = e.target.value;
    if (v.length > 200) handle({ html: '', text: v });
  });

  async function readFile(f) {
    if (/\.(xlsx|xls|numbers|ods)$/i.test(f.name)) return renderFailure('spreadsheet');
    const content = await f.text();
    handle(/\.html?$/i.test(f.name) ? { html: content, text: '' } : { html: '', text: content });
  }
  $('file').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('dragover', e => { e.preventDefault(); $('drop').classList.add('over'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    $('drop').classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) return readFile(f);
    const html = e.dataTransfer.getData('text/html'), text = e.dataTransfer.getData('text/plain');
    if (html || text) handle({ html, text });
  });

  function handle(input) {
    $('paste').value = '';
    $('drop').classList.add('busy');
    // Let the "…" paint before parsing a big page.
    setTimeout(() => {
      let parsed;
      try {
        parsed = SteamParse.parse(input);
      } catch (err) {
        console.error(err);
        parsed = { source: null, entries: [], warnings: [] };
      }
      $('drop').classList.remove('busy');
      const problem = diagnose(input, parsed);
      if (problem) return renderFailure(problem);
      current = { parsed, wallet: SteamParse.summarise(parsed).walletCurrency };
      current.summary = summarise(parsed);
      syncSelect();
      renderCheck();
    }, 30);
  }

  // ---------- when nothing usable came through ----------

  // Best guess at what went wrong, from what the clipboard actually held.
  function diagnose(input, parsed) {
    const counted = parsed.entries.filter(e => e.kind !== 'skip' && e.kind !== 'unknown').length;
    if (counted) return null;
    if (parsed.entries.length) return 'unreadable';
    const text = (input.text || '') + ' ' + (input.html || '').replace(/<[^>]+>/g, ' ');
    if (!text.trim()) return 'empty';
    const english = /purchase history/i.test(text);
    if (!english && /\b(sign in|log in|login)\b/i.test(text)) return 'signed-out';
    if (english) return 'not-loaded';
    if (/steam|valve/i.test(text)) return 'wrong-page';
    return 'not-steam';
  }

  // A picture of Steam's button so people know what to look for. Not clickable on this page.
  const LOAD_MORE_BUTTON = `<span class="steam-btn">Load More Transactions</span><span class="steam-btn-note">Steam's button, pictured. Not part of this site.</span>`;
  const HISTORY_LINK = '<a href="https://store.steampowered.com/account/history" target="_blank" rel="noopener noreferrer">store.steampowered.com/account/history&nbsp;↗</a>';
  const COPY_AGAIN = `Press <kbd>${MOD}</kbd>+<kbd>A</kbd> then <kbd>${MOD}</kbd>+<kbd>C</kbd> on that page, and paste here again.`;

  // Static, trusted HTML only. Nothing from the paste goes in here.
  const FAILURES = {
    empty: {
      title: 'That paste was empty',
      body: 'Nothing came through from the clipboard. The copy probably didn\'t happen.',
      fix: [`Go back to the Steam tab. ${COPY_AGAIN}`],
    },
    'signed-out': {
      title: 'Looks like you\'re signed out of Steam',
      body: 'We got a sign-in page instead of your purchase history.',
      fix: ['Sign in to Steam in this browser.', `Open ${HISTORY_LINK}`, COPY_AGAIN],
    },
    'not-loaded': {
      title: 'We found the page, but no purchases',
      body: 'Your purchase history page came through without its list. It might not have finished loading.',
      fix: ['Wait until you can see your purchases listed on Steam.', COPY_AGAIN, 'Never bought anything on Steam? Then there\'s nothing to add up. Lucky wallet.'],
    },
    'wrong-page': {
      title: 'That\'s Steam, but not the right page',
      body: 'We need the Purchase History page, with Steam set to English.',
      fix: [
        `Open ${HISTORY_LINK}`,
        'If Steam shows another language, switch it to English for a moment in <a href="https://store.steampowered.com/account/languagepreferences" target="_blank" rel="noopener noreferrer">language preferences&nbsp;↗</a>. You can switch back after.',
        COPY_AGAIN,
      ],
    },
    'not-steam': {
      title: 'That doesn\'t look like your Steam purchase history',
      body: 'Whatever was on your clipboard, it wasn\'t your Steam history. (Don\'t worry, it never left this tab.)',
      fix: [`Open ${HISTORY_LINK}`, COPY_AGAIN],
    },
    unreadable: {
      title: 'We found rows but couldn\'t make sense of them',
      body: 'Steam may have changed how the page is laid out. That one\'s on us, not you.',
      fix: ['Try copying again in a different browser (Chrome or Firefox).', 'If it still fails, Steam has probably changed the page and this site needs an update. <a href="https://github.com/tylrae/steam-damage/issues/new?template=problem.yml" target="_blank" rel="noopener noreferrer">Let us know&nbsp;↗</a> (please leave your history out of it).'],
    },
    spreadsheet: {
      title: 'Spreadsheet files can\'t be opened directly',
      body: 'Excel and similar files need saving in a simpler format first.',
      fix: ['In your spreadsheet, choose File → Save As → CSV.', 'Open that .csv here instead.', 'Or skip the spreadsheet: copying straight from Steam works best.'],
    },
  };

  function renderFailure(code) {
    const f = FAILURES[code];
    $('check').innerHTML = `
      <div class="receipt">
        <p class="stamp bad">Hmm</p>
        <h2 tabindex="-1">${f.title}</h2>
        <p>${f.body}</p>
        <ol class="fix">${f.fix.map(x => `<li>${x}</li>`).join('')}</ol>
      </div>
      <div class="actions"><button class="primary" data-act="again">Try again</button></div>`;
    show('check');
  }

  // ---------- when it worked: show what was read, without spoiling the total ----------

  function renderCheck() {
    const { parsed, summary: s } = current;
    const kinds = {};
    for (const e of parsed.entries) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    const marketTrades = (kinds['market-sale'] || 0) + (kinds['market-buy'] || 0);
    const codes = new Set(parsed.warnings.map(w => w.code));
    const cutOff = codes.has('load-more');

    const issues = [];
    if (cutOff) {
      issues.push(['Your history looks cut off', 'Steam was still showing this button, so older purchases are missing and your totals will come out low. Go back to the Steam page and scroll to the very bottom of the list to find it. Click it until it disappears, then copy again.', LOAD_MORE_BUTTON]);
    }
    const conv = s.conversion;
    if (conv && conv.converted.length) {
      issues.push([`Everything shown in ${conv.target}`, `Purchases made in ${conv.converted.join(', ')} were converted at the average exchange rate for the year you made them. Change currency at the top right.`]);
    }
    if (conv && conv.unconverted.length) {
      issues.push(['Some amounts couldn\'t be converted', `There are no exchange rates for ${conv.unconverted.join(', ')}, so those amounts are shown separately.`]);
    }
    const unknown = parsed.warnings.find(w => w.code === 'unknown-rows');
    if (unknown) issues.push(['A few rows were skipped', unknown.message]);
    const noAmount = parsed.warnings.find(w => w.code === 'refund-no-amount');
    if (noAmount) issues.push(['A refund with no amount', noAmount.message + ' Steam didn\'t list one.']);

    const line = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    $('check').innerHTML = `
      <div class="receipt">
        <p class="stamp ${cutOff ? 'bad' : 'ok'}">${cutOff ? 'Partial' : 'Got it'}</p>
        <h2 tabindex="-1">${cutOff ? 'We got some of it' : 'Your history is in'}</h2>
        <p>Here's what we read. ${cutOff ? '' : 'If it looks right, on to the damage.'}</p>
        <dl class="lines">
          ${line('Transactions', count(parsed.entries.length))}
          ${line('From', esc(monthYear(s.dateRange.first)))}
          ${line('To', esc(monthYear(s.dateRange.last)))}
          ${line('Games', count(s.games.filter(g => g.purchases > 0).length))}
          ${marketTrades ? line('Market trades', count(marketTrades)) : ''}
          ${kinds.refund ? line('Refunds', count(kinds.refund)) : ''}
        </dl>
        ${issues.map(([t, m, extra = '']) => `<div class="issue"><b>${esc(t)}</b>${esc(m)}${extra}</div>`).join('')}
      </div>
      ${cutOff
        ? '<div class="actions"><button class="primary" data-act="again">Paste again</button><button class="ghost" data-act="go">Continue anyway</button></div>'
        : '<div class="reveal"><p class="tease">Your total\'s ready. Are you? 😬</p><button class="primary" data-act="go">Show me the damage →</button><button class="text-btn" data-act="again">Paste again</button></div>'}
      <p class="note">Dates look too recent? On Steam, scroll to the very bottom of the list and keep clicking "Load More Transactions" until it disappears, then copy again.</p>`;
    show('check');
  }

  // ---------- the cards ----------

  // Each card is drawn onto its own canvas; the visible canvas is also what gets saved.
  let deck = { cards: [], index: 0 };
  // A plain link, not Ko-fi's widget: the widget would load outside scripts into the page.
  const KOFI_URL = 'https://ko-fi.com/tylrae'; // also in index.html: the footer and the FAQ
  // Drawn here rather than fetched, so the page still makes no outside requests.
  const KOFI_ICON = '<svg class="kofi-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#29abe0"/><path d="M13 20h31v17a11 11 0 0 1-11 11H24a11 11 0 0 1-11-11z" fill="#fff"/><path d="M44 24h3a7 7 0 0 1 0 14h-3" fill="none" stroke="#fff" stroke-width="4"/><path d="M28.5 40c-6-4-9.500-7.500-9.500-11a4.700 4.700 0 0 1 9.500-1 4.700 4.700 0 0 1 9.500 1c0 3.500-3.500 7-9.500 11z" fill="#ff5e5b"/></svg>';

  function renderCards(keepPlace) {
    const s = current.summary;
    const cards = WalletCards.build(s, { rates: SteamRates });
    // One slide per card, plus a thank-you slide at the end (cards.length is its index).
    stopEntrance();
    if (!keepPlace) entered.clear(); // a fresh paste plays the entrances again; a currency switch doesn't
    deck = { cards, index: keepPlace ? Math.min(deck.index, cards.length) : 0 };
    const conv = s.conversion && s.conversion.converted.length
      ? `Amounts in ${esc(s.conversion.converted.join(', '))} converted to ${esc(s.conversion.target)} at each year's average exchange rate. `
      : '';
    $('cards').innerHTML = `
      <h2 class="sr" tabindex="-1">Your receipts</h2>
      <div class="deck">
        <div class="progress" aria-hidden="true">${[...cards, null].map(() => '<span></span>').join('')}</div>
        <div class="stage" id="stage">
          ${cards.map(c => `<canvas role="img" aria-label="${esc(c.alt)}" width="${WalletCards.W}" height="${WalletCards.H}"></canvas>`).join('')}
          <div class="thanks" id="thanks" hidden>
            <div class="thanks-paper">
              <p class="thanks-brand">Steam Damage</p>
              <p class="thanks-title">*** Thank you ***</p>
              ${KOFI_ICON}
              <p class="thanks-ask">You've spent ${esc(WalletCards.moneyBag(s.totals.net, s.homeCurrency))} on Steam. What's one more coffee?</p>
              <p class="thanks-small">This site is free, has no ads and runs on donations.</p>
              <a class="tip-btn" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">Support on Ko-fi&nbsp;↗</a>
              <p class="thanks-small">Not feeling it? Sharing your receipt helps too.</p>
              <p class="thanks-small">Fan-made. Not affiliated with Valve or Steam.</p>
            </div>
          </div>
        </div>
        <p class="sr" id="deck-pos" aria-live="polite"></p>
      </div>
      <div class="actions deck-actions">
        <button class="ghost" data-act="prev" aria-label="Previous card">←</button>
        <button class="ghost" data-act="copy" hidden>Copy image</button>
        <button class="primary" data-act="save">Save image</button>
        <button class="ghost" data-act="next" aria-label="Next card">→</button>
      </div>
      <p class="note copy-note" id="copy-note" aria-live="polite"></p>
      <a class="tip-pill" id="tip-pill" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer" aria-label="Support this site on Ko-fi" hidden>${KOFI_ICON}Support</a>
      <p class="note deck-note">Tap or swipe the card to flip through. ${conv}</p>`;
    const canvases = $('cards').querySelectorAll('canvas');
    cards.forEach((c, i) => WalletCards.draw(canvases[i], c, { index: i, count: cards.length }));
    if (keepPlace) cards.forEach((c, i) => entered.add(i));
    wireStage($('stage'));
    if (!keepPlace || $('cards').hidden) show('cards');
    showCard(deck.index, { instant: true });
  }

  // Turning a card: the old one slides out and fades while the new one slides in from the side
  // you're heading. Skipped for visitors who ask their device for less motion.
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const TURN = { duration: 260, easing: 'cubic-bezier(.2, .7, .2, 1)' };
  let turning = [];

  function turn(from, to, dir) {
    turning.forEach(end => end()); // a quick second tap jumps the first turn to its end
    from.hidden = false;
    from.classList.add('leaving');
    const out = from.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 14}%) scale(.97)` }], TURN);
    const into = to.animate([{ opacity: 0, transform: `translateX(${dir * 14}%) scale(.97)` }, { opacity: 1, transform: 'none' }], TURN);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      out.cancel(); into.cancel();
      from.classList.remove('leaving');
      if (from !== slides()[deck.index]) from.hidden = true;
    };
    out.onfinish = end;
    // Also end on a timer: browsers can stall animations (background tabs, battery saver), and
    // the next card must never be left invisible.
    setTimeout(end, TURN.duration + 100);
    turning = [end];
  }

  // First time each card appears: the first receipt prints out, the total counts up, stamps slam
  // down. Drawn frame by frame on the card's own canvas, then the finished card is drawn back, so a
  // saved image is always the final card.
  const entered = new Set(); // cards whose entrance has played since the last paste
  let entrance = null; // { stop } for the one playing now

  function stopEntrance() {
    if (entrance) entrance.stop();
  }

  function playEntrance(n) {
    stopEntrance();
    const card = deck.cards[n];
    if (!card || entered.has(n)) return;
    entered.add(n);
    if (calm.matches) return;
    const canvas = slides()[n];
    const opts = { index: n, count: deck.cards.length };
    const hasStamp = card.blocks.some(b => b.type === 'stamp');
    const print = n === 0 ? 900 : 0;
    const count = card.id === 'total' ? { from: print + 100, len: 1100 } : null;
    const stamp = hasStamp ? { from: count ? count.from + count.len + 80 : print ? print + 100 : 280, len: 480 } : null;
    if (!print && !count && !stamp) return;
    const end = Math.max(print, count ? count.from + count.len : 0, stamp ? stamp.from + stamp.len : 0);
    const part = (t, at) => (at ? Math.min(1, Math.max(0, (t - at.from) / at.len)) : 1);
    const t0 = performance.now();
    let raf = 0;
    const frame = now => {
      const t = now - t0;
      if (t >= end) return stop();
      WalletCards.draw(canvas, card, { ...opts, fx: { print: print ? Math.min(1, t / print) : 1, big: part(t, count), stamp: part(t, stamp) } });
      raf = requestAnimationFrame(frame);
    };
    const timer = setTimeout(() => stop(), end + 200); // in case frames stall (background tab)
    function stop() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      if (entrance && entrance.stop === stop) entrance = null;
      WalletCards.draw(canvas, card, opts);
    }
    entrance = { stop };
    frame(t0);
  }

  // The slides in order: one canvas per card, then the thank-you slide.
  const slides = () => [...$('stage').children].filter(el => el.tagName === 'CANVAS' || el.id === 'thanks');

  function showCard(i, { instant = false } = {}) {
    const last = deck.cards.length; // the thank-you slide
    const before = deck.index;
    deck.index = Math.max(0, Math.min(i, last));
    const all = slides();
    all.forEach((el, n) => { el.hidden = n !== deck.index; });
    if (!instant && !calm.matches && before !== deck.index) turn(all[before], all[deck.index], deck.index > before ? 1 : -1);
    playEntrance(deck.index);
    $('cards').querySelectorAll('.progress span').forEach((p, n) => p.classList.toggle('on', n <= deck.index));
    $('cards').querySelector('[data-act="prev"]').disabled = deck.index === 0;
    $('cards').querySelector('[data-act="next"]').disabled = deck.index === last;
    $('cards').querySelector('[data-act="save"]').hidden = deck.index === last; // nothing to save here
    $('cards').querySelector('[data-act="copy"]').hidden = !canCopy || deck.index === last;
    $('copy-note').textContent = '';
    $('deck-pos').textContent = deck.index === last ? 'Thank you page' : `Card ${deck.index + 1} of ${last}`;
    $('tip-pill').hidden = deck.index !== last - 1; // only on the final receipt, after the laugh
  }
  const step = d => showCard(deck.index + d);

  // Swipe left/right, or tap: left third goes back, the rest goes forward (like stories).
  function wireStage(stage) {
    let start = null;
    stage.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
    stage.addEventListener('pointerup', e => {
      if (!start || e.target.closest('a')) return; // the Ko-fi button is a link, not a page turn
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return step(dx < 0 ? 1 : -1);
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const r = stage.getBoundingClientRect();
        step(e.clientX - r.left < r.width / 3 ? -1 : 1);
      }
    });
  }

  document.addEventListener('keydown', e => {
    if ($('cards').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // Copy image: the easy way into Discord, Reddit or X on a computer (paste straight into a chat or
  // post). Phones don't get it: Save image already opens their share sheet. The image goes to the
  // clipboard only, never anywhere else.
  const canCopy = !touchOnly && !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

  function copyCard(button) {
    stopEntrance(); // copy the finished card, not a frame of its entrance
    const canvas = slides()[deck.index];
    // The image is passed as a promise so Safari still counts this as part of the click.
    const png = new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => {
      button.textContent = 'Copied ✓';
      $('copy-note').textContent = `Now paste it into Discord, Reddit or X with ${MOD}+V.`;
      setTimeout(() => { button.textContent = 'Copy image'; }, 2000);
    }, () => {
      $('copy-note').textContent = "Your browser wouldn't copy it. Use Save image instead.";
    });
  }

  // Phones get the share sheet (straight to Instagram, Discord, Photos...); computers get a download.
  function saveCard() {
    stopEntrance(); // save the finished card, not a frame of its entrance
    const card = deck.cards[deck.index];
    const canvas = $('cards').querySelectorAll('canvas')[deck.index];
    const name = `steam-damage-${String(deck.index + 1).padStart(2, '0')}-${card.id}.png`;
    canvas.toBlob(async blob => {
      const file = new File([blob], name, { type: 'image/png' });
      const phone = matchMedia('(hover: none) and (pointer: coarse)').matches;
      if (phone && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'go') renderCards();
    if (a === 'prev') step(-1);
    if (a === 'next') step(1);
    if (a === 'save') saveCard();
    if (a === 'copy') copyCard(act);
    if (a === 'again') {
      current = null;
      syncSelect();
      show('start');
      $('paste').focus();
    }
  });
})();

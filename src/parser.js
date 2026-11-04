/*
 * Steam Account History parser.
 *
 * Input: what the user pasted (the clipboard's HTML and/or plain text), or a .csv/.tsv file's text.
 * Output: one classified entry per transaction row, plus per-game / market totals.
 *
 * Pure functions: no DOM, no network. Loads as a classic <script> (window.SteamParse) and in Node
 * (require) so the same code runs on the site and in the tests.
 *
 * The rules implemented here are summarised in the comments below; the tests in tests/parser.test.js show each one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SteamParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- text helpers ----------

  const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', reg: '®', trade: '™', copy: '©',
    ndash: '–', mdash: '—', hellip: '…', euro: '€', pound: '£', yen: '¥', rsquo: '’', lsquo: '‘',
  };

  // Runs twice because Steam sometimes double-encodes ("&amp;reg;" -> "&reg;" -> "®").
  function decodeEntities(s) {
    for (let pass = 0; pass < 2; pass++) {
      s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
          const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return NAMED_ENTITIES[e.toLowerCase()] ?? m;
      });
    }
    return s;
  }

  // Split a cell into its visual lines. A newline, a tab or a run of 3+ spaces is where Steam put
  // two separate things side by side (game / item name, sticker price / discounted price).
  function splitLines(s) {
    return String(s)
      .replace(/ /g, ' ')
      .split(/\r?\n|\r|\t| {3,}/)
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  // ---------- dates ----------

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const monthOf = name => MONTHS[name.slice(0, 3).toLowerCase()];

  function utc(y, m, d) {
    if (m == null || !(y >= 2003 && y <= 2100) || !(m >= 0 && m <= 11) || !(d >= 1 && d <= 31)) return null;
    return new Date(Date.UTC(y, m, d));
  }

  // Returns [date, charsConsumed] or null. Accepts Steam's English formats ("30 Oct, 2026",
  // "Oct 30, 2026"), ISO, d/m/y (AU spreadsheets), and Excel serial numbers ("46324").
  function matchDate(s, now) {
    let m;
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/))) return [utc(+m[3], monthOf(m[2]), +m[1]), m[0].length];
    if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/))) return [utc(+m[3], monthOf(m[1]), +m[2]), m[0].length];
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return [utc(+m[1], +m[2] - 1, +m[3]), m[0].length];
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/))) {
      const a = +m[1], b = +m[2];
      // d/m/y unless that is impossible (US-style m/d/y with a day above 12)
      return [a <= 12 && b > 12 ? utc(+m[3], a - 1, b) : utc(+m[3], b - 1, a), m[0].length];
    }
    if ((m = s.match(/^(\d{5})(?:\.\d+)?$/))) {
      const d = new Date(Date.UTC(1899, 11, 30) + +m[1] * 864e5);
      return [utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), m[0].length];
    }
    // This year's rows may have no year ("30 Oct"). Only accepted when the cell holds nothing else.
    let md = null;
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?$/))) md = [monthOf(m[2]), +m[1]];
    else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/))) md = [monthOf(m[1]), +m[2]];
    if (md) {
      const y = now.getUTCFullYear();
      let d = utc(y, md[0], md[1]);
      if (d && d > now) d = utc(y - 1, md[0], md[1]);
      return [d, m[0].length];
    }
    return null;
  }

  function parseDate(s, now) {
    if (s == null) return null;
    const r = matchDate(String(s).replace(/ /g, ' ').trim(), now || new Date());
    return r ? r[0] : null;
  }

  // True when the whole string is a date and nothing else (used to spot where a row starts).
  function isDateOnly(s, now) {
    s = String(s).replace(/ /g, ' ').trim();
    const r = matchDate(s, now);
    return !!(r && r[0] && r[1] >= s.length - 1);
  }

  // ---------- money ----------

  // Longest markers first so "A$" is never read as "$", and "RM" never as "R ".
  const CURRENCY_MARKERS = [
    ['CDN$', 'CAD'], ['Mex$', 'MXN'], ['COL$', 'COP'], ['CLP$', 'CLP'], ['ARS$', 'ARS'], ['US$', 'USD'], ['NZ$', 'NZD'],
    ['HK$', 'HKD'], ['NT$', 'TWD'], ['A$', 'AUD'], ['S$', 'SGD'], ['R$', 'BRL'], ['$U', 'UYU'], ['S/.', 'PEN'], ['$', 'USD'],
    ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['₩', 'KRW'], ['₹', 'INR'], ['₴', 'UAH'], ['₺', 'TRY'],
    ['₪', 'ILS'], ['₸', 'KZT'], ['₱', 'PHP'], ['฿', 'THB'], ['₫', 'VND'], ['₡', 'CRC'], ['pуб', 'RUB'], ['руб', 'RUB'], ['zł', 'PLN'],
    ['CHF', 'CHF'], ['AED', 'AED'], ['RM', 'MYR'], ['Rp', 'IDR'], ['SR', 'SAR'], ['QR', 'QAR'], ['KD', 'KWD'], ['kr', 'NOK'], ['R ', 'ZAR'],
  ];
  // Steam shows these without cents, using a dot between thousands ("150.000₫"), so a dot there isn't a decimal point.
  const NO_CENTS = new Set(['VND', 'CRC', 'CLP', 'COP', 'IDR', 'JPY', 'KRW']);

  function detectCurrency(s) {
    for (const [mark, code] of CURRENCY_MARKERS) if (s.includes(mark)) return code;
    return null;
  }

  // "1 399" (space thousands) | "1,399.00" | "12,99" | "8,--"
  const NUM_RE = /\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d[\d.,]*(?:,--)?/g;

  function toNumber(n) {
    n = n.replace(/[\s ]/g, '');
    if (n.endsWith(',--')) return parseFloat(n.slice(0, -3).replace(/[.,]/g, ''));
    n = n.replace(/[.,]$/, '');
    const lastComma = n.lastIndexOf(','), lastDot = n.lastIndexOf('.');
    if (lastComma > lastDot) {
      // A comma is the decimal point only when 1-2 digits follow it ("12,99"); else thousands ("1,399").
      const decimals = n.length - lastComma - 1;
      if (decimals >= 1 && decimals <= 2) return parseFloat(n.slice(0, lastComma).replace(/[.,]/g, '') + '.' + n.slice(lastComma + 1));
      return parseFloat(n.replace(/[.,]/g, ''));
    }
    return parseFloat(n.replace(/,/g, ''));
  }

  // Reads the LAST amount in a cell, so a discounted "-20% A$ 14.95 A$ 11.96" gives 11.96.
  // Returns { value, currency, sign } where sign is +1 / -1 for wallet changes, 0 when unsigned.
  function parseAmount(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/ /g, ' ').trim();
    if (!s || /^#[A-Z/0!?]/i.test(s)) return null; // spreadsheet error cells such as #ERROR!
    s = s.replace(/[+-]?\d+(?:[.,]\d+)?\s*%/g, ' '); // discount badges
    const nums = [...s.matchAll(NUM_RE)];
    if (!nums.length) return null;
    const last = nums[nums.length - 1];
    const prev = nums[nums.length - 2];
    const before = s.slice(prev ? prev.index + prev[0].length : 0, last.index);
    const after = s.slice(last.index + last[0].length);
    const currency = detectCurrency(before) || detectCurrency(after);
    const value = NO_CENTS.has(currency) && /^\d{1,3}(?:\.\d{3})+$/.test(last[0]) ? parseFloat(last[0].replace(/\./g, '')) : toNumber(last[0]);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      currency,
      sign: /[-−]/.test(before) ? -1 : /\+/.test(before) ? 1 : 0,
    };
  }

  // ---------- game names ----------

  // Checked in order; first match wins. Extend this as new variants turn up.
  const ALIASES = [
    [/^prime status upgrade/i, 'Counter-Strike'],
    [/^counter-strike/i, 'Counter-Strike'],
    [/^throne and liberty/i, 'Throne and Liberty'],
    [/^warframe/i, 'Warframe'],
    [/^\S+ prime\s*(:|access|accessories|pack)/i, 'Warframe'], // standalone prime packs: "Ivara Prime: ..."
    [/^helldivers\s*2/i, 'Helldivers 2'],
    [/^aion 2\b/i, 'AION 2'],
    // Expansions named with a colon or no separator, which the label rules below leave alone.
    [/^cyberpunk 2077\b/i, 'Cyberpunk 2077'],
    [/^destiny 2\b/i, 'Destiny 2'],
    [/^monster hunter: world\b/i, 'Monster Hunter: World'],
    [/^monster hunter wilds\b/i, 'Monster Hunter Wilds'],
    [/^elden ring\b(?!\s*nightreign)/i, 'Elden Ring'], // Nightreign is its own game
    [/^baldur's gate 3\b/i, "Baldur's Gate 3"],
    [/^the elder scrolls online\b/i, 'The Elder Scrolls Online'],
    [/^final fantasy xiv\b/i, 'Final Fantasy XIV'],
  ];

  const EDITION_SUFFIX = /[\s:–—-]+(?:(?:digital\s+)?(?:(?:super\s+)?deluxe|standard|gold|ultimate|definitive|complete|premium|enhanced|collector'?s|game of the year|goty|\d{4})\s+)?(?:edition|upgrade)$/i;
  const KNOWN_EDITION = /[\s:–—-]+(?:digital\s+)?(?:(?:super\s+)?deluxe|standard|gold|ultimate|definitive|complete|premium|enhanced|collector'?s|game of the year|goty|\d{4})\s+edition$/i;
  const COLON_EDITION = /\s*:[^:]*\bedition$/i; // "Surviving Mars: First Colony Edition"

  // Shop labels and DLC hang off the end after a spaced dash: "... - 1-Year Anniversary Edition - Preorder",
  // "V Rising - Dracula's Relics Pack". Dropping them folds editions and DLC into the base game.
  // Colons are left alone: they're usually part of the real title ("Hollow Knight: Silksong").
  const STORE_LABEL = /\b(pre-?orders?|editions?|anniversary|upgrades?|bundle|soundtrack|ost|pass|packs?|dlc|expansion|bonus|content|cosmetics?|skins?|supporter)\b/i;
  const NAMED_PACK = /\s+(?:founder'?s|supporter'?s|starter|deluxe|premium|collector'?s)\s+pack\b.*$/i; // "Pax Dei Founder's Pack: Journeyman"
  const DISCOUNT_TAG = /\s*\(\s*-?\d+%\s*\)/g; // "(-30%)" that Steam sometimes leaves in the title

  function dropStoreLabels(s) {
    const parts = s.split(/(\s+[-–—]\s+)/); // keeps the dashes, so untouched names come back unchanged
    while (parts.length > 1 && STORE_LABEL.test(parts[parts.length - 1])) parts.splice(-2);
    return parts.join('');
  }

  function normaliseName(raw) {
    let s = decodeEntities(String(raw || '')).replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/\s*gift sent to .*$/i, '').trim();
    for (const [re, name] of ALIASES) if (re.test(s)) return name;
    const base = dropStoreLabels(s.replace(DISCOUNT_TAG, '').trim()).replace(NAMED_PACK, '').replace(KNOWN_EDITION, '').replace(COLON_EDITION, '').replace(EDITION_SUFFIX, '').trim();
    return base || s;
  }

  // ---------- turning the paste into a grid: rows -> cells -> lines ----------

  const COLUMN_NAMES = {
    date: /^date$/i, items: /^items?$/i, type: /^type$/i, price: /^price$/i, total: /^total$/i,
    change: /^(wallet )?change$/i, balance: /^(wallet )?balance$/i,
  };
  const DEFAULT_COLUMNS = { date: 0, items: 1, type: 2, total: 3, change: 4, balance: 5 };

  function headerColumns(cellTexts) {
    const names = cellTexts.map(c => c.replace(/\s+/g, ' ').trim());
    if (!names.some(n => COLUMN_NAMES.date.test(n)) || !names.some(n => COLUMN_NAMES.items.test(n))) return null;
    const cols = {};
    for (const k in COLUMN_NAMES) {
      const i = names.findIndex(n => COLUMN_NAMES[k].test(n));
      if (i >= 0) cols[k] = i;
    }
    let width = names.length;
    // Steam's header is two rows: "Wallet" spans two columns, with "Change | Balance" underneath.
    const wallet = names.findIndex(n => /^wallet$/i.test(n));
    if (cols.change == null && wallet >= 0) {
      cols.change = wallet;
      cols.balance = wallet + 1;
      width = Math.max(width, wallet + 2);
    }
    return { cols, width };
  }

  // HTML path. Works on the whole copied page: only <tr> rows matter, everything else is ignored.
  function gridFromHtml(html) {
    html = String(html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, '');
    const grid = [];
    for (const chunk of html.split(/<tr\b[^>]*>/i).slice(1)) {
      const body = chunk.split(/<\/tr\s*>/i)[0];
      const cells = body.split(/<t[dh]\b[^>]*>/i).slice(1).map(c => htmlCellLines(c.split(/<\/t[dh]\s*>/i)[0]));
      if (cells.length) grid.push(cells);
    }
    let cols = DEFAULT_COLUMNS;
    for (const row of grid) {
      const h = headerColumns(row.map(c => c.join(' ')));
      if (h) { cols = h.cols; break; }
    }
    return { grid, cols };
  }

  function htmlCellLines(cellHtml) {
    const text = cellHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|li|ul|ol|h\d)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return splitLines(decodeEntities(text));
  }

  // Quote-aware split of tab/comma separated text into physical rows. Spreadsheets wrap cells that
  // contain newlines in "quotes"; browsers don't. If a quote never closes, it was just a character.
  function splitDelimited(text, delim, quotes = true) {
    const rows = [];
    let row = [], cell = '', inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuote) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cell += ch;
      } else if (ch === '"' && quotes && cell === '') inQuote = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (inQuote && quotes) return splitDelimited(text, delim, false);
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // Plain-text path. A copy from the browser breaks multi-line cells ("Game\nItem") across physical
  // lines, so rows are rebuilt by starting a new one at every line that begins with a date and
  // gluing the lines in between onto the previous cell.
  function gridFromText(text, now = new Date()) {
    text = String(text).replace(/\r\n?/g, '\n');
    const delim = text.includes('\t') ? '\t' : /(^|\n)\s*"?date"?\s*,/i.test(text) ? ',' : null;
    if (!delim) return { grid: gridFromLines(text, now), cols: DEFAULT_COLUMNS, mode: 'lines' };

    let cols = DEFAULT_COLUMNS, width = 6;
    const records = [];
    let cur = null, orphanChange = null;
    for (const r of splitDelimited(text, delim)) {
      const h = headerColumns(r);
      if (h) { cols = h.cols; width = h.width; cur = null; continue; }
      if (isDateOnly(r[0], now)) {
        cur = r.slice();
        // A blank-dated spreadsheet row can carry the wallet change for the row after it.
        if (orphanChange && cols.change != null && !(cur[cols.change] || '').trim()) cur[cols.change] = orphanChange;
        orphanChange = null;
        records.push(cur);
        continue;
      }
      // A line that is only a tab is still a cell boundary (Steam puts one between Items and Type).
      if (r.length === 1 && !r[0].trim()) continue;
      if (cur && cur.length < width) {
        cur[cur.length - 1] += '\n' + r[0];
        cur.push(...r.slice(1));
      } else if (r.length >= width - 1 && cols.change != null && parseAmount(r[cols.change])) {
        orphanChange = r[cols.change];
        cur = null;
      } else {
        cur = null; // row complete; anything else here is page furniture (menus, footer)
      }
    }
    return { grid: records.map(rec => rec.map(splitLines)), cols, mode: delim === '\t' ? 'tabs' : 'csv' };
  }

  // Last resort when there are no tabs at all: every cell on its own line. Work out which line is
  // which from shape: items, then the type line, then payment method, then the amounts.
  const TYPE_LINE = /\b(purchase|refund|market transaction|transaction)\b/i;

  function isMoneyLine(l) {
    return /%/.test(l) || (/\d/.test(l) && (!!detectCurrency(l) || /^[+-]?\s*\d[\d.,\s]*$/.test(l)));
  }

  function gridFromLines(text, now) {
    const records = [];
    let cur = null;
    for (const l of splitLines(text)) {
      if (isDateOnly(l, now)) { cur = [l]; records.push(cur); }
      else if (cur) cur.push(l);
    }
    return records.map(([date, ...rest]) => {
      let t = rest.findIndex((l, i) => i >= 1 && TYPE_LINE.test(l) && !isMoneyLine(l));
      if (t < 0) t = rest.findIndex(l => TYPE_LINE.test(l) && !isMoneyLine(l));
      if (t < 0) return [[date], rest, [], [], [], []];
      const items = rest.slice(0, t), after = rest.slice(t + 1);
      const type = [rest[t], ...after.filter(l => !isMoneyLine(l))];
      const money = after.filter(isMoneyLine);
      const signed = money.findIndex(l => /^[+-]/.test(l) && !/%/.test(l));
      if (signed < 0) return [[date], items, type, money, [], []];
      return [[date], items, type, money.slice(0, signed), [money[signed]], money.slice(signed + 1, signed + 2)];
    });
  }

  // ---------- rows -> entries ----------

  function toRecord(cells, cols, now, index) {
    const cell = k => (cols[k] != null && cells[cols[k]]) || [];
    const dateText = cell('date').join(' ');
    const date = parseDate(dateText, now);
    if (!date) return null;
    const totalText = cell('total').join(' ');
    const changeText = cell('change').join(' ');
    // Steam shows "-20% A$ 14.95 A$ 11.96" in the Price column; spreadsheets may carry it in Total.
    const discount = `${cell('price').join(' ')} ${totalText}`.match(/-\s*(\d{1,2})\s*%/);
    return {
      index,
      date,
      dateText,
      items: cell('items').map(decodeEntities),
      type: cell('type')[0] || '',
      typeText: cell('type').join(' '),
      totalText,
      changeText,
      total: parseAmount(totalText),
      change: parseAmount(changeText),
      changeError: /#[A-Z]/i.test(changeText),
      discountPct: discount ? +discount[1] : null,
      rowText: cells.map(c => c.join(' ')).join(' | '),
    };
  }

  // The money that actually moved. Wallet Change is what the wallet was really debited/credited,
  // so it wins when it's in a different currency to the sticker price (USD-priced items on an AUD
  // wallet). In the same currency Total wins: a purchase paid partly from the wallet and partly by
  // card shows only the wallet part as the change.
  function moneyMoved(rec) {
    const t = rec.total, c = rec.change;
    if (c && (!t || t.currency !== c.currency)) return { value: c.value, currency: c.currency || '?', from: 'wallet change' };
    if (t) return { value: t.value, currency: t.currency || '?', from: 'total' };
    return null;
  }

  function classify(rec) {
    const itemsText = rec.items.join(' ');
    const type = rec.typeText;
    const e = Object.assign(rec, { kind: 'skip', reason: '', game: null, item: null, amount: null, inGame: false, gift: false, bundle: false, flags: [] });

    if (/wallet credit/i.test(itemsText)) return Object.assign(e, { reason: 'wallet top-up' });
    if (/currency conversion/i.test(itemsText + ' ' + type)) return Object.assign(e, { reason: 'currency conversion' });
    if (/gift card/i.test(itemsText)) return Object.assign(e, { reason: 'digital gift card' });

    e.amount = moneyMoved(rec);
    if (e.changeError) e.flags.push('wallet change was a spreadsheet error; used Total');

    if (/steam community market/i.test(itemsText) || /market transaction/i.test(type)) {
      const sale = rec.change ? rec.change.sign > 0 : /\bcredit\b/i.test(rec.rowText);
      return Object.assign(e, { kind: sale ? 'market-sale' : 'market-buy' });
    }

    const titles = rec.items.filter(l => !/^gift sent to/i.test(l));
    const gift = /gift/i.test(type) || /gift sent to/i.test(itemsText);

    if (/refund/i.test(type)) {
      if (!e.amount) e.flags.push('refund has no amount');
      return Object.assign(e, { kind: 'refund', game: normaliseName(titles[0]), gift });
    }
    if (/in-game purchase/i.test(type)) {
      if (!e.amount) e.flags.push('no amount found');
      return Object.assign(e, { kind: 'purchase', inGame: true, game: normaliseName(titles[0]), item: titles.slice(1).join(' ') || null, gift });
    }
    if (/purchase/i.test(type) || gift) {
      if (!e.amount) e.flags.push('no amount found');
      return Object.assign(e, { kind: 'purchase', game: normaliseName(titles[0]), bundle: titles.length > 1, gift });
    }
    return Object.assign(e, { kind: 'unknown', reason: 'unrecognised type: ' + (rec.type || '(blank)') });
  }

  /**
   * parse({ html, text }) or parse(text)
   * Prefers the clipboard HTML (it keeps the table structure), falls back to plain text.
   */
  function parse(input, opts = {}) {
    const now = opts.now || new Date();
    const html = input && typeof input === 'object' ? input.html : null;
    const text = typeof input === 'string' ? input : (input && input.text) || '';

    let source = null, grid = [], cols = DEFAULT_COLUMNS;
    if (html) {
      const r = gridFromHtml(html);
      if (r.grid.some(row => parseDate((row[r.cols.date] || []).join(' '), now))) ({ grid, cols } = r), source = 'html';
    }
    if (!source && text.trim()) {
      const r = gridFromText(text, now);
      ({ grid, cols } = r);
      source = r.mode;
    }

    const entries = [];
    grid.forEach((cells, i) => {
      const rec = toRecord(cells, cols, now, i);
      if (rec) entries.push(classify(rec));
    });

    // Steam sometimes splits one purchase into a dated row holding only the wallet change and, further
    // down the same day (past any wallet top-up rows), the purchase row with no change. Hand the
    // change down to that purchase.
    entries.forEach((e, i) => {
      if (e.kind !== 'unknown' || e.items.length || e.type || !e.change) return;
      e.kind = 'skip';
      e.reason = 'wallet change belonging to a later row';
      const next = entries.slice(i + 1).find(n => +n.date === +e.date && !n.change && (n.kind === 'purchase' || n.kind === 'refund'));
      if (next) {
        next.change = e.change;
        next.amount = moneyMoved(next);
        next.flags.push('wallet change taken from the row above (Steam split it)');
      }
    });

    // { code, message }: the code lets the page show its own help for each case.
    const warnings = [];
    const warn = (code, message) => warnings.push({ code, message });
    if (!entries.length && (text.trim() || html)) {
      warn('no-rows', "Couldn't find any transactions. Copy from store.steampowered.com/account/history, with Steam's language set to English.");
    }
    if (/load\s+more\s+transactions/i.test(`${text} ${html}`)) { // the button's words: a finished history has none
      warn('load-more', 'The paste still contains a "Load More Transactions" button, so older history is missing. Click it on Steam until it disappears, then copy again.');
    }
    const unknown = entries.filter(e => e.kind === 'unknown').length;
    if (unknown) warn('unknown-rows', `${unknown} row(s) had a type the parser doesn't recognise and were left out.`);
    const noRefundAmount = entries.filter(e => e.kind === 'refund' && !e.amount).length;
    if (noRefundAmount) warn('refund-no-amount', `${noRefundAmount} refund(s) had no amount, so they couldn't be subtracted.`);

    return { source, entries, warnings };
  }

  // ---------- totals ----------

  const round2 = v => Math.round(v * 100) / 100;
  function addTo(bag, cur, v) { bag[cur] = round2((bag[cur] || 0) + v); }
  const hasLower = s => /[a-z]/.test(s);

  // Converts at the average rate for the year the money was spent (rates: src/rates.js, 1 USD = x).
  // Returns null for a currency the table doesn't cover, so that amount stays in its own currency.
  function makeConverter(rates, target) {
    if (!rates || !target) return null;
    const years = Object.keys(rates.years).map(Number).sort((x, y) => x - y);
    return (amount, date) => {
      if (amount.currency === target) return amount.value;
      const y = Math.min(Math.max(date.getUTCFullYear(), years[0]), years[years.length - 1]);
      const from = rates.years[y][amount.currency], to = rates.years[y][target];
      return from && to ? amount.value / from * to : null;
    };
  }

  /**
   * summarise(parsed, { year, includeGifts, merge, currency, rates })
   * merge: { "old name": "new name" } for games the user merged by hand.
   * currency + rates: convert everything into one currency. Without them amounts stay per currency.
   */
  function summarise(parsed, opts = {}) {
    const { year = null, includeGifts = true, merge = {}, currency: target = null, rates = null } = opts;
    const convert = makeConverter(rates, target);
    const converted = new Set(), unconverted = new Set();
    const moneyOf = e => {
      const a = e.amount;
      if (!a || !convert) return a;
      const v = convert(a, e.date);
      if (v == null) { unconverted.add(a.currency); return a; }
      if (a.currency !== target) converted.add(a.currency);
      return { value: v, currency: target };
    };
    const mergeKeys = {};
    for (const k in merge) mergeKeys[k.toLowerCase()] = merge[k];

    const entries = parsed.entries.filter(e => year == null || e.date.getUTCFullYear() === year);
    const games = new Map();
    const totals = { spend: {}, refunds: {}, net: {}, inGame: {}, gifts: {} };
    const market = { sold: {}, bought: {}, net: {}, sales: 0, buys: 0 };
    const byMonth = {};
    const currencyCount = {};
    const sale = { onSale: 0, fullPrice: 0, discountSum: 0, spentOnSale: {}, spentFull: {}, saved: {}, bestDeal: null };
    const monthStats = {};
    let giftsInDecember = 0;
    const purchases = [];
    let giftCount = 0, first = null, last = null;

    // Purchases that were later refunded stay out of the sale stats: a returned game wasn't a bargain.
    // Each refund cancels the closest earlier purchase of that game, including one inside a bundle.
    const refundedRows = new Set();
    for (const r of entries) {
      if (r.kind !== 'refund') continue;
      const key = r.game.toLowerCase();
      const match = entries
        .filter(p => p.kind === 'purchase' && p.date <= r.date && !refundedRows.has(p)
          && (p.game.toLowerCase() === key || p.items.some(i => normaliseName(i).toLowerCase() === key)))
        .sort((x, y) => y.date - x.date)[0];
      if (match) refundedRows.add(match);
    }

    for (const e of entries) {
      if (!first || e.date < first) first = e.date;
      if (!last || e.date > last) last = e.date;
      const a = moneyOf(e);

      if (e.kind === 'market-sale' || e.kind === 'market-buy') {
        if (!a) continue;
        const isSale = e.kind === 'market-sale';
        addTo(isSale ? market.sold : market.bought, a.currency, a.value);
        addTo(market.net, a.currency, isSale ? a.value : -a.value);
        isSale ? market.sales++ : market.buys++;
        continue;
      }
      if (e.kind !== 'purchase' && e.kind !== 'refund') continue;
      if (e.gift && !includeGifts) continue;

      const name = mergeKeys[e.game.toLowerCase()] || e.game;
      const key = name.toLowerCase();
      let g = games.get(key);
      if (!g) {
        g = { name, spend: {}, refunds: {}, net: {}, inGame: {}, purchases: 0, inGamePurchases: 0, refundCount: 0, gifts: 0, first: e.date, last: e.date };
        games.set(key, g);
      }
      if (!hasLower(g.name) && hasLower(name)) g.name = name; // prefer "Elden Ring" over "ELDEN RING"
      if (e.date < g.first) g.first = e.date;
      if (e.date > g.last) g.last = e.date;

      if (e.kind === 'refund') {
        g.refundCount++;
        if (a) { addTo(g.refunds, a.currency, a.value); addTo(totals.refunds, a.currency, a.value); }
        continue;
      }

      g.purchases++;
      if (!a) continue;
      currencyCount[e.amount.currency] = (currencyCount[e.amount.currency] || 0) + 1;
      addTo(g.spend, a.currency, a.value);
      addTo(totals.spend, a.currency, a.value);
      if (e.inGame) { g.inGamePurchases++; addTo(g.inGame, a.currency, a.value); addTo(totals.inGame, a.currency, a.value); }
      else if (refundedRows.has(e)) { /* counted in spend and refunds, but not as a sale or full-price buy */ }
      else if (e.discountPct) {
        sale.onSale++;
        sale.discountSum += e.discountPct;
        addTo(sale.spentOnSale, a.currency, a.value);
        // Worked back from the discount, so it's the same currency as what was paid.
        const saved = a.value * e.discountPct / (100 - e.discountPct);
        addTo(sale.saved, a.currency, saved);
        if (!sale.bestDeal || e.discountPct > sale.bestDeal.pct) sale.bestDeal = { game: name, pct: e.discountPct };
      } else {
        sale.fullPrice++;
        addTo(sale.spentFull, a.currency, a.value);
      }
      if (e.gift) {
        g.gifts++; giftCount++; addTo(totals.gifts, a.currency, a.value);
        if (e.date.getUTCMonth() === 11) giftsInDecember++;
      }
      const month = e.date.toISOString().slice(0, 7);
      byMonth[month] = byMonth[month] || {};
      addTo(byMonth[month], a.currency, a.value);
      const ms = monthStats[month] = monthStats[month] || { count: 0, games: {} };
      ms.count++;
      ms.games[name] = (ms.games[name] || 0) + 1;
      purchases.push({ game: name, item: e.item, date: e.date, amount: a });
    }

    // The wallet's own currency: the one most purchases were made in, before any conversion.
    const walletCurrency = Object.keys(currencyCount).sort((x, y) => currencyCount[y] - currencyCount[x])[0] || null;
    const homeCurrency = target || walletCurrency;
    const biggest = purchases.filter(p => p.amount.currency === homeCurrency)
      .reduce((b, p) => (!b || p.amount.value > b.amount.value ? p : b), null);

    const netOf = (spend, refunds) => {
      const out = {};
      for (const c of new Set([...Object.keys(spend), ...Object.keys(refunds)])) out[c] = round2((spend[c] || 0) - (refunds[c] || 0));
      return out;
    };
    for (const g of games.values()) g.net = netOf(g.spend, g.refunds);
    totals.net = netOf(totals.spend, totals.refunds);

    const homeNet = g => (homeCurrency && g.net[homeCurrency]) || 0;
    const list = [...games.values()].sort((x, y) => homeNet(y) - homeNet(x) || x.name.localeCompare(y.name));
    const isZero = net => Object.values(net).every(v => Math.abs(v) < 0.01);

    return {
      homeCurrency,
      walletCurrency,
      conversion: convert
        ? { target, converted: [...converted].sort(), unconverted: [...unconverted].sort(), source: rates.source, builtAt: rates.builtAt }
        : null,
      dateRange: { first, last },
      totals,
      games: list,
      refundedToZero: list.filter(g => g.refundCount > 0 && isZero(g.net)).map(g => g.name),
      refundsWithoutPurchase: list.filter(g => g.refundCount > 0 && g.purchases === 0).map(g => g.name),
      market,
      gifts: { count: giftCount, spend: totals.gifts, inDecember: giftsInDecember },
      sale: { onSale: sale.onSale, fullPrice: sale.fullPrice, avgDiscount: sale.onSale ? round2(sale.discountSum / sale.onSale) : null, spentOnSale: sale.spentOnSale, spentFull: sale.spentFull, saved: sale.saved, bestDeal: sale.bestDeal },
      biggest,
      byMonth,
      monthStats,
    };
  }

  return { parse, summarise, parseAmount, parseDate, normaliseName, decodeEntities, gridFromHtml, gridFromText, splitLines };
});

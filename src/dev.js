// Parser bench: paste or open an export, see exactly how each row was read.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let last = { html: '', text: '' };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = d => (d ? d.toISOString().slice(0, 10) : '');

  function money(v, cur) {
    try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(v); }
    catch { return `${cur} ${v.toFixed(2)}`; }
  }
  const bag = b => Object.entries(b || {}).filter(([, v]) => v).map(([c, v]) => money(v, c)).join(' + ') || '–';

  // Reading the clipboard's HTML flavour is the whole trick: it keeps the table structure that
  // plain text loses.
  $('paste').addEventListener('paste', e => {
    e.preventDefault();
    last = { html: e.clipboardData.getData('text/html'), text: e.clipboardData.getData('text/plain') };
    $('paste').value = last.text;
    $('clip').textContent = `Clipboard had: HTML ${last.html ? (last.html.length / 1024).toFixed(0) + ' KB' : 'none'} · text ${(last.text.length / 1024).toFixed(0)} KB`;
    $('saveHtml').disabled = !last.html;
    $('saveText').disabled = !last.text;
    run(last);
  });

  $('reparse').addEventListener('click', () => {
    last = { html: '', text: $('paste').value };
    $('saveText').disabled = !last.text;
    $('saveHtml').disabled = true;
    run(last);
  });

  $('file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const content = await f.text();
    last = /\.html?$/i.test(f.name) ? { html: content, text: '' } : { html: '', text: content };
    $('paste').value = last.text || '(HTML file loaded)';
    $('clip').textContent = `Opened ${f.name}`;
    run(last);
  });

  function save(content, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('saveHtml').addEventListener('click', () => save(last.html, 'steam-paste.html', 'text/html'));
  $('saveText').addEventListener('click', () => save(last.text, 'steam-paste.txt', 'text/plain'));

  function run(input) {
    const parsed = SteamParse.parse(input);
    const s = SteamParse.summarise(parsed);
    const home = s.homeCurrency;
    const counts = {};
    for (const e of parsed.entries) counts[e.kind] = (counts[e.kind] || 0) + 1;

    let h = `<h2>Read as: ${esc(parsed.source || 'nothing')} · ${parsed.entries.length} rows · ${day(s.dateRange.first)} → ${day(s.dateRange.last)}</h2>`;
    h += `<p class="meta">${Object.entries(counts).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ')}</p>`;
    h += parsed.warnings.map(w => `<div class="warn">${esc(w.message)}</div>`).join('');
    if (s.refundsWithoutPurchase.length) h += `<div class="warn">Refunds with no matching purchase (older than the paste, or a naming mismatch): ${esc(s.refundsWithoutPurchase.join(', '))}</div>`;

    h += '<div class="stats">';
    const stat = (label, value) => { h += `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; };
    stat('Total spend (net of refunds)', bag(s.totals.net));
    stat('Of which in-game', bag(s.totals.inGame));
    stat('Refunded', bag(s.totals.refunds));
    stat('Gifts sent', `${s.gifts.count} · ${bag(s.gifts.spend)}`);
    stat('Market sold', `${s.market.sales} · ${bag(s.market.sold)}`);
    stat('Market bought', `${s.market.buys} · ${bag(s.market.bought)}`);
    stat('Biggest purchase', s.biggest ? `${s.biggest.game} · ${money(s.biggest.amount.value, s.biggest.amount.currency)}` : '–');
    stat('Games on sale / full price', `${s.sale.onSale} / ${s.sale.fullPrice}${s.sale.avgDiscount ? ` · avg -${s.sale.avgDiscount}%` : ''}`);
    h += '</div>';

    h += `<h2>Games (${s.games.length})</h2><div class="scroll"><table><tr><th>Game</th><th>Net</th><th>Buys</th><th>In-game</th><th>Refunds</th><th>Gifts</th><th>First</th><th>Last</th></tr>`;
    for (const g of s.games) {
      h += `<tr><td>${esc(g.name)}</td><td class="num">${esc(bag(g.net))}</td><td class="num">${g.purchases}</td><td class="num">${g.inGamePurchases}</td><td class="num">${g.refundCount}</td><td class="num">${g.gifts}</td><td>${day(g.first)}</td><td>${day(g.last)}</td></tr>`;
    }
    h += '</table></div>';
    if (s.refundedToZero.length) h += `<p class="meta">Refunded to $0: ${esc(s.refundedToZero.join(', '))}</p>`;

    h += `<h2>Every row</h2><div class="bar"><select id="kindFilter"><option value="">All kinds</option>${Object.keys(counts).map(k => `<option>${esc(k)}</option>`).join('')}</select></div>`;
    h += '<div class="scroll"><table id="rows"><tr><th>Kind</th><th>Date</th><th>Game / item</th><th>Type</th><th>Total cell</th><th>Change cell</th><th>Counted</th><th>Notes</th></tr>';
    for (const e of parsed.entries) {
      const what = e.game ? `${esc(e.game)}${e.item ? ` <span class="meta">· ${esc(e.item)}</span>` : ''}` : `<span class="meta">${esc(e.items.join(' · '))}</span>`;
      const counted = e.amount && e.kind !== 'skip' && e.kind !== 'unknown' ? `${money(e.amount.value, e.amount.currency)} <span class="meta">(${esc(e.amount.from)})</span>` : '';
      const notes = [e.reason, e.gift && 'gift', e.bundle && 'bundle', e.discountPct && `-${e.discountPct}%`, ...e.flags].filter(Boolean).join(' · ');
      h += `<tr class="k-${esc(e.kind)}" data-kind="${esc(e.kind)}"><td>${esc(e.kind)}</td><td>${day(e.date)}</td><td>${what}</td><td>${esc(e.typeText)}</td><td>${esc(e.totalText)}</td><td>${esc(e.changeText)}</td><td class="num">${counted}</td><td>${esc(notes)}</td></tr>`;
    }
    h += '</table></div>';

    $('out').innerHTML = h;
    $('kindFilter').addEventListener('change', ev => {
      for (const tr of $('rows').querySelectorAll('tr[data-kind]')) tr.hidden = !!ev.target.value && tr.dataset.kind !== ev.target.value;
    });
    if (home) document.title = `Parser Bench · ${bag(s.totals.net)}`;
  }
})();

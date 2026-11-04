# Steam Damage

Find out how much you've actually spent on Steam. Paste your purchase history from Steam and get your total, a breakdown by game, how much went on microtransactions, and a set of receipt-style cards to share.

Live at **https://steamdamage.com**

## Your history stays in your browser

Everything happens inside the page, on your own computer. Your history isn't uploaded, stored or sent anywhere, and there's no login.

You can check this yourself:

- Open the site, press F12, go to the **Network** tab, then paste your history. Nothing gets sent.
- Or load the page, turn off your Wi-Fi, and paste. It still works.
- Or read the code. What's in `src/` is exactly what the site runs: plain HTML, CSS and JavaScript, with no build step and no third-party scripts.

## How it works

- `src/parser.js` reads the pasted table (the clipboard's HTML, or plain text) and adds it up per game.
- `src/cards.js` draws the cards on a canvas in your browser. Saving a card saves that image.
- `src/rates.js` holds yearly-average exchange rates from the European Central Bank (via frankfurter.dev), with World Bank yearly averages and [fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api) for currencies the ECB doesn't publish. They're bundled into the site, so the page never fetches them.
- `src/app.js` connects the page: paste, check screen, cards.

## Running it yourself

Open `src/index.html` in a browser. Nothing to install.

Tests: `npm test` (Node 18 or newer).

## Licence

[GNU AGPL-3.0](LICENSE). You're free to read, use and change the code. If you share a changed version, including running it as a website, you have to publish your source under the same licence.

## Not affiliated with Valve

Steam Damage is a fan-made site. It isn't affiliated with, endorsed by or connected to Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.

## Support

The site is free, has no ads and runs on donations. If it made you laugh: [ko-fi.com/tylrae](https://ko-fi.com/tylrae)

Parking note: Dataroma → TradingView exchange scrape
====================================================

We temporarily removed the TradingView exchange enrichment because TradingView is issuing CAPTCHA challenges to automated requests, leaving `exchange` empty in practice. The removed flow was:

- After scraping the Dataroma portfolio table, follow each `<td class="sym"><a href="/m/stock.php?sym=SYM">` link.
- On the stock page, find the TradingView link (e.g. `https://www.tradingview.com/symbols/SYM/`).
- Fetch that TradingView page and extract `<span class="provider-...">Exchange Name</span>`.
- Insert 100–200ms delays between each fetch and throttle concurrency.

Key helpers that were removed from `dataromaScraper.ts`:

- `extractDetailPath`, `extractTradingViewUrl`, `extractExchange`, `resolveUrl`
- `fetchExchange`, `enrichExchanges` (with concurrency)
- `EXCHANGE_CONCURRENCY`/`humanDelay` based throttling around those calls

If we need to resurrect this, reintroduce those helpers and pipe their output back into `DataromaEntry.exchange`, ideally allowing an opt-in cookie/header to survive CAPTCHAs or using a provider-based fallback for exchanges.

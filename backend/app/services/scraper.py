import asyncio
import random
import re
from typing import List, Optional
from bs4 import BeautifulSoup
import httpx

from app.models.domain import (
    DataromaEntry,
    ScrapeOptions,
    ScrapeResult,
    CachedPayload,
    CacheDescriptor,
)
from app.services.store import FileCacheStore

DATAROMA_PROVIDER_ID = "dataroma"
DEFAULT_URL = "https://www.dataroma.com/m/g/portfolio.php"

class DataromaScraperService:
    def __init__(self, cache_store: FileCacheStore, base_url: str = DEFAULT_URL):
        self.cache = cache_store
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    async def scrape_grand_portfolio(self, opts: ScrapeOptions) -> ScrapeResult:
        normalized_opts = self._normalize_options(opts)
        descriptor = self._create_descriptor(normalized_opts)

        if normalized_opts.use_cache:
            cached = await self.cache.read(descriptor, List[DataromaEntry])
            if cached:
                entries = self._deduplicate_entries(cached.payload)
                # If dedup changed anything, we might want to update cache, but for now just return
                # TS version updates payload in object but doesn't write back unless persist called?
                # Actually TS version says: entries === cached.payload ? cached : { ...cached, payload: entries }
                return ScrapeResult(
                    entries=entries,
                    source="cache",
                    cached_payload=cached
                )

        raw_entries = await self._fetch_all_pages(normalized_opts)
        entries = self._deduplicate_entries(raw_entries)
        
        cached_payload = None
        if entries:
            cached_payload = await self.cache.write(descriptor, entries)

        return ScrapeResult(
            entries=entries,
            source="live",
            cached_payload=cached_payload
        )

    def _normalize_options(self, opts: ScrapeOptions) -> ScrapeOptions:
        if opts.max_entries is not None and opts.max_entries <= 0:
            opts.max_entries = None
        return opts

    def _create_descriptor(self, opts: ScrapeOptions) -> CacheDescriptor:
        cache_key = opts.cache_token or self._build_cache_key(opts)
        return CacheDescriptor(
            scope="scrape",
            provider=DATAROMA_PROVIDER_ID,
            key=cache_key
        )

    def _build_cache_key(self, opts: ScrapeOptions) -> str:
        min_pct = opts.min_percent if opts.min_percent is not None else 0
        max_entries = opts.max_entries if opts.max_entries is not None else "all"
        return f"grand-portfolio_v2_{min_pct}_max-{max_entries}"

    def _build_params(self, opts: ScrapeOptions, page: Optional[int] = None) -> dict:
        params = {}
        if opts.min_percent is not None and opts.min_percent > 0:
            params["pct"] = opts.min_percent
        if page and page > 1:
            params["L"] = page
        return params

    async def _fetch_all_pages(self, opts: ScrapeOptions) -> List[DataromaEntry]:
        first_html = await self._get_text_with_delay(params=self._build_params(opts))
        first_entries, total_pages = self._parse_page(first_html)
        
        all_entries = list(first_entries) # copy

        if opts.max_entries and len(all_entries) >= opts.max_entries:
            return all_entries[:opts.max_entries]

        for page in range(2, total_pages + 1):
            html = await self._get_text_with_delay(params=self._build_params(opts, page))
            entries, _ = self._parse_page(html)
            all_entries.extend(entries)

            if opts.max_entries and len(all_entries) >= opts.max_entries:
                return all_entries[:opts.max_entries]

        return all_entries

    async def _get_text_with_delay(self, params: dict) -> str:
        await self._human_delay()
        response = await self.client.get(self.base_url, params=params)
        response.raise_for_status()
        return response.text

    async def _human_delay(self):
        # 100ms or 200ms
        delay = 0.1 if random.random() < 0.5 else 0.2
        await asyncio.sleep(delay)

    def _parse_page(self, html: str) -> (List[DataromaEntry], int):
        soup = BeautifulSoup(html, "html.parser")
        
        entries = []
        # Find the table. Assuming there's a main table.
        # TS uses regex on <tbody>. BS4 is robust.
        # We need to find the specific table. Usually looking for class="tbl" or similar in dataroma?
        # Let's try to match the TS logic: looks for 'sym' and 'stock' classes in cells.
        
        rows = soup.find_all("tr")
        for row in rows:
            sym_cell = row.find("td", class_="sym")
            stock_cell = row.find("td", class_="stock")
            
            if sym_cell and stock_cell:
                symbol = sym_cell.get_text(strip=True)
                stock = stock_cell.get_text(strip=True)
                if symbol and stock:
                    entries.append(DataromaEntry(
                        symbol=self._clean_symbol(symbol),
                        stock=stock,
                        exchange=None
                    ))

        # Total pages
        total_pages = 1
        pages_div = soup.find("div", id="pages")
        if pages_div:
            # Look for links with L=...
            links = pages_div.find_all("a", href=True)
            for link in links:
                match = re.search(r"L=(\d+)", link["href"])
                if match:
                    total_pages = max(total_pages, int(match.group(1)))
        
        return entries, total_pages

    def _clean_symbol(self, value: str) -> str:
        return re.sub(r"\s+", "", value).upper()

    def _deduplicate_entries(self, entries: List[DataromaEntry]) -> List[DataromaEntry]:
        seen = set()
        deduped = []
        for entry in entries:
            key = f"{entry.symbol.upper()}::{entry.stock.upper()}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append(entry)
        return deduped

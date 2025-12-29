import httpx
from datetime import datetime
from typing import List, Optional

from app.models.domain import (
    CacheDescriptor,
    CachedPayload,
    ExchangeSummary,
    SymbolRecord,
    FundamentalsSnapshot,
    ProviderKey,
)
from app.services.store import FileCacheStore

PROVIDER_ID = "eodhd"
DEFAULT_BASE_URL = "https://eodhd.com/api"

class EodhdProvider:
    def __init__(self, api_token: str, cache_store: FileCacheStore, base_url: str = DEFAULT_BASE_URL):
        self.api_token = api_token
        self.cache = cache_store
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
        self.exchange_ttl_ms = 1000 * 60 * 60 * 24 * 7  # 7 days
        self.symbol_ttl_ms = 1000 * 60 * 60 * 24 * 1    # 1 day

    async def close(self):
        await self.client.aclose()

    async def get_exchanges(self, use_cache: bool = True) -> CachedPayload[List[ExchangeSummary]]:
        descriptor = self._create_descriptor("exchange-list", "all", self.exchange_ttl_ms)
        
        if use_cache:
            cached = await self.cache.read(descriptor, List[ExchangeSummary])
            if cached:
                return cached

        params = self._auth_params()
        response = await self.client.get(f"{self.base_url}/exchanges-list", params=params)
        response.raise_for_status()
        raw_data = response.json()

        normalized_exchanges = [self._normalize_exchange(r) for r in raw_data]
        return await self.cache.write(descriptor, normalized_exchanges)

    async def get_symbols(self, exchange_code: str, use_cache: bool = True, common_stock: bool = False) -> CachedPayload[List[SymbolRecord]]:
        normalized_code = exchange_code.strip().upper()
        cache_key = f"{normalized_code}_common" if common_stock else normalized_code
        descriptor = self._create_descriptor("exchange-symbols", cache_key, self.symbol_ttl_ms)

        if use_cache:
            cached = await self.cache.read(descriptor, List[SymbolRecord])
            if cached:
                return cached

        params = self._auth_params()
        if common_stock:
            params["type"] = "common_stock"

        response = await self.client.get(f"{self.base_url}/exchange-symbol-list/{normalized_code}", params=params)
        response.raise_for_status()
        raw_data = response.json()

        normalized_symbols = [self._normalize_symbol(r) for r in raw_data]
        return await self.cache.write(descriptor, normalized_symbols)
    
    # getFundamentals is defined in TS but not used in the main scraping flow?
    # Ah, it's used if we want to get details for screener.
    # The TS orchestrator doesn't seem to use it for the matching/universe steps.
    # But let's implement it for completeness.
    async def get_fundamentals(self, stock_code: str, exchange_code: str) -> FundamentalsSnapshot:
        symbol = stock_code.strip().upper()
        exchange = exchange_code.strip().upper()
        
        params = self._auth_params()
        response = await self.client.get(f"{self.base_url}/fundamentals/{symbol}.{exchange}", params=params)
        response.raise_for_status()
        data = response.json()

        return self._map_fundamentals(symbol, exchange, data)

    def _auth_params(self):
        return {"api_token": self.api_token, "fmt": "json"}

    def _create_descriptor(self, scope: str, key: str, ttl_ms: Optional[int] = None) -> CacheDescriptor:
        expires_at = None
        if ttl_ms:
            expires_at = datetime.fromtimestamp(datetime.now().timestamp() + ttl_ms / 1000.0)
            
        return CacheDescriptor(
            scope=scope,
            provider=PROVIDER_ID,
            key=key,
            expiresAt=expires_at
        )

    def _normalize_exchange(self, record: dict) -> ExchangeSummary:
        return ExchangeSummary(
            code=record.get("Code", ""),
            name=record.get("Name", ""),
            country=record.get("Country", "") or "",
            currency=record.get("Currency", "") or "",
            operatingMic=record.get("OperatingMIC", "") or ""
        )

    def _normalize_symbol(self, record: dict) -> SymbolRecord:
        return SymbolRecord(
            code=record.get("Code", ""),
            name=record.get("Name", ""),
            exchange=record.get("Exchange", ""),
            country=record.get("Country", "") or "",
            currency=record.get("Currency", "") or "",
            isin=record.get("Isin") or None,
            type=record.get("Type", "")
        )

    def _map_fundamentals(self, stock_code: str, exchange_code: str, response: dict) -> FundamentalsSnapshot:
        general = response.get("General", {})
        highlights = response.get("Highlights", {})
        financials = response.get("Financials", {})
        
        # Helper to safely get float
        def to_float(val):
            if val is None: return None
            try:
                f = float(val)
                return f if f == f else None # check nan
            except (ValueError, TypeError):
                return None

        trailing_pe = to_float(highlights.get("PERatioTTM"))
        forward_pe = to_float(highlights.get("ForwardPE"))
        div_yield = to_float(highlights.get("ForwardAnnualDividendYield")) or to_float(highlights.get("DividendYield"))
        
        # Calculate FCF margin... keeping it simple for now as it involves picking latest from maps
        # duplicating complex logic from TS just for completeness
        
        return FundamentalsSnapshot(
            stockCode=stock_code,
            exchangeCode=exchange_code,
            name=general.get("Name") or general.get("Code") or stock_code,
            trailingPE=trailing_pe,
            forwardPE=forward_pe,
            forwardDividendYield=div_yield,
            freeCashFlowMargin=None, # Todo implement if needed
            asOf=datetime.now(),
            raw=response
        )

from datetime import datetime
from typing import List, Optional, Any, Dict, TypeVar, Generic, Union
from pydantic import BaseModel, Field

T = TypeVar('T')

class ProviderKey(BaseModel):
    provider: str
    api_key: str = Field(alias='apiKey')
    updated_at: datetime = Field(alias='updatedAt')

class CachePreferences(BaseModel):
    dataroma_scrape: bool = Field(alias='dataromaScrape')
    stock_universe: bool = Field(alias='stockUniverse')
    
    class Config:
        populate_by_name = True
        extra = "allow"

class AppSettingsPreferences(BaseModel):
    default_provider: str = Field(alias='defaultProvider')
    cache: CachePreferences

class AppSettings(BaseModel):
    provider_keys: List[ProviderKey] = Field(alias='providerKeys')
    preferences: AppSettingsPreferences

class DataromaEntry(BaseModel):
    symbol: str
    stock: str
    exchange: Optional[str] = None

class CacheDescriptor(BaseModel):
    scope: str
    provider: str
    key: str
    expires_at: Optional[datetime] = Field(None, alias='expiresAt')

class CachedPayload(BaseModel, Generic[T]):
    descriptor: CacheDescriptor
    payload: T
    created_at: datetime = Field(alias='createdAt')

class ScrapeOptions(BaseModel):
    use_cache: bool = Field(alias='useCache')
    cache_token: Optional[str] = Field(None, alias='cacheToken')
    min_percent: Optional[float] = Field(None, alias='minPercent')
    max_entries: Optional[int] = Field(None, alias='maxEntries')

class ScrapeResult(BaseModel):
    entries: List[DataromaEntry]
    source: str  # 'live' | 'cache'
    cached_payload: Optional[CachedPayload[List[DataromaEntry]]] = Field(None, alias='cachedPayload')

class ExchangeSummary(BaseModel):
    code: str
    name: str
    country: str
    currency: str
    operating_mic: str = Field(alias='operatingMic')

class SymbolRecord(BaseModel):
    code: str
    name: str
    exchange: str
    country: str
    currency: str
    isin: Optional[str] = None
    type: Optional[str] = None

class FundamentalsSnapshot(BaseModel):
    stock_code: str = Field(alias='stockCode')
    exchange_code: str = Field(alias='exchangeCode')
    name: str
    trailing_pe: Optional[float] = Field(None, alias='trailingPE')
    forward_pe: Optional[float] = Field(None, alias='forwardPE')
    forward_dividend_yield: Optional[float] = Field(None, alias='forwardDividendYield')
    free_cash_flow_margin: Optional[float] = Field(None, alias='freeCashFlowMargin')
    as_of: datetime = Field(alias='asOf')
    raw: Dict[str, Any]

class MatchCandidate(BaseModel):
    dataroma_symbol: str = Field(alias='dataromaSymbol')
    dataroma_name: str = Field(alias='dataromaName')
    provider_symbol: Optional[SymbolRecord] = Field(None, alias='providerSymbol')
    confidence: float
    reasons: List[str]
    not_available: Optional[bool] = Field(None, alias='notAvailable')

class DataromaScreenerStepState(BaseModel):
    step: str # 'scrape' | 'universe' | 'match' | 'validate' | 'screener'
    status: str # 'idle' | 'running' | 'blocked' | 'complete'
    context: Optional[Dict[str, Any]] = None

class ProviderUniverse(BaseModel):
    exchanges: CachedPayload[List[ExchangeSummary]]
    symbols: Dict[str, CachedPayload[List[SymbolRecord]]]

class DataromaScreenerSession(BaseModel):
    id: str
    created_at: datetime = Field(alias='createdAt')
    steps: List[DataromaScreenerStepState]
    dataroma: Optional[ScrapeResult] = None
    provider_universe: Optional[ProviderUniverse] = Field(None, alias='providerUniverse')
    matches: Optional[List[MatchCandidate]] = None
    screener_rows: Optional[List[FundamentalsSnapshot]] = Field(None, alias='screenerRows')

    class Config:
        populate_by_name = True

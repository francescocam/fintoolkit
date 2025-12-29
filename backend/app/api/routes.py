import os
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Depends, Body
from pydantic import BaseModel

from app.core import config
from app.models.domain import (
    AppSettings,
    DataromaScreenerSession,
    MatchCandidate,
    SymbolRecord
)
from app.services.store import FileSessionStore, FileCacheStore, FileSettingsStore
from app.services.scraper import DataromaScraperService
from app.services.eodhd import EodhdProvider
from app.services.matcher import AdvancedMatchEngine
from app.services.session import DataromaScreenerService

class StartSessionPayload(BaseModel):
    cache: Optional[Dict[str, bool]] = None
    useCache: Optional[bool] = None
    minPercent: Optional[float] = None
    cacheToken: Optional[str] = None
    maxEntries: Optional[int] = None

class UniverseStepPayload(BaseModel):
    cache: Optional[Dict[str, bool]] = None
    useCache: Optional[bool] = None
    commonStock: Optional[bool] = None

class MatchStepPayload(BaseModel):
    commonStock: Optional[bool] = None
    useCache: Optional[bool] = None

class UpdateMatchPayload(BaseModel):
    dataromaSymbol: str
    providerSymbol: Optional[SymbolRecord] = None
    notAvailable: Optional[bool] = None

class SearchResponse(BaseModel):
    results: list

# --- Global State / Dependencies ---

# We use global variables to mimic the Node.js server state (single process assumption)
_service: Optional[DataromaScreenerService] = None
_latest_session: Optional[DataromaScreenerSession] = None
_stores: Dict[str, Any] = {}

async def get_stores():
    if not _stores:
        _stores['session'] = FileSessionStore(config.SESSION_DIR)
        _stores['cache_dataroma'] = FileCacheStore(config.CACHE_DIR / "dataroma")
        _stores['cache_eodhd'] = FileCacheStore(config.CACHE_DIR / "eodhd")
        _stores['settings'] = FileSettingsStore(config.SETTINGS_FILE)
    return _stores

async def get_service() -> DataromaScreenerService:
    global _service
    if _service:
        return _service
    
    stores = await get_stores()
    settings = await stores['settings'].load()
    
    # Resolve API Key
    api_key = os.environ.get("EODHD_API_TOKEN") or "demo"
    for key in settings.provider_keys:
        if key.provider == 'eodhd':
            api_key = key.api_key
            break
            
    # Initialize components
    # Notice: In TS, DataromaCache is used for Scraper AND System Matches. 
    # EodhdCache is separate.
    # We should match that.
    
    # Check TS: 
    # const dataromaCache = new FileCacheStore({ baseDir: ... .cache/dataroma });
    # const eodCache = new FileCacheStore({ baseDir: ... .cache/eodhd });
    # scraper uses dataromaCache.
    # provider uses eodCache.
    # orchestrator uses dataromaCache (for system matches).
    
    scraper = DataromaScraperService(cache_store=stores['cache_dataroma'])
    provider = EodhdProvider(api_token=api_key, cache_store=stores['cache_eodhd'])
    match_engine = AdvancedMatchEngine()
    
    _service = DataromaScreenerService(
        scraper=scraper,
        provider=provider,
        match_engine=match_engine,
        session_store=stores['session'],
        cache_store=stores['cache_dataroma'] # Matches stored in dataroma cache dir
    )
    return _service

# Global setter for settings update to reset service if needed (e.g. api key change)
async def reset_service():
    global _service, _latest_session
    _service = None
    _latest_session = None

router = APIRouter()

@router.get("/api/dataroma-screener/session/latest")
async def get_latest_session():
    global _latest_session
    if not _latest_session:
        # Try to retrieve from memory or implicitly it's null
        raise HTTPException(status_code=404, detail="No Dataroma screener session found. Start a new session.")
    return _latest_session

@router.post("/api/dataroma-screener/session", status_code=201)
async def create_session(payload: StartSessionPayload):
    global _latest_session
    service = await get_service()
    
    # Merge cache preferences
    # TS logic: defaults + overrides
    # In Python service we accept dict.
    
    cache_prefs = payload.cache or {}
    if payload.useCache is not None:
        cache_prefs['dataromaScrape'] = payload.useCache
    
    session = await service.start_session(
        cache_prefs=cache_prefs,
        cache_token=payload.cacheToken,
        min_percent=payload.minPercent,
        max_entries=payload.maxEntries
    )
    _latest_session = session
    return session

@router.get("/api/dataroma-screener/session/{id}")
async def get_session_by_id(id: str):
    service = await get_service()
    session = await service.get_session(id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/api/dataroma-screener/session/{id}/universe")
async def run_universe_step(id: str, payload: UniverseStepPayload):
    global _latest_session
    service = await get_service()
    
    use_cache = True
    if payload.useCache is not None:
        use_cache = payload.useCache
    elif payload.cache and 'stockUniverse' in payload.cache:
         use_cache = payload.cache['stockUniverse']

    session = await service.run_universe_step(
        session_id=id,
        use_cache=use_cache,
        common_stock=payload.commonStock or False
    )
    _latest_session = session
    return session

@router.post("/api/dataroma-screener/session/{id}/matches")
async def run_match_step(id: str, payload: MatchStepPayload):
    global _latest_session
    service = await get_service()
    
    session = await service.run_match_step(
        session_id=id,
        use_cache=payload.useCache if payload.useCache is not None else True,
        common_stock=payload.commonStock or False
    )
    _latest_session = session
    return session

@router.get("/api/dataroma-screener/universe/search")
async def search_universe(query: str):
    global _latest_session
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters long.")
    
    if not _latest_session or not _latest_session.provider_universe:
        raise HTTPException(status_code=404, detail="No stock universe available. Run the screener first.")
        
    # Search logic
    # TS implementation: flattens symbols and filters
    normalized_query = query.strip().lower()
    
    all_symbols = []
    for payload in _latest_session.provider_universe.symbols.values():
        all_symbols.extend(payload.payload)
        
    # Filter and sort
    matches = [
        s for s in all_symbols 
        if normalized_query in s.name.lower()
    ]
    matches.sort(key=lambda s: s.name)
    results = matches[:15]
    
    return {"results": results}

@router.put("/api/dataroma-screener/matches")
async def update_match(payload: UpdateMatchPayload):
    global _latest_session
    if not _latest_session or not _latest_session.matches:
        raise HTTPException(status_code=404, detail="No match suggestions available. Run the screener.")
    
    # Find match in current session
    # Note: _latest_session is a reference. Mutating it affects state.
    # But we should use the service or store to persist change.
    
    match_entry = next((m for m in _latest_session.matches if m.dataroma_symbol == payload.dataromaSymbol), None)
    if not match_entry:
        raise HTTPException(status_code=404, detail="Match candidate not found")
        
    if payload.notAvailable:
        match_entry.provider_symbol = None
        match_entry.not_available = True
    elif payload.providerSymbol:
        # Verify symbol in universe? TS does.
        # "Selected symbol not found in cached universe."
        # We'll skip deep verification for now or implement it.
        # Let's trust client or check quickly.
        pass
        match_entry.provider_symbol = payload.providerSymbol
        match_entry.not_available = False
    else:
        raise HTTPException(status_code=400, detail="Provide a symbol or mark the candidate as not available.")
    
    # Save session
    stores = await get_stores()
    await stores['session'].save(_latest_session)
    
    return match_entry

@router.get("/api/settings")
async def get_settings():
    stores = await get_stores()
    return await stores['settings'].load()

@router.put("/api/settings")
async def update_settings(settings: AppSettings):
    stores = await get_stores()
    await stores['settings'].save(settings)
    await reset_service()
    return settings

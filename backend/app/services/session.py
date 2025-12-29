import asyncio
import uuid
from datetime import datetime
from typing import Optional, List, Dict

from app.models.domain import (
    DataromaScreenerSession,
    DataromaScreenerStepState,
    ScrapeOptions,
    ScrapeResult,
    ProviderUniverse,
    CachedPayload,
    SymbolRecord,
    MatchCandidate,
    CacheDescriptor
)
from app.services.scraper import DataromaScraperService
from app.services.eodhd import EodhdProvider
from app.services.matcher import AdvancedMatchEngine
from app.services.store import FileSessionStore, FileCacheStore

class DataromaScreenerService:
    def __init__(
        self,
        scraper: DataromaScraperService,
        provider: EodhdProvider,
        match_engine: AdvancedMatchEngine,
        session_store: FileSessionStore,
        cache_store: FileCacheStore
    ):
        self.scraper = scraper
        self.provider = provider
        self.match_engine = match_engine
        self.session_store = session_store
        self.cache = cache_store
        self.max_symbol_exchanges = None # Unlimited

    async def start_session(self, cache_prefs: dict = None, cache_token: str = None, min_percent: float = None, max_entries: int = None) -> DataromaScreenerSession:
        session_id = str(uuid.uuid4())
        session = DataromaScreenerSession(
            id=session_id,
            createdAt=datetime.now(),
            steps=[]
        )
        cache_prefs = cache_prefs or {}
        scrape_opts = ScrapeOptions(
            useCache=cache_prefs.get('dataromaScrape', True),
            cacheToken=cache_token,
            minPercent=min_percent,
            maxEntries=max_entries
        )

        scrape_step = self._create_step_state('scrape', 'running', {'minPercent': min_percent or 0})
        session.steps.append(scrape_step)
        await self.session_store.save(session)

        try:
            result = await self.scraper.scrape_grand_portfolio(scrape_opts)
            session.dataroma = result
            self._update_step_state(scrape_step, 'complete', {
                'source': result.source,
                'entryCount': len(result.entries)
            })
            await self.session_store.save(session)
        except Exception as e:
            self._update_step_state(scrape_step, 'blocked', {'error': str(e)})
            await self.session_store.save(session)
            raise e

        return session

    async def run_universe_step(self, session_id: str, use_cache: bool = True, common_stock: bool = False) -> DataromaScreenerSession:
        session = await self._load_session_or_throw(session_id)
        if not session.dataroma:
            raise ValueError("Dataroma scrape not completed.")

        step = self._get_or_create_step_state(session, 'universe')
        await self.session_store.save(session)

        try:
            universe = await self._build_universe(use_cache, common_stock)
            session.provider_universe = universe
            self._update_step_state(step, 'complete', {
                'exchanges': len(universe.exchanges.payload),
                'symbolBatches': len(universe.symbols)
            })
            await self.session_store.save(session)
        except Exception as e:
            self._update_step_state(step, 'blocked', {'error': str(e)})
            await self.session_store.save(session)
            raise e

        return session

    async def run_match_step(self, session_id: str, use_cache: bool = True, common_stock: bool = False) -> DataromaScreenerSession:
        session = await self._load_session_or_throw(session_id)
        if not session.dataroma:
            raise ValueError("Dataroma scrape not completed.")
        if not session.provider_universe:
            raise ValueError("Provider universe not available.")

        step = self._get_or_create_step_state(session, 'match')
        await self.session_store.save(session)

        try:
            matches = await self._generate_matches(session, use_cache, common_stock)
            session.matches = matches
            self._update_step_state(step, 'complete', {'matches': len(matches)})
            await self.session_store.save(session)
        except Exception as e:
            self._update_step_state(step, 'blocked', {'error': str(e)})
            await self.session_store.save(session)
            raise e

        return session

    async def get_session(self, session_id: str) -> Optional[DataromaScreenerSession]:
        return await self.session_store.load(session_id)

    async def _load_session_or_throw(self, session_id: str) -> DataromaScreenerSession:
        session = await self.session_store.load(session_id)
        if not session:
            raise ValueError("Session not found")
        return session

    def _create_step_state(self, step: str, status: str, context: dict = None) -> DataromaScreenerStepState:
        return DataromaScreenerStepState(step=step, status=status, context=context)

    def _get_or_create_step_state(self, session: DataromaScreenerSession, step_name: str) -> DataromaScreenerStepState:
        for s in session.steps:
            if s.step == step_name:
                s.status = 'running'
                s.context = None
                return s
        new_step = self._create_step_state(step_name, 'running')
        session.steps.append(new_step)
        return new_step

    def _update_step_state(self, step: DataromaScreenerStepState, status: str, context: dict = None):
        step.status = status
        step.context = context

    async def _build_universe(self, use_cache: bool, common_stock: bool) -> ProviderUniverse:
        exchanges = await self.provider.get_exchanges(use_cache)
        symbols_map: Dict[str, CachedPayload[List[SymbolRecord]]] = {}
        
        # Limit if configured
        selected_exchanges = exchanges.payload
        if self.max_symbol_exchanges:
            selected_exchanges = selected_exchanges[:self.max_symbol_exchanges]

        # Fetch symbols for each exchange
        # We can run this concurrently
        async def fetch_sym(exch):
            return exch.code, await self.provider.get_symbols(exch.code, use_cache, common_stock)

        tasks = [fetch_sym(exch) for exch in selected_exchanges]
        results = await asyncio.gather(*tasks)
        
        for code, payload in results:
            symbols_map[code] = payload

        return ProviderUniverse(exchanges=exchanges, symbols=symbols_map)

    async def _generate_matches(self, session: DataromaScreenerSession, use_cache: bool, common_stock: bool) -> List[MatchCandidate]:
        dataroma_entries = session.dataroma.entries
        universe = session.provider_universe
        
        # Check cache
        cache_key = f"matches-{len(dataroma_entries)}-{len(universe.symbols)}-{'common' if common_stock else 'all'}"
        descriptor = CacheDescriptor(scope="matches", provider="system", key=cache_key)
        
        if use_cache:
            cached = await self.cache.read(descriptor, List[MatchCandidate])
            if cached:
                return cached.payload

        all_matches: List[MatchCandidate] = []
        unmatched_entries = list(dataroma_entries) # copy

        # Run per exchange
        # We need to run match_engine (CPU bound) in thread pool.
        loop = asyncio.get_running_loop()
        
        tasks = []
        for exchange_code, payload in universe.symbols.items():
            provider_symbols = payload.payload
            if common_stock:
                provider_symbols = [s for s in provider_symbols if s.type == 'Common Stock']
            
            if not provider_symbols:
                continue

            # We pass ONLY unmatched entries to reduce work? 
            # TS passes unmatchedDataromaEntries which is mutated?
            # No, TS creates worker with copy of unmatched entries.
            # But the results are collected and flattened.
            # Actually TS logic: `unmatchedDataromaEntries` is updated AFTER all workers return?
            # Wait, TS `Promise.all(workerPromises)` -> they all run in parallel with the SAME INITIAL unmatched list.
            # Then it aggregates.
            # AND THEN filters duplicates or picks best?
            # TS: `matches = results.flat()`. `newMatches = matches.filter(match => match.providerSymbol)`.
            # `allMatches.push(...newMatches)`.
            # Then it calculates remaining unmatched.
            # Basically, if multiple exchanges find a match for the same symbol, we get duplicates.
            # TS implementation doesn't seem to deduplicate multiple matches for same Dataroma symbol if found in different exchanges?
            # Actually `matchedDataromaSymbols` set is used to filter `unmatchedDataromaEntries`. Only those that NEVER found a match are added as "No match found".
            # But if a symbol is matched in Exchange A and Exchange B, both are added to `allMatches`.
            # That seems to be the behavior.
            
            task = loop.run_in_executor(
                None, 
                self.match_engine.generate_candidates, 
                dataroma_entries, # TS passes all unmatched, which initially is all. Parallel execution means all workers see all entries.
                provider_symbols
            )
            tasks.append(task)

        results = await asyncio.gather(*tasks)
        
        # Aggregate
        flat_results = [item for sublist in results for item in sublist]
        
        # Filter successful matches
        successful_matches = [m for m in flat_results if m.provider_symbol]
        all_matches.extend(successful_matches)
        
        matched_symbols = set(m.dataroma_symbol for m in successful_matches)
        
        # Determine totally unmatched
        for entry in dataroma_entries:
            if entry.symbol not in matched_symbols:
                all_matches.append(MatchCandidate(
                    dataromaSymbol=entry.symbol,
                    dataromaName=entry.stock,
                    providerSymbol=None,
                    confidence=0.0,
                    reasons=['No match found across all exchanges'],
                    notAvailable=True
                ))

        # Write to cache
        await self.cache.write(descriptor, all_matches)

        return all_matches

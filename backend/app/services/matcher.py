import re
from typing import List, Optional, Dict, Tuple
from rapidfuzz import process, fuzz

from app.models.domain import MatchCandidate, DataromaEntry, SymbolRecord

class AdvancedMatchEngine:
    def generate_candidates(self, dataroma_list: List[DataromaEntry], provider_symbols: List[SymbolRecord]) -> List[MatchCandidate]:
        # 1. Build Maps
        symbol_map: Dict[str, Dict[str, SymbolRecord]] = {} # Exchange -> Code -> Symbol
        name_map: Dict[str, List[SymbolRecord]] = {} # NormalizedName -> Symbols

        valid_symbols = [s for s in provider_symbols if s.code and s.name]

        for sym in valid_symbols:
            # Symbol Map
            if sym.exchange not in symbol_map:
                symbol_map[sym.exchange] = {}
            symbol_map[sym.exchange][sym.code] = sym

            # Name Map
            norm_name = self._normalize_name(sym.name)
            if norm_name not in name_map:
                name_map[norm_name] = []
            name_map[norm_name].append(sym)

        candidates: List[MatchCandidate] = []
        
        # Prepare list for fuzzy search if needed (optimization: only names)
        # However, RapidFuzz process.extract is efficient enough if we pass a dict or list of choices.
        # But we need to map back to SymbolRecord.
        # Let's simple check first.

        for entry in dataroma_list:
            target_exchange = self._get_eodhd_exchange_code(entry.symbol)
            clean_symbol = self._strip_suffix(entry.symbol)

            matched_symbol: Optional[SymbolRecord] = None
            confidence = 0.0
            reasons = []
            match_type = 'unmatched'

            # Strategy 1: Direct Symbol Match
            if target_exchange in symbol_map:
                exchange_symbols = symbol_map[target_exchange]
                
                # Exact match
                if clean_symbol in exchange_symbols:
                    matched_symbol = exchange_symbols[clean_symbol]
                    match_type = 'symbol'
                    confidence = 1.0
                    reasons.append('Direct symbol match')
                # Dot to Hyphen (US)
                elif target_exchange == 'US' and '.' in entry.symbol:
                    hyphenated = entry.symbol.replace('.', '-')
                    if hyphenated in exchange_symbols:
                        matched_symbol = exchange_symbols[hyphenated]
                        match_type = 'symbol'
                        confidence = 1.0
                        reasons.append('Symbol match with dot-to-hyphen conversion')

            # Strategy 2: Name Match (Exact Normalized)
            if match_type == 'unmatched':
                norm_name = self._normalize_name(entry.stock)
                if norm_name in name_map:
                    matches = name_map[norm_name]
                    # Pick best from target exchange if possible
                    best = next((s for s in matches if s.exchange == target_exchange), matches[0])
                    matched_symbol = best
                    match_type = 'name'
                    confidence = 0.9
                    reasons.append('Exact normalized name match')

            # Strategy 3: Fuzzy Name Match
            if match_type == 'unmatched':
                # RapidFuzz search
                # We search against ALL provider symbols? That's expensive (100k+ symbols).
                # But current Fuse implementation does exactly that: `new Fuse(providerSymbols, ...)`
                # We can try to limit scope or just run it. 
                # Let's hope performance is okay. RapidFuzz is fast.
                
                # To speed up, maybe filter by exchange first if possible?
                # But maybe the exchange guess is wrong.
                
                # The TS implementation uses Fuse on *all* symbols.
                
                # Optimization: normalized names dict keys?
                choices = list(name_map.keys())
                result = process.extractOne(
                    self._normalize_name(entry.stock),
                    choices,
                    scorer=fuzz.token_sort_ratio,
                    score_cutoff=85
                )
                
                if result:
                    match_name, score, _ = result
                    # match_name is the normalized name from name_map
                    # score is 0-100
                    
                    # Convert score to 0-1 confidence (Fuse 0.15 score dist => 85 similarity)
                    # Let's say if score > 85
                    
                    if score >= 85:
                        potential_symbols = name_map[match_name]
                        # Prefer target exchange
                        best = next((s for s in potential_symbols if s.exchange == target_exchange), potential_symbols[0])
                        
                        matched_symbol = best
                        match_type = 'fuzzy'
                        confidence = score / 100.0
                        reasons.append(f"Fuzzy name match (score: {score})")

            # Special messages
            if match_type == 'unmatched':
                if target_exchange in ['HK', 'T', 'KO'] and target_exchange not in symbol_map:
                    reasons.append(f"Exchange {target_exchange} data not available in EODHD files.")
                else:
                    reasons.append('No match found')

            candidates.append(MatchCandidate(
                dataromaSymbol=entry.symbol,
                dataromaName=entry.stock,
                providerSymbol=matched_symbol,
                confidence=confidence,
                reasons=reasons,
                notAvailable=(match_type == 'unmatched')
            ))

        return candidates

    def confirm_match(self, candidate: MatchCandidate, symbol: Optional[SymbolRecord] = None) -> MatchCandidate:
        candidate_copy = candidate.model_copy()
        if symbol:
            candidate_copy.provider_symbol = symbol
            candidate_copy.confidence = 1.0
            candidate_copy.reasons = ['Manually confirmed']
            candidate_copy.not_available = False
        else:
            candidate_copy.provider_symbol = None
            candidate_copy.not_available = True
            candidate_copy.confidence = 1.0
            candidate_copy.reasons = ['Manually marked as not available']
        return candidate_copy

    def _normalize_name(self, name: str) -> str:
        if not name:
            return ""
        name = name.lower()
        name = name.replace('.', '')
        name = name.replace(',', '')
        name = re.sub(r'\s+inc\b', '', name)
        name = re.sub(r'\s+corp\b', '', name)
        name = re.sub(r'\s+ltd\b', '', name)
        name = re.sub(r'\s+plc\b', '', name)
        name = re.sub(r'\s+co\b', '', name)
        name = re.sub(r'\s+group\b', '', name)
        name = re.sub(r'\s+holdings\b', '', name)
        name = re.sub(r'\s+hldgs\b', '', name)
        name = re.sub(r'\s+cl\s+[a-z]\b', '', name) # Remove "CL A", "CL B"
        return name.strip()

    def _get_eodhd_exchange_code(self, dataroma_symbol: str) -> str:
        if '.' in dataroma_symbol:
            suffix = dataroma_symbol.split('.')[-1]
            mapping = {
                'KS': 'KO',
                'SZ': 'SHE',
                'SS': 'SHG',
                'L': 'LSE',
                'TO': 'TO',
                'V': 'V',
                'DE': 'XETRA',
                'HK': 'HK',
                'T': 'T',
            }
            return mapping.get(suffix, 'US')
        return 'US'

    def _strip_suffix(self, symbol: str) -> str:
        if '.' in symbol:
            return symbol.split('.')[0]
        return symbol

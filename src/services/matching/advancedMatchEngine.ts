import Fuse from 'fuse.js';
import { MatchEngine, MatchCandidate, DataromaEntry, SymbolRecord } from '../../domain/contracts';

// --- Helpers ---

function normalizeName(name: string): string {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/\./g, '')
        .replace(/,/g, '')
        .replace(/\s+inc\b/g, '')
        .replace(/\s+corp\b/g, '')
        .replace(/\s+ltd\b/g, '')
        .replace(/\s+plc\b/g, '')
        .replace(/\s+co\b/g, '')
        .replace(/\s+group\b/g, '')
        .replace(/\s+holdings\b/g, '')
        .replace(/\s+hldgs\b/g, '')
        .replace(/\s+cl\s+[a-z]\b/g, '') // Remove "CL A", "CL B" etc.
        .trim();
}

function getEodhdExchangeCode(dataromaSymbol: string): string {
    if (dataromaSymbol.includes('.')) {
        const suffix = dataromaSymbol.split('.').pop();
        switch (suffix) {
            case 'KS': return 'KO'; // Korea
            case 'SZ': return 'SHE'; // Shenzhen (or SHG/Shanghai, ambiguous)
            case 'SS': return 'SHG'; // Shanghai
            case 'L': return 'LSE'; // London
            case 'TO': return 'TO'; // Toronto
            case 'V': return 'V'; // TSX Venture
            case 'DE': return 'XETRA'; // Germany (guess)
            case 'HK': return 'HK'; // Hong Kong (Missing in EODHD files provided?)
            case 'T': return 'T'; // Tokyo (Missing in EODHD files provided?)
            default: return 'US'; // Default fallback, though suffix implies non-US usually
        }
    }
    return 'US';
}

function stripSuffix(symbol: string): string {
    if (symbol.includes('.')) {
        return symbol.split('.')[0];
    }
    return symbol;
}

export class AdvancedMatchEngine implements MatchEngine {
    async generateCandidates(
        dataromaList: DataromaEntry[],
        providerSymbols: SymbolRecord[],
    ): Promise<MatchCandidate[]> {
        // 1. Build Maps
        const symbolMap = new Map<string, Map<string, SymbolRecord>>(); // Exchange -> Code -> Symbol
        const nameMap = new Map<string, SymbolRecord[]>(); // NormalizedName -> Symbols

        for (const sym of providerSymbols) {
            if (!sym.code || !sym.name) continue;

            // Symbol Map
            if (!symbolMap.has(sym.exchange)) {
                symbolMap.set(sym.exchange, new Map());
            }
            symbolMap.get(sym.exchange)!.set(sym.code, sym);

            // Name Map
            const normName = normalizeName(sym.name);
            if (!nameMap.has(normName)) {
                nameMap.set(normName, []);
            }
            nameMap.get(normName)!.push(sym);
        }

        // 2. Prepare Fuzzy Search (Global)
        const fuseOptions = {
            keys: ['name'],
            threshold: 0.3, // 0.0 is perfect match, 1.0 is match anything
            includeScore: true
        };
        const fuse = new Fuse(providerSymbols, fuseOptions);

        // 3. Match
        const candidates: MatchCandidate[] = [];

        for (const entry of dataromaList) {
            const targetExchange = getEodhdExchangeCode(entry.symbol);
            const cleanSymbol = stripSuffix(entry.symbol);

            let matchedSymbol: SymbolRecord | undefined;
            let confidence = 0;
            let reasons: string[] = [];
            let matchType: 'symbol' | 'name' | 'fuzzy' | 'unmatched' = 'unmatched';

            // Strategy 1: Direct Symbol Match
            if (symbolMap.has(targetExchange)) {
                const exchangeSymbols = symbolMap.get(targetExchange)!;

                // Try exact match first (with suffix stripped if applicable)
                if (exchangeSymbols.has(cleanSymbol)) {
                    matchedSymbol = exchangeSymbols.get(cleanSymbol);
                    matchType = 'symbol';
                    confidence = 1.0;
                    reasons.push('Direct symbol match');
                }
                // Try replacing dot with hyphen (common for US share classes like BRK.A -> BRK-A)
                else if (targetExchange === 'US' && entry.symbol.includes('.')) {
                    const hyphenated = entry.symbol.replace('.', '-');
                    if (exchangeSymbols.has(hyphenated)) {
                        matchedSymbol = exchangeSymbols.get(hyphenated);
                        matchType = 'symbol';
                        confidence = 1.0;
                        reasons.push('Symbol match with dot-to-hyphen conversion');
                    }
                }
            }

            // Strategy 2: Name Match (Exact Normalized)
            if (matchType === 'unmatched') {
                const normName = normalizeName(entry.stock);
                if (nameMap.has(normName)) {
                    // Pick the best one, preferably from the target exchange if possible
                    const candidates = nameMap.get(normName)!;
                    const bestCandidate = candidates.find(c => c.exchange === targetExchange) || candidates[0];
                    matchedSymbol = bestCandidate;
                    matchType = 'name';
                    confidence = 0.9; // Slightly less than symbol match
                    reasons.push('Exact normalized name match');
                }
            }

            // Strategy 3: Fuzzy Name Match
            if (matchType === 'unmatched') {
                const fuzzyResults = fuse.search(entry.stock);
                if (fuzzyResults.length > 0) {
                    const best = fuzzyResults[0];
                    // Only accept if score is very good
                    if (best.score !== undefined && best.score < 0.15) {
                        matchedSymbol = best.item;
                        matchType = 'fuzzy';
                        confidence = 1 - best.score;
                        reasons.push(`Fuzzy name match (score: ${best.score})`);
                    }
                }
            }

            // Special handling for known missing exchanges
            if (matchType === 'unmatched') {
                if (['HK', 'T', 'KO'].includes(targetExchange) && !symbolMap.has(targetExchange)) {
                    reasons.push(`Exchange ${targetExchange} data not available in EODHD files.`);
                } else {
                    reasons.push('No match found');
                }
            }

            candidates.push({
                dataromaSymbol: entry.symbol,
                dataromaName: entry.stock,
                providerSymbol: matchedSymbol,
                confidence: confidence,
                reasons: reasons,
                notAvailable: matchType === 'unmatched'
            });
        }

        return candidates;
    }

    confirmMatch(candidate: MatchCandidate, symbol?: SymbolRecord): MatchCandidate {
        if (symbol) {
            return {
                ...candidate,
                providerSymbol: symbol,
                confidence: 1, // Explicitly confirmed
                reasons: ['Manually confirmed'],
                notAvailable: false
            };
        } else {
            return {
                ...candidate,
                providerSymbol: undefined,
                notAvailable: true,
                confidence: 1, // Explicitly marked as not available
                reasons: ['Manually marked as not available'],
            };
        }
    }
}

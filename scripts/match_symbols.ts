
import * as fs from 'fs';
import * as path from 'path';
import Fuse from 'fuse.js';

// --- Interfaces ---

interface DataromaEntry {
    symbol: string;
    stock: string;
}

interface DataromaFile {
    descriptor: any;
    payload: DataromaEntry[];
}

interface EodhdSymbol {
    code: string;
    name: string;
    exchange: string;
    country: string;
    currency: string;
    isin?: string;
    type: string;
}

// ... (ExchangeInfo and ExchangeList remain same)

// ...



interface ExchangeInfo {
    code: string;
    name: string;
    operatingMic: string;
    country: string;
    currency: string;
}

interface ExchangeList {
    descriptor: any;
    payload: ExchangeInfo[];
}

interface MatchResult {
    dataroma: DataromaEntry;
    eodhd?: EodhdSymbol;
    matchType: 'symbol' | 'name' | 'fuzzy' | 'unmatched';
    score?: number; // Lower is better for Fuse.js (0 is perfect)
    notes?: string;
}

// --- Paths ---

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATAROMA_PATH = path.join(PROJECT_ROOT, 'examples/dataroma/dataroma/scrape/grand-portfolio_v2_0_max-all.json');
const EODHD_EXCHANGE_LIST_PATH = path.join(PROJECT_ROOT, 'examples/eodhd/eodhd/exchange-list/all.json');
const EODHD_SYMBOLS_DIR = path.join(PROJECT_ROOT, 'examples/eodhd/eodhd/exchange-symbols');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'examples/dataroma/dataroma/matches');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dataroma_eodhd_matches.json');

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

// --- Main ---

async function main() {
    console.log('Starting matching process...');

    // 1. Load Data
    console.log('Loading Dataroma data...');
    const dataromaData: DataromaFile = JSON.parse(fs.readFileSync(DATAROMA_PATH, 'utf-8'));

    console.log('Loading Exchange List...');
    const exchangeList: ExchangeList = JSON.parse(fs.readFileSync(EODHD_EXCHANGE_LIST_PATH, 'utf-8'));
    const exchangeMap = new Map(exchangeList.payload.map(e => [e.code, e]));

    console.log('Loading EODHD Symbol Files...');
    const symbolMap = new Map<string, Map<string, EodhdSymbol>>(); // Exchange -> Code -> Symbol
    const nameMap = new Map<string, EodhdSymbol[]>(); // NormalizedName -> Symbols
    const allSymbols: EodhdSymbol[] = [];

    if (!fs.existsSync(EODHD_SYMBOLS_DIR)) {
        console.error(`Directory not found: ${EODHD_SYMBOLS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(EODHD_SYMBOLS_DIR).filter(f => f.endsWith('_common.json'));
    for (const file of files) {
        const exchangeCode = file.replace('_common.json', '');
        const content = fs.readFileSync(path.join(EODHD_SYMBOLS_DIR, file), 'utf-8');
        try {
            const data = JSON.parse(content);
            // Some files might be wrapped in a structure or just an array. 
            // Based on previous view_file, it seems to be a flat array or payload object.
            // Let's check the structure of US_common.json again if needed, but assuming standard EODHD format:
            // It seems to be an array based on "payload" key in previous view_file output? 
            // Wait, US_common.json view showed: {"descriptor":..., "payload": [...]}
            // But some might be just arrays? Let's handle both.

            let symbols: EodhdSymbol[] = [];
            if (Array.isArray(data)) {
                symbols = data;
            } else if (data.payload && Array.isArray(data.payload)) {
                symbols = data.payload;
            }

            if (!symbolMap.has(exchangeCode)) {
                symbolMap.set(exchangeCode, new Map());
            }
            const codeMap = symbolMap.get(exchangeCode)!;

            for (const sym of symbols) {
                if (!sym.code || !sym.name) {
                    // console.warn(`Skipping invalid symbol in ${file}:`, JSON.stringify(sym));
                    continue;
                }
                codeMap.set(sym.code, sym);

                const normName = normalizeName(sym.name);
                if (!nameMap.has(normName)) {
                    nameMap.set(normName, []);
                }
                nameMap.get(normName)!.push(sym);
                allSymbols.push(sym);
            }
        } catch (e) {
            console.error(`Error parsing ${file}:`, e);
        }
    }
    console.log(`Loaded ${allSymbols.length} symbols from ${files.length} exchanges.`);

    // 2. Prepare Fuzzy Search
    const fuseOptions = {
        keys: ['name'],
        threshold: 0.3, // 0.0 is perfect match, 1.0 is match anything
        includeScore: true
    };
    const fuse = new Fuse(allSymbols, fuseOptions);

    // 3. Match
    const results: MatchResult[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const entry of dataromaData.payload) {
        const targetExchange = getEodhdExchangeCode(entry.symbol);
        const cleanSymbol = stripSuffix(entry.symbol);

        let match: MatchResult = {
            dataroma: entry,
            matchType: 'unmatched'
        };

        // Strategy 1: Direct Symbol Match
        if (symbolMap.has(targetExchange)) {
            const exchangeSymbols = symbolMap.get(targetExchange)!;

            // Try exact match first (with suffix stripped if applicable)
            if (exchangeSymbols.has(cleanSymbol)) {
                match.eodhd = exchangeSymbols.get(cleanSymbol);
                match.matchType = 'symbol';
                match.score = 0;
            }
            // Try replacing dot with hyphen (common for US share classes like BRK.A -> BRK-A)
            else if (targetExchange === 'US' && entry.symbol.includes('.')) {
                const hyphenated = entry.symbol.replace('.', '-');
                if (exchangeSymbols.has(hyphenated)) {
                    match.eodhd = exchangeSymbols.get(hyphenated);
                    match.matchType = 'symbol';
                    match.score = 0;
                    match.notes = 'Matched by replacing dot with hyphen';
                }
            }
        }

        // Strategy 2: Name Match (Exact Normalized)
        if (match.matchType === 'unmatched') {
            const normName = normalizeName(entry.stock);
            if (nameMap.has(normName)) {
                // Pick the best one, preferably from the target exchange if possible
                const candidates = nameMap.get(normName)!;
                const bestCandidate = candidates.find(c => c.exchange === targetExchange) || candidates[0];
                match.eodhd = bestCandidate;
                match.matchType = 'name';
                match.score = 0;
            }
        }

        // Strategy 3: Fuzzy Name Match
        // Only do this if we are desperate, and maybe restrict to target exchange if possible?
        // Global fuzzy search is expensive and prone to false positives.
        // Let's try fuzzy search ONLY within the target exchange if it exists, otherwise global.
        if (match.matchType === 'unmatched') {
            // Optimization: Filter fuse collection by exchange if possible? 
            // Fuse doesn't support dynamic filtering easily without rebuilding index.
            // Let's just search global and check exchange in results.

            const fuzzyResults = fuse.search(entry.stock);
            if (fuzzyResults.length > 0) {
                const best = fuzzyResults[0];
                // Only accept if score is very good
                if (best.score !== undefined && best.score < 0.15) {
                    match.eodhd = best.item;
                    match.matchType = 'fuzzy';
                    match.score = best.score;
                }
            }
        }

        // Special handling for known missing exchanges
        if (match.matchType === 'unmatched') {
            if (['HK', 'T', 'KO'].includes(targetExchange) && !symbolMap.has(targetExchange)) {
                match.notes = `Exchange ${targetExchange} data not available in EODHD files.`;
            }
        }

        results.push(match);
        if (match.matchType !== 'unmatched') matchedCount++;
        else unmatchedCount++;
    }

    // 4. Output
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Matching complete.`);
    console.log(`Matched: ${matchedCount}`);
    console.log(`Unmatched: ${unmatchedCount}`);
    console.log(`Results written to ${OUTPUT_FILE}`);
}

main().catch(console.error);

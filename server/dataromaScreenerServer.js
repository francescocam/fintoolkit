"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const path = __importStar(require("path"));
const dataromaScraper_1 = require("../src/services/scraper/dataromaScraper");
const fileCacheStore_1 = require("../src/services/cache/fileCacheStore");
const eodhdProvider_1 = require("../src/providers/eodhdProvider");
const advancedMatchEngine_1 = require("../src/services/matching/advancedMatchEngine");
const dataromaScreenerOrchestrator_1 = require("../src/services/dataromaScreener/dataromaScreenerOrchestrator");
const dataromaScreenerSessionStore_1 = require("../src/services/dataromaScreener/dataromaScreenerSessionStore");
const httpClient_1 = require("../src/providers/httpClient");
const fileSettingsStore_1 = require("../src/services/settings/fileSettingsStore");
const PORT = Number(process.env.DATAROMA_SCREENER_API_PORT ?? 8787);
const dataromaCache = new fileCacheStore_1.FileCacheStore({
    baseDir: path.join(__dirname, '..', '.cache', 'dataroma'),
});
const eodCache = new fileCacheStore_1.FileCacheStore({
    baseDir: path.join(__dirname, '..', '.cache', 'eodhd'),
});
const dataromaHttpClient = new httpClient_1.FetchHttpClient((url, init) => fetch(url, init));
const eodHttpClient = new httpClient_1.FetchHttpClient((url, init) => fetch(url, init));
const scraper = new dataromaScraper_1.DataromaScraperService({ client: dataromaHttpClient, cache: dataromaCache });
const sessionStore = new dataromaScreenerSessionStore_1.DataromaScreenerFileSessionStore({
    baseDir: path.join(__dirname, '..', '.dataroma-screener-sessions'),
});
const settingsStore = new fileSettingsStore_1.FileSettingsStore({
    filePath: path.join(__dirname, '..', '.config', 'settings.json'),
});
const matchEngine = new advancedMatchEngine_1.AdvancedMatchEngine();
let orchestratorPromise = null;
let latestSession = null;
async function resolveApiToken() {
    const settings = await settingsStore.load();
    const stored = settings.providerKeys.find((key) => key.provider === 'eodhd')?.apiKey;
    return stored || process.env.EODHD_API_TOKEN || 'demo';
}
async function getCachePreferences() {
    const settings = await settingsStore.load();
    return settings.preferences.cache;
}
async function resolveCachePreferences(overrides) {
    const defaults = await getCachePreferences();
    return {
        ...defaults,
        ...sanitizeCacheOverrides(overrides),
    };
}
async function buildOrchestrator() {
    const apiToken = await resolveApiToken();
    const provider = new eodhdProvider_1.EodhdProvider({
        apiToken,
        client: eodHttpClient,
        cache: eodCache,
    });
    return new dataromaScreenerOrchestrator_1.DataromaScreenerOrchestrator({
        scraper,
        provider,
        matchEngine,
        store: sessionStore,
        cache: dataromaCache, // Reusing dataromaCache for system matches
    });
}
async function getOrchestrator() {
    if (!orchestratorPromise) {
        orchestratorPromise = buildOrchestrator();
    }
    return orchestratorPromise;
}
async function getLatestSession() {
    if (latestSession) {
        return latestSession;
    }
    return null;
}
function flattenProviderSymbols(universe) {
    return Object.values(universe.symbols).flatMap((payload) => payload.payload);
}
function searchSymbolsInUniverse(universe, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [];
    }
    const symbols = flattenProviderSymbols(universe);
    return symbols
        .filter((symbol) => symbol.name.toLowerCase().includes(normalized))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 15);
}
function findSymbolInUniverse(universe, code, exchange) {
    const normalizedCode = code.toUpperCase();
    for (const payload of Object.values(universe.symbols)) {
        const match = payload.payload.find((symbol) => symbol.code.toUpperCase() === normalizedCode &&
            (!exchange || symbol.exchange.toUpperCase() === exchange.toUpperCase()));
        if (match) {
            return match;
        }
    }
    return null;
}
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}
async function handleLatestSession(res) {
    try {
        const session = await getLatestSession();
        if (!session) {
            sendJson(res, 404, { error: 'No Dataroma screener session found. Start a new session.' });
            return;
        }
        sendJson(res, 200, session);
    }
    catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}
async function handleSettingsGet(res) {
    try {
        const settings = await settingsStore.load();
        sendJson(res, 200, settings);
    }
    catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}
async function handleSettingsUpdate(req, res) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const payload = body ? JSON.parse(body) : null;
            if (!payload) {
                sendJson(res, 400, { error: 'Invalid settings payload' });
                return;
            }
            await settingsStore.save(payload);
            orchestratorPromise = null;
            latestSession = null;
            sendJson(res, 200, payload);
        }
        catch (error) {
            sendJson(res, 500, { error: error.message });
        }
    });
}
async function handleSessionById(res, id) {
    try {
        const screener = await getOrchestrator();
        const session = await screener.loadSession(id);
        if (!session) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
        }
        sendJson(res, 200, session);
    }
    catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}
async function handleUniverseStep(req, res, sessionId) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const payload = body ? JSON.parse(body) : {};
            const screener = await getOrchestrator();
            const overrides = {
                ...sanitizeCacheOverrides(payload.cache),
            };
            if (typeof payload.useCache === 'boolean') {
                overrides.stockUniverse = payload.useCache;
            }
            const cachePrefs = await resolveCachePreferences(overrides);
            latestSession = await screener.runUniverseStep(sessionId, {
                useCache: cachePrefs.stockUniverse,
                commonStock: payload.commonStock,
            });
            sendJson(res, 200, latestSession);
        }
        catch (error) {
            sendJson(res, 500, { error: error.message });
        }
    });
}
async function handleMatchGeneration(req, res, sessionId) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const payload = body ? JSON.parse(body) : {};
            const screener = await getOrchestrator();
            latestSession = await screener.runMatchStep(sessionId, {
                commonStock: payload.commonStock,
            });
            sendJson(res, 200, latestSession);
        }
        catch (error) {
            sendJson(res, 500, { error: error.message });
        }
    });
}
async function handleCreateSession(req, res) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const payload = body ? JSON.parse(body) : {};
            const screener = await getOrchestrator();
            const overrides = {
                ...sanitizeCacheOverrides(payload.cache),
            };
            if (typeof payload.useCache === 'boolean') {
                overrides.dataromaScrape = payload.useCache;
            }
            const maxEntries = typeof payload.maxEntries === 'number' && payload.maxEntries > 0
                ? Math.floor(payload.maxEntries)
                : undefined;
            const cache = await resolveCachePreferences(overrides);
            latestSession = await screener.startSession({
                cache,
                minPercent: typeof payload.minPercent === 'number' ? payload.minPercent : undefined,
                cacheToken: typeof payload.cacheToken === 'string' ? payload.cacheToken : undefined,
                maxEntries,
            });
            sendJson(res, 201, latestSession);
        }
        catch (error) {
            sendJson(res, 500, { error: error.message });
        }
    });
}
async function handleUniverseSearch(res, query) {
    if (!query || query.trim().length < 2) {
        sendJson(res, 400, { error: 'Search query must be at least 2 characters long.' });
        return;
    }
    const session = await getLatestSession();
    if (!session || !session.providerUniverse) {
        sendJson(res, 404, { error: 'No stock universe available. Run the screener first.' });
        return;
    }
    const results = searchSymbolsInUniverse(session.providerUniverse, query);
    sendJson(res, 200, { results });
}
async function handleMatchUpdate(req, res) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', async () => {
        try {
            const payload = body ? JSON.parse(body) : null;
            if (!payload || typeof payload.dataromaSymbol !== 'string') {
                sendJson(res, 400, { error: 'Invalid match payload' });
                return;
            }
            const session = await getLatestSession();
            if (!session || !session.matches) {
                sendJson(res, 404, { error: 'No match suggestions available. Run the screener.' });
                return;
            }
            const match = session.matches.find((entry) => entry.dataromaSymbol === payload.dataromaSymbol);
            if (!match) {
                sendJson(res, 404, { error: 'Match candidate not found' });
                return;
            }
            if (payload.notAvailable) {
                match.providerSymbol = undefined;
                match.notAvailable = true;
            }
            else if (payload.providerSymbol) {
                if (!session.providerUniverse) {
                    sendJson(res, 400, { error: 'Stock universe missing. Re-run the screener.' });
                    return;
                }
                const resolved = findSymbolInUniverse(session.providerUniverse, payload.providerSymbol.code, payload.providerSymbol.exchange);
                if (!resolved) {
                    sendJson(res, 400, { error: 'Selected symbol not found in cached universe.' });
                    return;
                }
                match.providerSymbol = resolved;
                match.notAvailable = false;
            }
            else {
                sendJson(res, 400, { error: 'Provide a symbol or mark the candidate as not available.' });
                return;
            }
            await sessionStore.save(session);
            latestSession = session;
            sendJson(res, 200, match);
        }
        catch (error) {
            sendJson(res, 500, { error: error.message });
        }
    });
}
(0, http_1.createServer)(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    const { pathname, searchParams } = parseRequestUrl(req.url);
    if (req.method === 'GET' && pathname === '/api/dataroma-screener/session/latest') {
        await handleLatestSession(res);
        return;
    }
    if (req.method === 'GET' && pathname === '/api/dataroma-screener/universe/search') {
        const query = searchParams.query ?? '';
        await handleUniverseSearch(res, query);
        return;
    }
    if (req.method === 'GET' && pathname === '/api/settings') {
        await handleSettingsGet(res);
        return;
    }
    if (req.method === 'PUT' && pathname === '/api/settings') {
        await handleSettingsUpdate(req, res);
        return;
    }
    if (req.method === 'POST' && pathname === '/api/dataroma-screener/session') {
        await handleCreateSession(req, res);
        return;
    }
    if (pathname?.startsWith('/api/dataroma-screener/session/')) {
        const segments = pathname.split('/').filter(Boolean);
        const id = segments[3];
        const subresource = segments[4];
        if (!id) {
            sendJson(res, 400, { error: 'Session id missing' });
            return;
        }
        if (req.method === 'GET' && segments.length === 4) {
            await handleSessionById(res, id);
            return;
        }
        if (req.method === 'POST' && segments.length === 5 && subresource === 'universe') {
            await handleUniverseStep(req, res, id);
            return;
        }
        if (req.method === 'POST' && segments.length === 5 && subresource === 'matches') {
            await handleMatchGeneration(req, res, id);
            return;
        }
    }
    if (req.method === 'PUT' && pathname === '/api/dataroma-screener/matches') {
        await handleMatchUpdate(req, res);
        return;
    }
    sendJson(res, 404, { error: 'Route not found' });
}).listen(PORT, () => {
    console.log(`Dataroma Screener API server listening on http://localhost:${PORT}`);
});
function sanitizeCacheOverrides(overrides) {
    if (!overrides) {
        return {};
    }
    return Object.fromEntries(Object.entries(overrides).filter(([, value]) => typeof value === 'boolean'));
}
function parseRequestUrl(rawUrl) {
    const [path = '/', query = ''] = (rawUrl ?? '/').split('?');
    const searchParams = {};
    if (query) {
        for (const pair of query.split('&')) {
            if (!pair) {
                continue;
            }
            const [rawKey, rawValue = ''] = pair.split('=');
            const key = decodeURIComponent(rawKey);
            const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
            if (key) {
                searchParams[key] = value;
            }
        }
    }
    return { pathname: path, searchParams };
}

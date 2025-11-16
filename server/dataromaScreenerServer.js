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
const inMemoryCacheStore_1 = require("../src/services/cache/inMemoryCacheStore");
const eodhdProvider_1 = require("../src/providers/eodhdProvider");
const basicMatchEngine_1 = require("../src/services/matching/basicMatchEngine");
const dataromaScreenerOrchestrator_1 = require("../src/services/dataromaScreener/dataromaScreenerOrchestrator");
const dataromaScreenerSessionStore_1 = require("../src/services/dataromaScreener/dataromaScreenerSessionStore");
const httpClient_1 = require("../src/providers/httpClient");
const fileSettingsStore_1 = require("../src/services/settings/fileSettingsStore");
const PORT = Number(process.env.DATAROMA_SCREENER_API_PORT ?? 8787);
const dataromaCache = new inMemoryCacheStore_1.InMemoryCacheStore();
const eodCache = new inMemoryCacheStore_1.InMemoryCacheStore();
const dataromaHttpClient = new httpClient_1.FetchHttpClient((url, init) => fetch(url, init));
const eodHttpClient = new httpClient_1.FetchHttpClient((url, init) => fetch(url, init));
const scraper = new dataromaScraper_1.DataromaScraperService({ client: dataromaHttpClient, cache: dataromaCache });
const sessionStore = new dataromaScreenerSessionStore_1.DataromaScreenerFileSessionStore({
    baseDir: path.join(__dirname, '..', '.dataroma-screener-sessions'),
});
const settingsStore = new fileSettingsStore_1.FileSettingsStore({
    filePath: path.join(__dirname, '..', '.config', 'settings.json'),
});
const matchEngine = new basicMatchEngine_1.BasicMatchEngine();
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
        maxSymbolExchanges: 2,
        store: sessionStore,
    });
}
async function getOrchestrator() {
    if (!orchestratorPromise) {
        orchestratorPromise = buildOrchestrator();
    }
    return orchestratorPromise;
}
async function ensureSession() {
    const screener = await getOrchestrator();
    if (!latestSession) {
        const cache = await getCachePreferences();
        latestSession = await screener.startSession({ cache });
    }
    return latestSession;
}
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}
async function handleLatestSession(res) {
    try {
        const session = await ensureSession();
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
            const cache = await resolveCachePreferences(overrides);
            latestSession = await screener.startSession({
                cache,
                minPercent: typeof payload.minPercent === 'number' ? payload.minPercent : undefined,
                cacheToken: typeof payload.cacheToken === 'string' ? payload.cacheToken : undefined,
            });
            sendJson(res, 201, latestSession);
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
    const pathname = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && pathname === '/api/dataroma-screener/session/latest') {
        await handleLatestSession(res);
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
    if (req.method === 'GET' && pathname?.startsWith('/api/dataroma-screener/session/')) {
        const [, , , , id] = pathname.split('/');
        if (!id) {
            sendJson(res, 400, { error: 'Session id missing' });
            return;
        }
        await handleSessionById(res, id);
        return;
    }
    if (req.method === 'POST' && pathname === '/api/dataroma-screener/session') {
        await handleCreateSession(req, res);
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

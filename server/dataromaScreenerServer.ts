import { createServer, IncomingMessage, ServerResponse } from 'http';
import * as path from 'path';
import { DataromaScraperService } from '../src/services/scraper/dataromaScraper';
import { InMemoryCacheStore } from '../src/services/cache/inMemoryCacheStore';
import { EodhdProvider } from '../src/providers/eodhdProvider';
import { BasicMatchEngine } from '../src/services/matching/basicMatchEngine';
import { DataromaScreenerOrchestrator } from '../src/services/dataromaScreener/dataromaScreenerOrchestrator';
import { DataromaScreenerFileSessionStore } from '../src/services/dataromaScreener/dataromaScreenerSessionStore';
import { DataromaScreenerSession, AppSettings } from '../src/domain/contracts';
import { FetchHttpClient } from '../src/providers/httpClient';
import { FileSettingsStore } from '../src/services/settings/fileSettingsStore';

const PORT = Number(process.env.DATAROMA_SCREENER_API_PORT ?? 8787);

const dataromaCache = new InMemoryCacheStore();
const eodCache = new InMemoryCacheStore();

const dataromaHttpClient = new FetchHttpClient((url, init) => fetch(url, init));
const eodHttpClient = new FetchHttpClient((url, init) => fetch(url, init));
const scraper = new DataromaScraperService({ client: dataromaHttpClient, cache: dataromaCache });

const sessionStore = new DataromaScreenerFileSessionStore({
  baseDir: path.join(__dirname, '..', '.dataroma-screener-sessions'),
});
const settingsStore = new FileSettingsStore({
  filePath: path.join(__dirname, '..', '.config', 'settings.json'),
});
const matchEngine = new BasicMatchEngine();

let orchestratorPromise: Promise<DataromaScreenerOrchestrator> | null = null;

let latestSession: DataromaScreenerSession | null = null;

async function resolveApiToken(): Promise<string> {
  const settings = await settingsStore.load();
  const stored = settings.providerKeys.find((key) => key.provider === 'eodhd')?.apiKey;
  return stored || process.env.EODHD_API_TOKEN || 'demo';
}

async function getCachePreferences(): Promise<AppSettings['preferences']['cache']> {
  const settings = await settingsStore.load();
  return settings.preferences.cache;
}

async function resolveCachePreferences(
  overrides?: Partial<AppSettings['preferences']['cache']>,
): Promise<AppSettings['preferences']['cache']> {
  const defaults = await getCachePreferences();
  return {
    ...defaults,
    ...sanitizeCacheOverrides(overrides),
  } as AppSettings['preferences']['cache'];
}


async function buildOrchestrator(): Promise<DataromaScreenerOrchestrator> {
  const apiToken = await resolveApiToken();
  const provider = new EodhdProvider({
    apiToken,
    client: eodHttpClient,
    cache: eodCache,
  });

  return new DataromaScreenerOrchestrator({
    scraper,
    provider,
    matchEngine,
    maxSymbolExchanges: 2,
    store: sessionStore,
  });
}

async function getOrchestrator(): Promise<DataromaScreenerOrchestrator> {
  if (!orchestratorPromise) {
    orchestratorPromise = buildOrchestrator();
  }
  return orchestratorPromise;
}

async function ensureSession(): Promise<DataromaScreenerSession> {
  const screener = await getOrchestrator();
  if (!latestSession) {
    const cache = await getCachePreferences();
    latestSession = await screener.startSession({ cache });
  }
  return latestSession;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function handleLatestSession(res: ServerResponse): Promise<void> {
  try {
    const session = await ensureSession();
    sendJson(res, 200, session);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

async function handleSettingsGet(res: ServerResponse): Promise<void> {
  try {
    const settings = await settingsStore.load();
    sendJson(res, 200, settings);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

async function handleSettingsUpdate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const payload = body ? (JSON.parse(body) as AppSettings) : null;
      if (!payload) {
        sendJson(res, 400, { error: 'Invalid settings payload' });
        return;
      }
      await settingsStore.save(payload);
      orchestratorPromise = null;
      latestSession = null;
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, { error: (error as Error).message });
    }
  });
}

async function handleSessionById(res: ServerResponse, id: string): Promise<void> {
  try {
    const screener = await getOrchestrator();
    const session = await screener.loadSession(id);
    if (!session) {
      sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    sendJson(res, 200, session);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const payload = body ? (JSON.parse(body) as StartSessionPayload) : {};
      const screener = await getOrchestrator();
      const overrides: Partial<AppSettings['preferences']['cache']> = {
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
    } catch (error) {
      sendJson(res, 500, { error: (error as Error).message });
    }
  });
}

createServer(async (req, res) => {
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

interface StartSessionPayload {
  cache?: Partial<AppSettings['preferences']['cache']>;
  useCache?: boolean;
  minPercent?: number;
  cacheToken?: string;
}

function sanitizeCacheOverrides(
  overrides?: Partial<AppSettings['preferences']['cache']>,
): Partial<AppSettings['preferences']['cache']> {
  if (!overrides) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => typeof value === 'boolean'),
  ) as Partial<AppSettings['preferences']['cache']>;
}

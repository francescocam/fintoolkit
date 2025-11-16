export type ProviderId = 'eodhd' | string;

export interface ProviderKey {
  provider: ProviderId;
  apiKey: string;
  updatedAt: Date;
}

export interface CacheDescriptor {
  scope: 'scrape' | 'exchange-list' | 'exchange-symbols' | 'fundamentals';
  provider: ProviderId;
  key: string;
  expiresAt?: Date;
}

export interface CachedPayload<T> {
  descriptor: CacheDescriptor;
  payload: T;
  createdAt: Date;
}

export interface AppSettings {
  providerKeys: ProviderKey[];
  preferences: {
    defaultProvider: ProviderId;
    cache: CachePreferences;
  };
}

export interface CachePreferences {
  dataromaScrape: boolean;
  stockUniverse: boolean;
  [key: string]: boolean;
}

export interface DataromaEntry {
  symbol: string;
  stock: string;
}

export interface ScrapeOptions {
  useCache: boolean;
  cacheToken?: string;
  minPercent?: number;
}

export interface ScrapeResult {
  entries: DataromaEntry[];
  source: 'live' | 'cache';
  cachedPayload?: CachedPayload<DataromaEntry[]>;
}

export interface DataromaScraper {
  scrapeGrandPortfolio(opts: ScrapeOptions): Promise<ScrapeResult>;
}

export interface ExchangeSummary {
  code: string;
  name: string;
  country: string;
  currency: string;
  operatingMic: string;
}

export interface SymbolRecord {
  code: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  isin?: string | null;
}

export interface FundamentalsSnapshot {
  stockCode: string;
  exchangeCode: string;
  name: string;
  trailingPE?: number;
  forwardPE?: number;
  forwardDividendYield?: number;
  freeCashFlowMargin?: number;
  asOf: Date;
  raw: Record<string, unknown>;
}

export interface ProviderCacheOptions {
  useCache?: boolean;
}

export interface FundamentalsProvider {
  id: ProviderId;
  getExchanges(options?: ProviderCacheOptions): Promise<CachedPayload<ExchangeSummary[]>>;
  getSymbols(exchangeCode: string, options?: ProviderCacheOptions): Promise<CachedPayload<SymbolRecord[]>>;
  getFundamentals(stockCode: string, exchangeCode: string, options?: ProviderCacheOptions): Promise<FundamentalsSnapshot>;
}

export interface CacheStore {
  read<T>(descriptor: CacheDescriptor): Promise<CachedPayload<T> | null>;
  write<T>(descriptor: CacheDescriptor, payload: T): Promise<CachedPayload<T>>;
  clear(descriptor: CacheDescriptor): Promise<void>;
}

export interface MatchCandidate {
  dataromaSymbol: string;
  dataromaName: string;
  providerSymbol?: SymbolRecord;
  confidence: number;
  reasons: string[];
  notAvailable?: boolean;
}

export interface MatchEngine {
  generateCandidates(
    dataromaList: DataromaEntry[],
    providerSymbols: SymbolRecord[],
  ): Promise<MatchCandidate[]>;
  confirmMatch(candidate: MatchCandidate, symbol?: SymbolRecord): MatchCandidate;
}

export type DataromaScreenerStep = 'scrape' | 'universe' | 'match' | 'validate' | 'screener';
export type DataromaScreenerStatus = 'idle' | 'running' | 'blocked' | 'complete';

export interface DataromaScreenerStepState {
  step: DataromaScreenerStep;
  status: DataromaScreenerStatus;
  context?: Record<string, unknown>;
}

export interface DataromaScreenerSession {
  id: string;
  createdAt: Date;
  steps: DataromaScreenerStepState[];
  dataroma?: ScrapeResult;
  providerUniverse?: {
    exchanges: CachedPayload<ExchangeSummary[]>;
    symbols: Record<string, CachedPayload<SymbolRecord[]>>;
  };
  matches?: MatchCandidate[];
  screenerRows?: FundamentalsSnapshot[];
}

export interface DataromaScreenerSessionStore {
  load(id: string): Promise<DataromaScreenerSession | null>;
  save(session: DataromaScreenerSession): Promise<void>;
}

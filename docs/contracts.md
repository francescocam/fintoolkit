# Core Data Contracts

This document captures the first-cut TypeScript contracts that describe the flows outlined in the brief.  They are intentionally provider-agnostic so that the EODHD implementation becomes just one adapter.

## Shared Primitives

```ts
export type ProviderId = 'eodhd' | string;

export interface ProviderKey {
  provider: ProviderId;
  apiKey: string;
  updatedAt: Date;
}

export interface CacheDescriptor {
  scope: 'scrape' | 'exchange-list' | 'exchange-symbols' | 'fundamentals';
  provider: ProviderId;
  key: string; // e.g. "exchange:US" or "dataroma:grand-portfolio"
  expiresAt?: Date;
}

export interface CachedPayload<T> {
  descriptor: CacheDescriptor;
  payload: T;
  createdAt: Date;
}
```

## Settings Layer

```ts
export interface AppSettings {
  providerKeys: ProviderKey[];
  preferences: {
    defaultProvider: ProviderId;
    reuseCacheByDefault: boolean;
  };
}
```

## Scraper Contracts (Dataroma)

```ts
export interface DataromaEntry {
  symbol: string; // e.g. "BRK.B"
  stock: string;  // display name such as "Berkshire Hathaway Inc. Class B"
}

export interface ScrapeOptions {
  useCache: boolean;
  cacheToken?: string;
}

export interface ScrapeResult {
  entries: DataromaEntry[];
  source: 'live' | 'cache';
  cachedPayload?: CachedPayload<DataromaEntry[]>;
}

export interface DataromaScraper {
  scrapeGrandPortfolio(opts: ScrapeOptions): Promise<ScrapeResult>;
}
```

## EODHD Provider Contracts

```ts
export interface ExchangeSummary {
  code: string;     // e.g. "US"
  name: string;     // "USA Stocks"
  country: string;  // ISO2 or ISO3 depending on source
  currency: string; // primary trading currency
  operatingMic: string;
}

export interface SymbolRecord {
  code: string;     // ticker, e.g. "AAPL"
  name: string;     // company name
  exchange: string; // raw string from provider, e.g. "NASDAQ"
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
  freeCashFlowMargin?: number; // FCF / Revenue
  asOf: Date;
  raw: Record<string, unknown>; // keep untouched payload for future derived metrics
}

export interface FundamentalsProvider {
  id: ProviderId;
  getExchanges(): Promise<CachedPayload<ExchangeSummary[]>>;
  getSymbols(exchangeCode: string): Promise<CachedPayload<SymbolRecord[]>>;
  getFundamentals(stockCode: string, exchangeCode: string): Promise<FundamentalsSnapshot>;
}
```

## Cache Abstraction

```ts
export interface CacheStore {
  read<T>(descriptor: CacheDescriptor): Promise<CachedPayload<T> | null>;
  write<T>(descriptor: CacheDescriptor, payload: T): Promise<CachedPayload<T>>;
  clear(descriptor: CacheDescriptor): Promise<void>;
}
```

## Matching Layer

```ts
export interface MatchCandidate {
  dataromaSymbol: string;
  dataromaName: string;
  providerSymbol?: SymbolRecord;
  confidence: number; // 0 - 1, UI multiplies by 100
  reasons: string[];  // explain scoring for debugging + UI hints
}

export interface MatchEngine {
  generateCandidates(
    dataromaList: DataromaEntry[],
    providerSymbols: SymbolRecord[]
  ): Promise<MatchCandidate[]>;

  confirmMatch(candidate: MatchCandidate, symbol?: SymbolRecord): MatchCandidate;
}
```

## Wizard State

```ts
export interface WizardStepState {
  step: 'scrape' | 'universe' | 'match' | 'validate' | 'screener';
  status: 'idle' | 'running' | 'blocked' | 'complete';
  context?: Record<string, unknown>;
}

export interface WizardSession {
  id: string;
  createdAt: Date;
  steps: WizardStepState[];
  dataroma?: ScrapeResult;
  providerUniverse?: {
    exchanges: CachedPayload<ExchangeSummary[]>;
    symbols: Record<string, CachedPayload<SymbolRecord[]>>; // keyed by exchange code
  };
  matches?: MatchCandidate[];
  screenerRows?: FundamentalsSnapshot[];
}
```

These contracts allow us to implement step 1 independently of any concrete UI or storage choice.  Each subsequent feature can now depend on these enums/interfaces without touching provider-specific code.

export type DataromaScreenerStatus = 'idle' | 'running' | 'blocked' | 'complete';

export interface DataromaScreenerStepState {
  step: 'scrape' | 'universe' | 'match' | 'validate' | 'screener';
  status: DataromaScreenerStatus;
  context?: Record<string, unknown>;
}

export interface DataromaEntry {
  symbol: string;
  stock: string;
}

export interface MatchCandidate {
  dataromaSymbol: string;
  dataromaName: string;
  providerSymbol?: {
    code: string;
    name: string;
    exchange: string;
    country?: string;
    currency?: string;
  };
  confidence: number;
  reasons: string[];
  notAvailable?: boolean;
}

export interface CachedPayload<T> {
  payload: T;
  descriptor: {
    scope: string;
    provider: string;
    key: string;
  };
  createdAt: string;
}

export interface DataromaScreenerSession {
  id: string;
  createdAt: string;
  steps: DataromaScreenerStepState[];
  dataroma?: {
    entries: DataromaEntry[];
    source: string;
  };
  providerUniverse?: {
    exchanges: CachedPayload<
      { code: string; name: string; country: string; currency: string; operatingMic: string }[]
    >;
    symbols: Record<string, CachedPayload<{ code: string; name: string }[]>>;
  };
  matches?: MatchCandidate[];
}

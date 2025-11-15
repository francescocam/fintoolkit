export type WizardStatus = 'idle' | 'running' | 'blocked' | 'complete';

export interface WizardStepState {
  step: 'scrape' | 'universe' | 'match' | 'validate' | 'screener';
  status: WizardStatus;
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

export interface WizardSession {
  id: string;
  createdAt: string;
  steps: WizardStepState[];
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

import { randomUUID } from 'crypto';
import {
  CachedPayload,
  CachePreferences,
  DataromaScraper,
  DataromaScreenerSession,
  DataromaScreenerSessionStore,
  DataromaScreenerStepState,
  FundamentalsProvider,
  MatchCandidate,
  MatchEngine,
  ScrapeOptions,
  SymbolRecord,
} from '../../domain/contracts';

export interface DataromaScreenerOrchestratorConfig {
  scraper: DataromaScraper;
  provider: FundamentalsProvider;
  matchEngine: MatchEngine;
  maxSymbolExchanges?: number;
  store?: DataromaScreenerSessionStore;
}

export class DataromaScreenerOrchestrator {
  constructor(private readonly config: DataromaScreenerOrchestratorConfig) {}

  async startSession(options?: DataromaScreenerRunOptions): Promise<DataromaScreenerSession> {
    const steps: DataromaScreenerStepState[] = [];
    const session: DataromaScreenerSession = {
      id: randomUUID(),
      createdAt: new Date(),
      steps,
    };

    const cachePrefs = options?.cache ?? {};
    const scrapeOptions: ScrapeOptions = {
      useCache: cachePrefs.dataromaScrape ?? true,
      cacheToken: options?.cacheToken,
      minPercent: options?.minPercent,
      maxEntries: options?.maxEntries,
    };

    steps.push(this.createStepState('scrape', 'running', { minPercent: scrapeOptions.minPercent ?? 0 }));
    await this.persistSession(session);

    try {
      session.dataroma = await this.config.scraper.scrapeGrandPortfolio(scrapeOptions);
      this.updateStepState(steps[0], 'complete', {
        source: session.dataroma.source,
        entryCount: session.dataroma.entries.length,
      });
      await this.persistSession(session);
    } catch (error) {
      this.updateStepState(steps[0], 'blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.persistSession(session);
      throw error;
    }

    return session;
  }

  async runUniverseStep(
    sessionId: string,
    options?: UniverseStepRunOptions,
  ): Promise<DataromaScreenerSession> {
    const session = await this.loadSessionOrThrow(sessionId);
    if (!session.dataroma) {
      throw new Error('Dataroma scrape not completed. Run step 1 first.');
    }

    const step = this.getOrCreateStepState(session, 'universe');
    await this.persistSession(session);

    try {
      const universe = await this.buildUniverse(options?.useCache ?? true);
      session.providerUniverse = universe;
      this.updateStepState(step, 'complete', {
        exchanges: universe.exchanges.payload.length,
        symbolBatches: Object.keys(universe.symbols).length,
      });
      await this.persistSession(session);
    } catch (error) {
      this.updateStepState(step, 'blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.persistSession(session);
      throw error;
    }

    return session;
  }

  async runMatchStep(sessionId: string): Promise<DataromaScreenerSession> {
    const session = await this.loadSessionOrThrow(sessionId);
    if (!session.dataroma) {
      throw new Error('Dataroma scrape not completed. Run step 1 first.');
    }
    if (!session.providerUniverse) {
      throw new Error('Stock universe not available. Run step 2 first.');
    }

    const step = this.getOrCreateStepState(session, 'match');
    await this.persistSession(session);

    try {
      const matches = await this.generateMatches(session);
      session.matches = matches;
      this.updateStepState(step, 'complete', {
        matches: matches.length,
      });
      await this.persistSession(session);
    } catch (error) {
      this.updateStepState(step, 'blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.persistSession(session);
      throw error;
    }

    return session;
  }

  private async loadSessionOrThrow(sessionId: string): Promise<DataromaScreenerSession> {
    if (!this.config.store) {
      throw new Error('Session store not configured.');
    }
    const session = await this.config.store.load(sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }
    return session;
  }

  private getOrCreateStepState(
    session: DataromaScreenerSession,
    step: DataromaScreenerStepState['step'],
  ): DataromaScreenerStepState {
    const existing = session.steps.find((entry) => entry.step === step);
    if (existing) {
      existing.status = 'running';
      existing.context = undefined;
      return existing;
    }
    const created = this.createStepState(step, 'running');
    session.steps.push(created);
    return created;
  }

  private async buildUniverse(
    useCache: boolean,
  ): Promise<NonNullable<DataromaScreenerSession['providerUniverse']>> {
    const exchanges = await this.config.provider.getExchanges({ useCache });
    const symbols: Record<string, CachedPayload<SymbolRecord[]>> = {};

    const selected = exchanges.payload.slice(0, this.config.maxSymbolExchanges ?? exchanges.payload.length);
    for (const entry of selected) {
      symbols[entry.code] = await this.config.provider.getSymbols(entry.code, { useCache });
    }

    return {
      exchanges,
      symbols,
    };
  }

  private async generateMatches(session: DataromaScreenerSession): Promise<MatchCandidate[]> {
    if (!session.dataroma) {
      throw new Error('Dataroma scrape not completed.');
    }
    if (!session.providerUniverse) {
      throw new Error('Provider universe not available.');
    }

    const providerSymbols = Object.values(session.providerUniverse.symbols).flatMap(
      (payload) => payload.payload,
    );

    return this.config.matchEngine.generateCandidates(session.dataroma.entries, providerSymbols);
  }

  async loadSession(id: string): Promise<DataromaScreenerSession | null> {
    if (!this.config.store) {
      return null;
    }
    return this.config.store.load(id);
  }

  private createStepState(
    step: DataromaScreenerStepState['step'],
    status: DataromaScreenerStepState['status'],
    context?: Record<string, unknown>,
  ): DataromaScreenerStepState {
    return { step, status, context };
  }

  private updateStepState(
    step: DataromaScreenerStepState,
    status: DataromaScreenerStepState['status'],
    context?: Record<string, unknown>,
  ): void {
    step.status = status;
    step.context = context;
  }

  private async persistSession(session: DataromaScreenerSession): Promise<void> {
    if (this.config.store) {
      await this.config.store.save(session);
    }
  }
}

export interface DataromaScreenerRunOptions {
  cache?: Partial<CachePreferences>;
  minPercent?: number;
  cacheToken?: string;
  maxEntries?: number;
}

export interface UniverseStepRunOptions {
  useCache?: boolean;
}

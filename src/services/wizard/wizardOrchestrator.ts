import { randomUUID } from 'crypto';
import {
  CachedPayload,
  DataromaScraper,
  ExchangeSummary,
  FundamentalsProvider,
  MatchCandidate,
  MatchEngine,
  ScrapeOptions,
  SymbolRecord,
  WizardSession,
  WizardSessionStore,
  WizardStepState,
} from '../../domain/contracts';

export interface WizardOrchestratorConfig {
  scraper: DataromaScraper;
  provider: FundamentalsProvider;
  matchEngine: MatchEngine;
  maxSymbolExchanges?: number;
  store?: WizardSessionStore;
}

export class WizardOrchestrator {
  constructor(private readonly config: WizardOrchestratorConfig) {}

  async startSession(opts: ScrapeOptions): Promise<WizardSession> {
    const steps: WizardStepState[] = [];
    const session: WizardSession = {
      id: randomUUID(),
      createdAt: new Date(),
      steps,
    };

    steps.push(this.createStepState('scrape', 'running', { minPercent: opts.minPercent ?? 0 }));
    await this.persistSession(session);

    try {
      session.dataroma = await this.config.scraper.scrapeGrandPortfolio(opts);
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

    steps.push(this.createStepState('universe', 'running'));
    await this.persistSession(session);
    try {
      const universe = await this.buildUniverse();
      session.providerUniverse = universe;
      this.updateStepState(steps[1], 'complete', {
        exchanges: universe.exchanges.payload.length,
        symbolBatches: Object.keys(universe.symbols).length,
      });
      await this.persistSession(session);
    } catch (error) {
      this.updateStepState(steps[1], 'blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.persistSession(session);
      throw error;
    }

    steps.push(this.createStepState('match', 'running'));
    await this.persistSession(session);
    try {
      const matches = await this.generateMatches(session);
      session.matches = matches;
      this.updateStepState(steps[2], 'complete', {
        matches: matches.length,
      });
      await this.persistSession(session);
    } catch (error) {
      this.updateStepState(steps[2], 'blocked', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.persistSession(session);
      throw error;
    }

    return session;
  }

  private async buildUniverse(): Promise<NonNullable<WizardSession['providerUniverse']>> {
    const exchanges = await this.config.provider.getExchanges();
    const symbols: Record<string, CachedPayload<SymbolRecord[]>> = {};

    const selected = exchanges.payload.slice(0, this.config.maxSymbolExchanges ?? exchanges.payload.length);
    for (const entry of selected) {
      symbols[entry.code] = await this.config.provider.getSymbols(entry.code);
    }

    return {
      exchanges,
      symbols,
    };
  }

  private async generateMatches(session: WizardSession): Promise<MatchCandidate[]> {
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

  async loadSession(id: string): Promise<WizardSession | null> {
    if (!this.config.store) {
      return null;
    }
    return this.config.store.load(id);
  }

  private createStepState(
    step: WizardStepState['step'],
    status: WizardStepState['status'],
    context?: Record<string, unknown>,
  ): WizardStepState {
    return { step, status, context };
  }

  private updateStepState(
    step: WizardStepState,
    status: WizardStepState['status'],
    context?: Record<string, unknown>,
  ): void {
    step.status = status;
    step.context = context;
  }

  private async persistSession(session: WizardSession): Promise<void> {
    if (this.config.store) {
      await this.config.store.save(session);
    }
  }
}

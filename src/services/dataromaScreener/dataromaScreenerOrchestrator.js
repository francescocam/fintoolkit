"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataromaScreenerOrchestrator = void 0;
const crypto_1 = require("crypto");
class DataromaScreenerOrchestrator {
    constructor(config) {
        this.config = config;
    }
    async startSession(options) {
        const steps = [];
        const session = {
            id: (0, crypto_1.randomUUID)(),
            createdAt: new Date(),
            steps,
        };
        const cachePrefs = options?.cache ?? {};
        const scrapeOptions = {
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
        }
        catch (error) {
            this.updateStepState(steps[0], 'blocked', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            await this.persistSession(session);
            throw error;
        }
        return session;
    }
    async runUniverseStep(sessionId, options) {
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
        }
        catch (error) {
            this.updateStepState(step, 'blocked', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            await this.persistSession(session);
            throw error;
        }
        return session;
    }
    async runMatchStep(sessionId) {
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
        }
        catch (error) {
            this.updateStepState(step, 'blocked', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            await this.persistSession(session);
            throw error;
        }
        return session;
    }
    async loadSessionOrThrow(sessionId) {
        if (!this.config.store) {
            throw new Error('Session store not configured.');
        }
        const session = await this.config.store.load(sessionId);
        if (!session) {
            throw new Error('Session not found.');
        }
        return session;
    }
    getOrCreateStepState(session, step) {
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
    async buildUniverse(useCache) {
        const exchanges = await this.config.provider.getExchanges({ useCache });
        const symbols = {};
        const selected = exchanges.payload.slice(0, this.config.maxSymbolExchanges ?? exchanges.payload.length);
        for (const entry of selected) {
            symbols[entry.code] = await this.config.provider.getSymbols(entry.code, { useCache });
        }
        return {
            exchanges,
            symbols,
        };
    }
    async generateMatches(session) {
        if (!session.dataroma) {
            throw new Error('Dataroma scrape not completed.');
        }
        if (!session.providerUniverse) {
            throw new Error('Provider universe not available.');
        }
        let unmatchedDataromaEntries = [...session.dataroma.entries];
        const allMatches = [];
        for (const exchangeCode in session.providerUniverse.symbols) {
            if (unmatchedDataromaEntries.length === 0) {
                break; // All entries have been matched
            }
            const providerSymbols = session.providerUniverse.symbols[exchangeCode].payload;
            if (providerSymbols.length === 0) {
                continue;
            }
            const matches = await this.config.matchEngine.generateCandidates(unmatchedDataromaEntries, providerSymbols);
            const newMatches = matches.filter(match => match.providerSymbol);
            allMatches.push(...newMatches);
            const matchedDataromaSymbols = new Set(newMatches.map(match => match.dataromaSymbol));
            unmatchedDataromaEntries = unmatchedDataromaEntries.filter(entry => !matchedDataromaSymbols.has(entry.symbol));
        }
        // Add any remaining unmatched entries to the list
        unmatchedDataromaEntries.forEach(entry => {
            allMatches.push({
                dataromaSymbol: entry.symbol,
                dataromaName: entry.stock,
                providerSymbol: undefined,
                confidence: 0,
                reasons: ['No match found across all exchanges'],
            });
        });
        return allMatches;
    }
    async loadSession(id) {
        if (!this.config.store) {
            return null;
        }
        return this.config.store.load(id);
    }
    createStepState(step, status, context) {
        return { step, status, context };
    }
    updateStepState(step, status, context) {
        step.status = status;
        step.context = context;
    }
    async persistSession(session) {
        if (this.config.store) {
            await this.config.store.save(session);
        }
    }
}
exports.DataromaScreenerOrchestrator = DataromaScreenerOrchestrator;

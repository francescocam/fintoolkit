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
exports.DataromaScreenerOrchestrator = void 0;
/// <reference types="node" />
const crypto_1 = require("crypto");
const worker_threads_1 = require("worker_threads");
const path = __importStar(require("path"));
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
            const universe = await this.buildUniverse(options?.useCache ?? true, options?.commonStock);
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
    async runMatchStep(sessionId, options) {
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
            const matches = await this.generateMatches(session, options);
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
    async buildUniverse(useCache, commonStock) {
        const exchanges = await this.config.provider.getExchanges({ useCache });
        const symbols = {};
        const selected = exchanges.payload.slice(0, this.config.maxSymbolExchanges ?? exchanges.payload.length);
        for (const entry of selected) {
            symbols[entry.code] = await this.config.provider.getSymbols(entry.code, { useCache, commonStock });
        }
        return {
            exchanges,
            symbols,
        };
    }
    async generateMatches(session, options) {
        if (!session.dataroma) {
            throw new Error('Dataroma scrape not completed.');
        }
        if (!session.providerUniverse) {
            throw new Error('Provider universe not available.');
        }
        // Try to load from cache if available
        if (this.config.cache && options?.useCache !== false) {
            const cacheKey = `matches-${session.dataroma.entries.length}-${Object.keys(session.providerUniverse.symbols).length}-${options?.commonStock ? 'common' : 'all'}`;
            const cached = await this.config.cache.read({
                provider: 'system',
                scope: 'matches',
                key: cacheKey,
            });
            if (cached) {
                return cached.payload;
            }
        }
        const allMatches = [];
        let unmatchedDataromaEntries = [...session.dataroma.entries];
        const workerPromises = [];
        for (const exchangeCode in session.providerUniverse.symbols) {
            let providerSymbols = session.providerUniverse.symbols[exchangeCode].payload;
            if (options?.commonStock) {
                providerSymbols = providerSymbols.filter((s) => s.type === 'Common Stock');
            }
            if (providerSymbols.length === 0) {
                continue;
            }
            const workerPromise = new Promise((resolve, reject) => {
                const worker = new worker_threads_1.Worker(path.resolve(__dirname, '../matching/matchingWorker.js'), {
                    workerData: {
                        unmatchedDataromaEntries: unmatchedDataromaEntries,
                        providerSymbols: providerSymbols,
                    },
                });
                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            });
            workerPromises.push(workerPromise);
        }
        const results = await Promise.all(workerPromises);
        const matches = results.flat();
        const newMatches = matches.filter(match => match.providerSymbol);
        allMatches.push(...newMatches);
        const matchedDataromaSymbols = new Set(newMatches.map(match => match.dataromaSymbol));
        unmatchedDataromaEntries = unmatchedDataromaEntries.filter(entry => !matchedDataromaSymbols.has(entry.symbol));
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
        // Save to cache
        if (this.config.cache) {
            const cacheKey = `matches-${session.dataroma.entries.length}-${Object.keys(session.providerUniverse.symbols).length}-${options?.commonStock ? 'common' : 'all'}`;
            await this.config.cache.write({
                provider: 'system',
                scope: 'matches',
                key: cacheKey,
            }, allMatches);
        }
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

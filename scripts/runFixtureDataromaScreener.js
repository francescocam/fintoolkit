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
const path = __importStar(require("path"));
const dataromaScraper_1 = require("../src/services/scraper/dataromaScraper");
const localFixtureHttpClient_1 = require("../src/providers/localFixtureHttpClient");
const inMemoryCacheStore_1 = require("../src/services/cache/inMemoryCacheStore");
const dataromaScreenerOrchestrator_1 = require("../src/services/dataromaScreener/dataromaScreenerOrchestrator");
const dataromaScreenerSessionStore_1 = require("../src/services/dataromaScreener/dataromaScreenerSessionStore");
const eodhdProvider_1 = require("../src/providers/eodhdProvider");
const basicMatchEngine_1 = require("../src/services/matching/basicMatchEngine");
async function main() {
    const fixturesRoot = path.join(__dirname, '..', 'fixtures');
    const dataromaFixture = path.join(fixturesRoot, 'dataroma', 'grand-portfolio.html');
    const eodhdFixture = (file) => path.join(fixturesRoot, 'eodhd', file);
    const httpClient = new localFixtureHttpClient_1.LocalFixtureHttpClient({
        fixtures: {
            'https://www.dataroma.com/m/g/portfolio.php': dataromaFixture,
            'https://eodhd.com/api/exchanges-list?api_token=demo&fmt=json': eodhdFixture('exchanges.json'),
            'https://eodhd.com/api/exchange-symbol-list/US?api_token=demo&fmt=json&type=common_stock': eodhdFixture('symbols-US.json'),
            'https://eodhd.com/api/exchange-symbol-list/LSE?api_token=demo&fmt=json&type=common_stock': eodhdFixture('symbols-LSE.json'),
            'https://eodhd.com/api/exchange-symbol-list/TO?api_token=demo&fmt=json&type=common_stock': eodhdFixture('symbols-TO.json'),
        },
    });
    const scraper = new dataromaScraper_1.DataromaScraperService({
        client: httpClient,
        cache: new inMemoryCacheStore_1.InMemoryCacheStore(),
    });
    const provider = new eodhdProvider_1.EodhdProvider({
        apiToken: 'demo',
        client: httpClient,
        cache: new inMemoryCacheStore_1.InMemoryCacheStore(),
    });
    const sessionStore = new dataromaScreenerSessionStore_1.DataromaScreenerFileSessionStore({
        baseDir: path.join(__dirname, '..', '.dataroma-screener-sessions'),
    });
    const matchEngine = new basicMatchEngine_1.BasicMatchEngine();
    const screener = new dataromaScreenerOrchestrator_1.DataromaScreenerOrchestrator({
        scraper,
        provider,
        matchEngine,
        maxSymbolExchanges: 2,
        store: sessionStore,
    });
    const session = await screener.startSession({
        cache: {
            dataromaScrape: false,
        },
    });
    const scrapeStep = session.steps.find((step) => step.step === 'scrape');
    const universeSession = await screener.runUniverseStep(session.id, { useCache: false });
    const universeStep = universeSession.steps.find((step) => step.step === 'universe');
    const matchSession = await screener.runMatchStep(session.id);
    const matchStep = matchSession.steps.find((step) => step.step === 'match');
    console.log('Dataroma Screener scrape step completed:');
    console.log(JSON.stringify(scrapeStep, null, 2));
    console.log(`Sample entries (${session.dataroma?.entries.length ?? 0} total):`);
    console.log(session.dataroma?.entries.slice(0, 5));
    console.log('\nUniverse step summary:');
    console.log(JSON.stringify(universeStep, null, 2));
    const symbolKeys = Object.keys(universeSession.providerUniverse?.symbols ?? {});
    console.log('Fetched symbol batches for exchanges:', symbolKeys);
    console.log('\nMatch step summary:');
    console.log(JSON.stringify(matchStep, null, 2));
    console.log('Sample matches:', matchSession.matches?.slice(0, 5));
    const savedPath = path.join(sessionStore.getBaseDir(), `${session.id}.json`);
    console.log(`\nSession persisted to: ${savedPath}`);
    const reloaded = await screener.loadSession(session.id);
    console.log('Reloaded session matches count:', reloaded?.matches?.length ?? 0);
}
main().catch((error) => {
    console.error('Fixture Dataroma Screener run failed:', error);
    process.exitCode = 1;
});

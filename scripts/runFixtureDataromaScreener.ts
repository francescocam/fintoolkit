import * as path from 'path';
import { DataromaScraperService } from '../src/services/scraper/dataromaScraper';
import { LocalFixtureHttpClient } from '../src/providers/localFixtureHttpClient';
import { InMemoryCacheStore } from '../src/services/cache/inMemoryCacheStore';
import { DataromaScreenerOrchestrator } from '../src/services/dataromaScreener/dataromaScreenerOrchestrator';
import { EodhdProvider } from '../src/providers/eodhdProvider';
import { BasicMatchEngine } from '../src/services/matching/basicMatchEngine';
import { DataromaScreenerFileSessionStore } from '../src/services/dataromaScreener/dataromaScreenerSessionStore';

async function main(): Promise<void> {
  const fixturesRoot = path.join(__dirname, '..', 'fixtures');
  const dataromaFixture = path.join(fixturesRoot, 'dataroma', 'grand-portfolio.html');
  const eodhdFixture = (file: string) => path.join(fixturesRoot, 'eodhd', file);

  const httpClient = new LocalFixtureHttpClient({
    fixtures: {
      'https://www.dataroma.com/m/g/portfolio.php': dataromaFixture,
      'https://eodhd.com/api/exchanges-list?api_token=demo&fmt=json': eodhdFixture('exchanges.json'),
      'https://eodhd.com/api/exchange-symbol-list/US?api_token=demo&fmt=json&type=common_stock':
        eodhdFixture('symbols-US.json'),
      'https://eodhd.com/api/exchange-symbol-list/LSE?api_token=demo&fmt=json&type=common_stock':
        eodhdFixture('symbols-LSE.json'),
      'https://eodhd.com/api/exchange-symbol-list/TO?api_token=demo&fmt=json&type=common_stock':
        eodhdFixture('symbols-TO.json'),
    },
  });

  const scraper = new DataromaScraperService({
    client: httpClient,
    cache: new InMemoryCacheStore(),
  });

  const provider = new EodhdProvider({
    apiToken: 'demo',
    client: httpClient,
    cache: new InMemoryCacheStore(),
  });

  const sessionStore = new DataromaScreenerFileSessionStore({
    baseDir: path.join(__dirname, '..', '.dataroma-screener-sessions'),
  });

  const matchEngine = new BasicMatchEngine();

  const screener = new DataromaScreenerOrchestrator({
    scraper,
    provider,
    matchEngine,
    maxSymbolExchanges: 2,
    store: sessionStore,
  });
  const session = await screener.startSession({
    cache: {
      dataromaScrape: false,
      stockUniverse: false,
    },
  });

  const scrapeStep = session.steps.find((step) => step.step === 'scrape');
  const universeStep = session.steps.find((step) => step.step === 'universe');
  const matchStep = session.steps.find((step) => step.step === 'match');

  console.log('Dataroma Screener scrape step completed:');
  console.log(JSON.stringify(scrapeStep, null, 2));
  console.log(`Sample entries (${session.dataroma?.entries.length ?? 0} total):`);
  console.log(session.dataroma?.entries.slice(0, 5));

  console.log('\nUniverse step summary:');
  console.log(JSON.stringify(universeStep, null, 2));
  const symbolKeys = Object.keys(session.providerUniverse?.symbols ?? {});
  console.log('Fetched symbol batches for exchanges:', symbolKeys);

  console.log('\nMatch step summary:');
  console.log(JSON.stringify(matchStep, null, 2));
  console.log('Sample matches:', session.matches?.slice(0, 5));

  const savedPath = path.join(sessionStore.getBaseDir(), `${session.id}.json`);
  console.log(`\nSession persisted to: ${savedPath}`);

  const reloaded = await screener.loadSession(session.id);
  console.log('Reloaded session matches count:', reloaded?.matches?.length ?? 0);
}

main().catch((error) => {
  console.error('Fixture Dataroma Screener run failed:', error);
  process.exitCode = 1;
});

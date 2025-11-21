import * as path from 'path';
import { DataromaScraperService } from '../src/services/scraper/dataromaScraper';
import { LocalFixtureHttpClient } from '../src/providers/localFixtureHttpClient';
import { InMemoryCacheStore } from '../src/services/cache/inMemoryCacheStore';
import { DataromaScreenerOrchestrator } from '../src/services/dataromaScreener/dataromaScreenerOrchestrator';
import { DataromaScreenerFileSessionStore } from '../src/services/dataromaScreener/dataromaScreenerSessionStore';
import { EodhdProvider } from '../src/providers/eodhdProvider';
import { FuseMatchEngine } from '../src/services/matching/fuseMatchEngine';

async function main(): Promise<void> {
  const fixturesRoot = path.join(__dirname, '..', 'fixtures');
  const dataromaFixture = path.join(fixturesRoot, 'dataroma', 'grand-portfolio.html');
  const eodhdFixture = (file: string) => path.join(fixturesRoot, 'eodhd', file);

  const httpClient = new LocalFixtureHttpClient({
    fixtures: {
      'https://www.dataroma.com/m/g/portfolio.php': dataromaFixture,
      'https://eodhd.com/api/exchanges-list?api_token=demo&fmt=json': eodhdFixture('exchanges.json'),
      'https://eodhd.com/api/exchange-symbol-list/US?api_token=demo&fmt=json': eodhdFixture('symbols-US.json'),
      'https://eodhd.com/api/exchange-symbol-list/LSE?api_token=demo&fmt=json': eodhdFixture('symbols-LSE.json'),
      'https://eodhd.com/api/exchange-symbol-list/TO?api_token=demo&fmt=json': eodhdFixture('symbols-TO.json'),
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

  const matchEngine = new FuseMatchEngine();

  const screener = new DataromaScreenerOrchestrator({
    scraper,
    provider,
    matchEngine,
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

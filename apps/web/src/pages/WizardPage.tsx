import WizardStepper from '../components/WizardStepper';
import DataTable from '../components/DataTable';

const dataromaRows = [
  { symbol: 'MSFT', stock: 'Microsoft Corp.', ownership: 35 },
  { symbol: 'AMZN', stock: 'Amazon.com Inc.', ownership: 25 },
  { symbol: 'GOOGL', stock: 'Alphabet Inc.', ownership: 32 },
];

const matchRows = [
  { symbol: 'MSFT', eodhdSymbol: 'MSFT.US', confidence: 1 },
  { symbol: 'AMZN', eodhdSymbol: 'AMZN.US', confidence: 1 },
  { symbol: 'BRK.B', eodhdSymbol: '—', confidence: 0 },
];

const wizardSteps = [
  { key: 'scrape', label: 'Scrape Dataroma', status: 'complete' as const },
  { key: 'universe', label: 'Build Provider Universe', status: 'complete' as const },
  { key: 'match', label: 'Match Symbols', status: 'running' as const },
  { key: 'validate', label: 'Validate Picks', status: 'pending' as const },
  { key: 'screener', label: 'Review Screener', status: 'pending' as const },
];

const WizardPage = () => {
  return (
    <section className="panel">
      <header className="panel-heading">
        <div>
          <h2>Screening Wizard</h2>
          <p>Follow the guided flow to reconcile Dataroma holdings with EODHD fundamentals.</p>
        </div>
        <button type="button" className="primary">Start new session</button>
      </header>

      <WizardStepper steps={wizardSteps} />

      <div className="grid two-column">
        <article>
          <h3>Dataroma holdings (preview)</h3>
          <DataTable
            columns={[
              { header: 'Symbol', accessor: 'symbol' },
              { header: 'Stock', accessor: 'stock' },
              { header: 'Ownership', accessor: (row) => `${row.ownership}%` },
            ]}
            rows={dataromaRows}
            emptyMessage="Run the scraper to populate this table."
          />
        </article>

        <article>
          <h3>Match suggestions</h3>
          <DataTable
            columns={[
              { header: 'Dataroma', accessor: 'symbol' },
              { header: 'EODHD', accessor: 'eodhdSymbol' },
              { header: 'Confidence', accessor: (row) => `${Math.round(row.confidence * 100)}%` },
            ]}
            rows={matchRows}
            emptyMessage="Matches appear once the universe is built."
          />
        </article>
      </div>

      <div className="panel-footer">
        <button type="button">Use cached data</button>
        <button type="button" className="primary">
          Continue to validation
        </button>
      </div>
    </section>
  );
};

export default WizardPage;

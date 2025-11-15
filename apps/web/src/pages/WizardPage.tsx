import WizardStepper from '../components/WizardStepper';
import DataTable from '../components/DataTable';
import { useWizardSession } from '../hooks/useWizardSession';
import { WizardStepState } from '../types/wizard';

const defaultSteps: WizardStepState[] = [
  { step: 'scrape', status: 'pending' },
  { step: 'universe', status: 'pending' },
  { step: 'match', status: 'pending' },
  { step: 'validate', status: 'pending' },
  { step: 'screener', status: 'pending' },
];

const mapStatus = (status: WizardStepState['status']) => {
  if (status === 'complete') {
    return 'complete';
  }
  if (status === 'running') {
    return 'running';
  }
  return 'pending';
};

const WizardPage = () => {
  const { session, loading, starting, error, startNewSession } = useWizardSession();

  const dataromaRows = session?.dataroma?.entries ?? [];
  const matchRows = session?.matches ?? [];
  const steps = session?.steps ?? defaultSteps;
  const universeSummary = session?.providerUniverse?.exchanges.payload ?? [];
  const symbolBatchCount = session?.providerUniverse ? Object.keys(session.providerUniverse.symbols).length : 0;

  return (
    <section className="panel">
      <header className="panel-heading">
        <div>
          <h2>Screening Wizard</h2>
          <p>Follow the guided flow to reconcile Dataroma holdings with EODHD fundamentals.</p>
        </div>
        <div className="button-group">
          <button type="button" onClick={() => startNewSession(true)} disabled={starting}>
            Use cached data
          </button>
          <button type="button" className="primary" onClick={() => startNewSession(false)} disabled={starting}>
            {starting ? 'Starting…' : 'Start new session'}
          </button>
        </div>
      </header>

      {error && <p className="alert error">{error}</p>}
      {loading ? (
        <p className="alert info">Loading wizard session…</p>
      ) : (
        <>
          <WizardStepper
            steps={steps.map((step) => ({
              key: step.step,
              label: step.step.charAt(0).toUpperCase() + step.step.slice(1),
              status: mapStatus(step.status),
            }))}
          />

          <div className="summary-grid">
            <div className="summary-card">
              <p className="summary-label">Exchanges fetched</p>
              <p className="summary-value">{universeSummary.length}</p>
            </div>
            <div className="summary-card">
              <p className="summary-label">Symbol batches</p>
              <p className="summary-value">{symbolBatchCount}</p>
            </div>
            <div className="summary-card">
              <p className="summary-label">Match suggestions</p>
              <p className="summary-value">{matchRows.length}</p>
            </div>
          </div>

          <div className="grid two-column">
            <article>
              <h3>Dataroma holdings</h3>
              <DataTable
                columns={[
                  { header: 'Symbol', accessor: 'symbol' },
                  { header: 'Stock', accessor: 'stock' },
                ]}
                rows={dataromaRows}
                emptyMessage="Run the scraper to populate this table."
              />
            </article>

            <article>
              <h3>Match suggestions</h3>
              <DataTable
                columns={[
                  { header: 'Dataroma', accessor: 'dataromaSymbol' },
                  {
                    header: 'EODHD',
                    accessor: (row) => row.providerSymbol?.code ?? '—',
                  },
                  {
                    header: 'Confidence',
                    accessor: (row) => `${Math.round(row.confidence * 100)}%`,
                  },
                ]}
                rows={matchRows}
                emptyMessage="Matches appear once the universe is built."
              />
            </article>
          </div>

          <div className="panel-footer">
            <button type="button">Preview screener</button>
            <button type="button" className="primary">
              Continue to validation
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default WizardPage;

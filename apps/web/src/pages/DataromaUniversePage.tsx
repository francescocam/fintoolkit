import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataromaScreenerSession } from '../hooks/useDataromaScreenerSession';
import { useCachePreference } from '../hooks/useCachePreference';

const DataromaUniversePage = () => {
  const navigate = useNavigate();
  const { session, loading, universeLoading, error, buildUniverse } = useDataromaScreenerSession();
  const {
    useCache,
    loading: prefLoading,
    saving: prefSaving,
    error: prefError,
    setUseCache,
  } = useCachePreference('stockUniverse');

  const [commonStockOnly, setCommonStockOnly] = useState(true);

  const universeRows = useMemo(() => {
    if (!session?.providerUniverse) {
      return [];
    }
    return Object.values(session.providerUniverse.symbols)
      .flatMap((payload) => payload.payload.map((symbol) => ({ code: symbol.code, name: symbol.name })))
      .slice(0, 50);
  }, [session]);

  return (
    <section className="dataroma-screener-page">
      <header className="dataroma-screener-hero">
        <h2>Dataroma Screener</h2>
        <p>Step 2 - get stock universe from EODHD</p>
        <div className="dataroma-screener-actions">
          <button
            type="button"
            className="pill-button"
            onClick={() => void buildUniverse({ cache: { stockUniverse: useCache }, commonStock: commonStockOnly })}
            disabled={universeLoading || prefLoading || !session?.dataroma}
          >
            {universeLoading ? 'Fetching...' : 'Get Data'}
          </button>
          <button
            type="button"
            className={`toggle-pill${commonStockOnly ? ' active' : ''}`}
            onClick={() => setCommonStockOnly(!commonStockOnly)}
            disabled={universeLoading}
          >
            <span className="toggle-pill-label">Common Stock Only</span>
            <span className="toggle-indicator" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`toggle-pill${useCache ? ' active' : ''}`}
            onClick={() => setUseCache(!useCache)}
            disabled={prefSaving || prefLoading}
          >
            <span className="toggle-pill-label">Keep stock universe</span>
            <span className="toggle-indicator" aria-hidden="true" />
          </button>
        </div>
      </header>
      {(error || prefError) && <p className="alert error">{error ?? prefError}</p>}
      {!session?.dataroma && !loading && (
        <p className="alert info">Run Step 1 first to fetch the latest Dataroma scrape.</p>
      )}
      {loading ? (
        <p className="alert info">Loading EODHD universe...</p>
      ) : (
        <div className="dataroma-screener-table">
          <table>
            <thead>
              <tr>
                <th>EODHD Stock Code</th>
                <th>EODHD Stock Name</th>
              </tr>
            </thead>
            <tbody>
              {universeRows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="table-empty">
                    Fetch the stock universe to populate this table.
                  </td>
                </tr>
              ) : (
                universeRows.map((row) => (
                  <tr key={`${row.code}-${row.name}`}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="dataroma-screener-next">
        <button type="button" className="pill-button" onClick={() => navigate('/dataroma-screener/matches')}>
          Next step
        </button>
      </div>
    </section>
  );
};

export default DataromaUniversePage;

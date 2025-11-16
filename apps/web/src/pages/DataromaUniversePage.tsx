import { useMemo } from 'react';
import { useDataromaScreenerSession } from '../hooks/useDataromaScreenerSession';
import { useCachePreference } from '../hooks/useCachePreference';

const DataromaUniversePage = () => {
  const { session, loading, starting, error, startNewSession } = useDataromaScreenerSession();
  const {
    useCache,
    loading: prefLoading,
    saving: prefSaving,
    error: prefError,
    setUseCache,
  } = useCachePreference('stockUniverse');

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
            onClick={() => startNewSession({ cache: { stockUniverse: useCache } })}
            disabled={starting || prefLoading}
          >
            {starting ? 'Fetching...' : 'Get Data'}
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
        <button type="button" className="pill-button" disabled>
          Next step
        </button>
      </div>
    </section>
  );
};

export default DataromaUniversePage;

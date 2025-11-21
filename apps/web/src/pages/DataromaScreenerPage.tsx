import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDataromaScreenerSession } from '../hooks/useDataromaScreenerSession';
import { useCachePreference } from '../hooks/useCachePreference';

const DataromaScreenerPage = () => {
  const navigate = useNavigate();
  const { session, loading, starting, error, startNewSession } = useDataromaScreenerSession();
  const {
    useCache,
    loading: prefLoading,
    saving: prefSaving,
    error: prefError,
    setUseCache,
  } = useCachePreference('dataromaScrape');
  const [maxEntries, setMaxEntries] = useState('0');

  const dataromaRows = (session?.dataroma?.entries ?? []).slice(0, 30);

  return (
    <section className="dataroma-screener-page">
      <header className="dataroma-screener-hero">
        <h2>Dataroma Screener</h2>
        <p>Step 1 - get data from Dataroma</p>
        <div className="dataroma-screener-actions">
          <button
            type="button"
            className="pill-button"
            onClick={() =>
              startNewSession({
                cache: { dataromaScrape: useCache },
                maxEntries:
                  Number.isFinite(Number(maxEntries)) && Number(maxEntries) > 0
                    ? Number(maxEntries)
                    : undefined,
              })
            }
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
            <span className="toggle-pill-label">Keep previous scrape</span>
            <span className="toggle-indicator" aria-hidden="true" />
          </button>
          <label className="input-field">
            <span className="input-label">Limit rows (optional)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={maxEntries}
              onChange={(e) => setMaxEntries(e.target.value)}
              placeholder="20"
            />
          </label>
        </div>
      </header>
      {(error || prefError) && <p className="alert error">{error ?? prefError}</p>}
      {loading ? (
        <p className="alert info">Loading Dataroma Screener session...</p>
      ) : (
        <div className="dataroma-screener-table">
          <table>
            <thead>
              <tr>
                <th>Dataroma Stock Symbol</th>
                <th>Dataroma Stock Name</th>
              </tr>
            </thead>
            <tbody>
              {dataromaRows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="table-empty">
                    Run the scraper to populate this table.
                  </td>
                </tr>
              ) : (
                dataromaRows.map((row) => (
                  <tr key={`${row.symbol}-${row.stock}`}>
                    <td>{row.symbol}</td>
                    <td>{row.stock}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="dataroma-screener-next">
        <button type="button" className="pill-button" onClick={() => navigate('/dataroma-screener/universe')}>
          Next step
        </button>
      </div>
    </section>
  );
};

export default DataromaScreenerPage;

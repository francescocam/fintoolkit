import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataromaScreenerSession } from '../hooks/useDataromaScreenerSession';
import MatchSymbolSelect from '../components/MatchSymbolSelect';
import { updateMatch, SymbolSearchResult } from '../services/api';
import { MatchCandidate } from '../types/dataromaScreener';

const formatConfidence = (value?: number) => {
  if (typeof value !== 'number') {
    return '0%';
  }
  return `${Math.round(value * 100)}%`;
};

const DataromaMatchesPage = () => {
  const navigate = useNavigate();
  const { session, loading, error, matching, generateMatches, mutateSession } = useDataromaScreenerSession();
  const [rowUpdates, setRowUpdates] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!session?.matches) {
      return [];
    }
    return [...session.matches].sort((a, b) => {
      const scoreA = a.notAvailable ? 2 : a.confidence ?? 0;
      const scoreB = b.notAvailable ? 2 : b.confidence ?? 0;
      return scoreA - scoreB;
    });
  }, [session]);

  const persistMatchUpdate = useCallback(
    async (payload: { dataromaSymbol: string; providerSymbol?: SymbolSearchResult; notAvailable?: boolean }) => {
      setActionError(null);
      setRowUpdates((prev) => ({ ...prev, [payload.dataromaSymbol]: true }));
      try {
        const updated = await updateMatch(payload);
        mutateSession((current) => {
          if (!current.matches) {
            return current;
          }
          return {
            ...current,
            matches: current.matches.map((candidate) =>
              candidate.dataromaSymbol === updated.dataromaSymbol ? updated : candidate,
            ),
          };
        });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Unable to update match');
      } finally {
        setRowUpdates((prev) => {
          const next = { ...prev };
          delete next[payload.dataromaSymbol];
          return next;
        });
      }
    },
    [mutateSession],
  );

  const handleSymbolSelect = useCallback(
    (match: MatchCandidate, symbol: SymbolSearchResult) => {
      void persistMatchUpdate({
        dataromaSymbol: match.dataromaSymbol,
        providerSymbol: symbol,
        notAvailable: false,
      });
    },
    [persistMatchUpdate],
  );

  const handleMarkUnavailable = useCallback(
    (match: MatchCandidate) => {
      void persistMatchUpdate({
        dataromaSymbol: match.dataromaSymbol,
        notAvailable: true,
      });
    },
    [persistMatchUpdate],
  );

  return (
    <section className="dataroma-screener-page">
      <header className="dataroma-screener-hero">
        <h2>Dataroma Screener</h2>
        <p>Step 3 - Match Suggestions</p>
        <div className="dataroma-screener-actions">
          <button
            type="button"
            className="pill-button"
            onClick={() => void generateMatches()}
            disabled={matching || !session?.providerUniverse}
          >
            {matching ? 'Generating...' : 'Get Matches'}
          </button>
        </div>
      </header>
      {error && <p className="alert error">{error}</p>}
      {!session?.providerUniverse && !loading && (
        <p className="alert info">Run Step 2 first to fetch the stock universe.</p>
      )}
      {actionError && <p className="alert error">{actionError}</p>}
      {loading ? (
        <p className="alert info">Loading match suggestions...</p>
      ) : (
        <div className="dataroma-screener-table wide">
          <table>
            <thead>
              <tr>
                <th>Dataroma Stock Symbol</th>
                <th>Dataroma Stock Name</th>
                <th>EODHD Stock Code</th>
                <th>EODHD Stock Name</th>
                <th>Confidence</th>
                <th>Not Available</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Run the screener to populate match suggestions.
                  </td>
                </tr>
              ) : (
                matches.map((match) => (
                  <tr key={`${match.dataromaSymbol}-${match.dataromaName}`}>
                    <td>{match.dataromaSymbol}</td>
                    <td>{match.dataromaName}</td>
                    <td>
                      <div className="match-value">
                        <span className={`match-status${match.providerSymbol ? ' matched' : ''}`}>
                          {match.providerSymbol ? 'Matched' : 'No match'}
                        </span>
                        <span className="match-detail">{match.providerSymbol?.code ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="match-value">
                        <span className={`match-status${match.providerSymbol ? ' matched' : ''}`}>
                          {match.providerSymbol ? 'Matched' : 'No match'}
                        </span>
                        <MatchSymbolSelect
                          match={match}
                          disabled={Boolean(rowUpdates[match.dataromaSymbol])}
                          onSelect={(symbol) => handleSymbolSelect(match, symbol)}
                          onMarkUnavailable={() => handleMarkUnavailable(match)}
                        />
                      </div>
                    </td>
                    <td>
                      <span className="match-confidence">
                        {match.notAvailable ? '—' : formatConfidence(match.confidence)}
                      </span>
                    </td>
                    <td>
                      <span className={`not-available-flag${match.notAvailable ? ' active' : ''}`}>
                        {match.notAvailable ? 'Not available' : 'Included'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="dataroma-screener-next match-actions">
        <button type="button" className="pill-button" disabled>
          Next step
        </button>
        <button type="button" className="pill-button ghost" onClick={() => navigate('/dataroma-screener')}>
          Back to start
        </button>
      </div>
    </section>
  );
};

export default DataromaMatchesPage;

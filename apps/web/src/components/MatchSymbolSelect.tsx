import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchCandidate } from '../types/dataromaScreener';
import { searchUniverseSymbols, SymbolSearchResult } from '../services/api';

interface MatchSymbolSelectProps {
  match: MatchCandidate;
  disabled?: boolean;
  onSelect(symbol: SymbolSearchResult): void;
  onMarkUnavailable(): void;
}

const MatchSymbolSelect = ({ match, disabled, onSelect, onMarkUnavailable }: MatchSymbolSelectProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (match.providerSymbol) {
      setQuery(match.providerSymbol.name);
    } else if (!match.notAvailable) {
      setQuery('');
    }
  }, [match.providerSymbol?.code, match.providerSymbol?.name, match.notAvailable]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      searchUniverseSymbols(trimmedQuery)
        .then((payload) => {
          if (!cancelled) {
            setResults(payload);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmedQuery, open]);

  const handleOpen = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen(true);
  }, [disabled]);

  const handleSelect = useCallback(
    (symbol: SymbolSearchResult) => {
      onSelect(symbol);
      setOpen(false);
    },
    [onSelect],
  );

  const handleMarkUnavailable = useCallback(() => {
    onMarkUnavailable();
    setOpen(false);
    setResults([]);
    setQuery('');
  }, [onMarkUnavailable]);

  return (
    <div
      className={`symbol-search${open ? ' open' : ''}${match.notAvailable ? ' unavailable' : ''}`}
      ref={containerRef}
    >
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={match.notAvailable ? 'Not available' : 'Search EODHD stock name'}
        onFocus={handleOpen}
        onChange={(event) => setQuery(event.target.value)}
        className="match-symbol-input"
      />
      {open && (
        <div className="symbol-search-dropdown">
          {loading && <div className="symbol-search-status">Searching...</div>}
          {!loading && trimmedQuery.length >= 2 && results.length === 0 && (
            <div className="symbol-search-status">No matches found</div>
          )}
          {trimmedQuery.length < 2 && (
            <div className="symbol-search-status muted">Type at least 2 characters to search</div>
          )}
          <ul>
            {results.map((result) => (
              <li key={`${result.exchange}-${result.code}`}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(result);
                  }}
                >
                  <span className="symbol-name">{result.name}</span>
                  <span className="symbol-meta">
                    {result.code} • {result.exchange}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="not-available-option"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleMarkUnavailable();
                }}
              >
                Mark as not available
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default MatchSymbolSelect;

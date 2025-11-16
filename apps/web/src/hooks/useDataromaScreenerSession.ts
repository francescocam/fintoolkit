import { useCallback, useEffect, useState } from 'react';
import { fetchLatestSession, startNewSession, StartSessionOptions } from '../services/api';
import { DataromaScreenerSession } from '../types/dataromaScreener';

export interface UseDataromaScreenerSessionOptions {
  autoLoad?: boolean;
}

export const useDataromaScreenerSession = (options?: UseDataromaScreenerSessionOptions) => {
  const autoLoad = options?.autoLoad ?? true;
  const [session, setSession] = useState<DataromaScreenerSession | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLatestSession();
      setSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch session');
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(
    async (options?: StartSessionOptions) => {
      setStarting(true);
      setError(null);
      try {
        const result = await startNewSession(options);
        setSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start a new session');
      } finally {
        setStarting(false);
      }
    },
    [setSession],
  );

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void loadLatest();
  }, [autoLoad, loadLatest]);

  const mutateSession = useCallback(
    (updater: (session: DataromaScreenerSession) => DataromaScreenerSession) => {
      setSession((prev) => {
        if (!prev) {
          return prev;
        }
        return updater(prev);
      });
    },
    [],
  );

  return {
    session,
    loading,
    starting,
    error,
    refresh: loadLatest,
    startNewSession: createSession,
    mutateSession,
  };
};

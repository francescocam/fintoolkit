import { useCallback, useEffect, useState } from 'react';
import { fetchLatestSession, startNewSession, StartSessionOptions } from '../services/api';
import { DataromaScreenerSession } from '../types/dataromaScreener';

export const useDataromaScreenerSession = () => {
  const [session, setSession] = useState<DataromaScreenerSession | null>(null);
  const [loading, setLoading] = useState(true);
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
    loadLatest();
  }, [loadLatest]);

  return {
    session,
    loading,
    starting,
    error,
    refresh: loadLatest,
    startNewSession: createSession,
  };
};

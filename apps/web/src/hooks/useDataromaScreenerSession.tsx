import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchLatestSession,
  runMatchStep,
  runUniverseStep,
  startNewSession,
  StartSessionOptions,
  UniverseStepOptions,
} from '../services/api';
import { DataromaScreenerSession, DataromaScreenerStepState } from '../types/dataromaScreener';

export interface UseDataromaScreenerSessionOptions {
  autoLoad?: boolean;
}

const DataromaScreenerSessionContext = createContext<ReturnType<typeof useProvideSession> | null>(null);

interface ProviderProps {
  children: ReactNode;
  autoLoad?: boolean;
}

const useProvideSession = (options?: UseDataromaScreenerSessionOptions) => {
  const autoLoad = options?.autoLoad ?? true;
  const [session, setSession] = useState<DataromaScreenerSession | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [runningStep, setRunningStep] = useState<DataromaScreenerStepState['step'] | null>(null);
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
      setRunningStep('scrape');
      setError(null);
      try {
        const result = await startNewSession(options);
        setSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start a new session');
      } finally {
        setRunningStep(null);
      }
    },
    [],
  );

  const buildUniverse = useCallback(
    async (options?: UniverseStepOptions) => {
      if (!session?.id) {
        setError('No active session. Run step 1 first.');
        return;
      }
      setRunningStep('universe');
      setError(null);
      try {
        const result = await runUniverseStep(session.id, options);
        setSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to fetch stock universe');
      } finally {
        setRunningStep(null);
      }
    },
    [session?.id],
  );

  const generateMatches = useCallback(
    async (options?: { commonStock?: boolean }) => {
      if (!session?.id) {
        setError('No active session. Run previous steps first.');
        return;
      }
      setRunningStep('match');
      setError(null);
      try {
        const result = await runMatchStep(session.id, options);
        setSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to generate matches');
      } finally {
        setRunningStep(null);
      }
    },
    [session?.id],
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
    starting: runningStep === 'scrape',
    universeLoading: runningStep === 'universe',
    matching: runningStep === 'match',
    error,
    refresh: loadLatest,
    startNewSession: createSession,
    buildUniverse,
    generateMatches,
    mutateSession,
  };
};

export const DataromaScreenerSessionProvider = ({ children, autoLoad }: ProviderProps) => {
  const value = useProvideSession({ autoLoad });
  return <DataromaScreenerSessionContext.Provider value={value}>{children}</DataromaScreenerSessionContext.Provider>;
};

export const useDataromaScreenerSession = (options?: UseDataromaScreenerSessionOptions) => {
  const context = useContext(DataromaScreenerSessionContext);
  if (context) {
    return context;
  }
  return useProvideSession(options);
};

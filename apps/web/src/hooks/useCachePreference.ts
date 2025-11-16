import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSettings, saveSettings } from '../services/api';
import { AppSettings, CachePreferenceKey } from '../types/settings';

export const useCachePreference = (key: CachePreferenceKey) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = useMemo(() => `cachePreference:${key}`, [key]);
  const [preference, setPreference] = useState<boolean>(() => readStoredPreference(storageKey));

  useEffect(() => {
    setPreference(readStoredPreference(storageKey));
  }, [storageKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSettings();
      setSettings(result);
      const nextPreference = result.preferences.cache[key] ?? true;
      setPreference(nextPreference);
      persistStoredPreference(storageKey, nextPreference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load preferences');
    } finally {
      setLoading(false);
    }
  }, [key, storageKey]);

  const persistPreference = useCallback(
    async (useCache: boolean) => {
      if (!settings) {
        return;
      }
      const previousPreference = preference;
      setSaving(true);
      setError(null);
      setPreference(useCache);
      persistStoredPreference(storageKey, useCache);
      try {
        const updated = await saveSettings({
          ...settings,
          preferences: {
            ...settings.preferences,
            cache: {
              ...settings.preferences.cache,
              [key]: useCache,
            },
          },
        });
        setSettings(updated);
        const nextPreference = updated.preferences.cache[key] ?? useCache;
        setPreference(nextPreference);
        persistStoredPreference(storageKey, nextPreference);
      } catch (err) {
        setPreference(previousPreference);
        persistStoredPreference(storageKey, previousPreference);
        setError(err instanceof Error ? err.message : 'Unable to update preference');
      } finally {
        setSaving(false);
      }
    },
    [key, preference, settings, storageKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    useCache: preference,
    loading,
    saving,
    error,
    setUseCache: persistPreference,
    refresh: load,
  };
};

function readStoredPreference(storageKey: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) {
    return true;
  }
  return stored === 'true';
}

function persistStoredPreference(storageKey: string, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey, value ? 'true' : 'false');
}

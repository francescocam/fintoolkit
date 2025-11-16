import { useCallback, useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../services/api';
import { AppSettings, CachePreferenceKey } from '../types/settings';

export const useCachePreference = (key: CachePreferenceKey) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSettings();
      setSettings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  const persistPreference = useCallback(
    async (useCache: boolean) => {
      if (!settings) {
        return;
      }
      setSaving(true);
      setError(null);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to update preference');
      } finally {
        setSaving(false);
      }
    },
    [settings, key],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    useCache: settings?.preferences.cache[key] ?? true,
    loading,
    saving,
    error,
    setUseCache: persistPreference,
    refresh: load,
  };
};

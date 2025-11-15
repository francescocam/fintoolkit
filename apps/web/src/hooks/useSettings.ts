import { useCallback, useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../services/api';
import { AppSettings, defaultSettings } from '../types/settings';

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSettings();
      setSettings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const persistSettings = useCallback(
    async (updated: AppSettings) => {
      setSaving(true);
      setError(null);
      setMessage(null);
      try {
        const result = await saveSettings(updated);
        setSettings(result);
        setMessage('Preferences saved');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save settings');
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    setSettings,
    loading,
    saving,
    message,
    error,
    save: persistSettings,
  };
};

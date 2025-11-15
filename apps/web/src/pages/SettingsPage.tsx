import { FormEvent, useEffect, useState } from 'react';
import { useSettings } from '../hooks/useSettings';

const SettingsPage = () => {
  const { settings, loading, saving, message, error, save } = useSettings();
  const [apiKey, setApiKey] = useState('');
  const [defaultProvider, setDefaultProvider] = useState('eodhd');
  const [cachePreference, setCachePreference] = useState<'ask' | 'reuse' | 'ignore'>('ask');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const providerKeys = apiKey
      ? [
          ...settings.providerKeys.filter((key) => key.provider !== 'eodhd'),
          { provider: 'eodhd', apiKey, updatedAt: new Date().toISOString() },
        ]
      : settings.providerKeys.filter((key) => key.provider !== 'eodhd');

    const reuseCacheByDefault =
      cachePreference === 'reuse' ? true : cachePreference === 'ignore' ? false : settings.preferences.reuseCacheByDefault;

    void save({
      providerKeys,
      preferences: {
        defaultProvider,
        reuseCacheByDefault,
      },
    });
  };

  useEffect(() => {
    const eodKey = settings.providerKeys.find((key) => key.provider === 'eodhd');
    setApiKey(eodKey?.apiKey ?? '');
    setDefaultProvider(settings.preferences.defaultProvider);
    setCachePreference(settings.preferences.reuseCacheByDefault ? 'reuse' : 'ask');
  }, [settings]);

  return (
    <section className="panel">
      <header>
        <h2>Provider Settings</h2>
        <p>Store your EODHD API key and choose defaults for the screening workflow.</p>
      </header>
      {loading && <p className="alert info">Loading settings…</p>}
      {error && <p className="alert error">{error}</p>}
      <form className="form-grid" onSubmit={handleSubmit}>
        <label htmlFor="apiKey">EODHD API Key</label>
        <input
          id="apiKey"
          type="password"
          placeholder="Enter your API key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <label htmlFor="defaultProvider">Default Provider</label>
        <select id="defaultProvider" value={defaultProvider} onChange={(event) => setDefaultProvider(event.target.value)}>
          <option value="eodhd">EODHD</option>
        </select>
        <label htmlFor="cachePreference">Cache Preference</label>
        <select
          id="cachePreference"
          value={cachePreference}
          onChange={(event) => setCachePreference(event.target.value as typeof cachePreference)}
        >
          <option value="ask">Ask every time</option>
          <option value="reuse">Always reuse cached data</option>
          <option value="ignore">Always fetch fresh data</option>
        </select>
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </form>
    </section>
  );
};

export default SettingsPage;

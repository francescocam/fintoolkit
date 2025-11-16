import { FormEvent, useEffect, useState } from 'react';
import { useSettings } from '../hooks/useSettings';

const SettingsPage = () => {
  const { settings, loading, saving, message, error, save } = useSettings();
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const providerKeys = apiKey.trim()
      ? [
          ...settings.providerKeys.filter((key) => key.provider !== 'eodhd'),
          { provider: 'eodhd', apiKey: apiKey.trim(), updatedAt: new Date().toISOString() },
        ]
      : settings.providerKeys.filter((key) => key.provider !== 'eodhd');

    void save({
      providerKeys,
      preferences: settings.preferences,
    });
  };

  useEffect(() => {
    const eodKey = settings.providerKeys.find((key) => key.provider === 'eodhd');
    setApiKey(eodKey?.apiKey ?? '');
  }, [settings]);

  return (
    <section className="settings-page">
      <header className="settings-header">
        <h2>Provider Settings</h2>
      </header>
      {loading && <p className="alert info">Loading settings...</p>}
      {error && <p className="alert error">{error}</p>}
      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-field">
          <label htmlFor="apiKey">EODHD API Key</label>
          <input
            id="apiKey"
            type="text"
            placeholder="api key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="pill-input"
          />
        </div>
        <button type="submit" className="pill-button" disabled={saving}>
          {saving ? 'Saving...' : 'Save preferences'}
        </button>
        {message && <p className="form-message subtle">{message}</p>}
      </form>
    </section>
  );
};

export default SettingsPage;

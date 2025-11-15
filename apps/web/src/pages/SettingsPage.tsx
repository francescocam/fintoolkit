import { FormEvent, useState } from 'react';

const SettingsPage = () => {
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Placeholder persistence
    setMessage('Preferences saved locally (wire to secure storage later)');
  };

  return (
    <section className="panel">
      <header>
        <h2>Provider Settings</h2>
        <p>Store your EODHD API key and choose defaults for the screening workflow.</p>
      </header>
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
        <select id="defaultProvider" defaultValue="eodhd">
          <option value="eodhd">EODHD (current)</option>
          <option value="future" disabled>
            More providers coming soon
          </option>
        </select>
        <label htmlFor="cachePreference">Cache Preference</label>
        <select id="cachePreference" defaultValue="ask">
          <option value="ask">Ask every time</option>
          <option value="reuse">Always reuse cached data</option>
          <option value="ignore">Always fetch fresh data</option>
        </select>
        <div className="form-actions">
          <button type="submit" disabled={!apiKey}>
            Save preferences
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </form>
    </section>
  );
};

export default SettingsPage;

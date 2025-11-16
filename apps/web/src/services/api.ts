import { DataromaScreenerSession } from '../types/dataromaScreener';
import { AppSettings, CachePreferenceKey } from '../types/settings';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = await response.json();
      if (parsed?.error) {
        message = parsed.error;
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchLatestSession(): Promise<DataromaScreenerSession | null> {
  const response = await fetch(`${API_BASE}/dataroma-screener/session/latest`);
  if (response.status === 404) {
    return null;
  }
  return handleResponse<DataromaScreenerSession>(response);
}

export interface StartSessionOptions {
  minPercent?: number;
  cache?: Partial<Record<CachePreferenceKey, boolean>>;
  cacheToken?: string;
}

export async function startNewSession(options?: StartSessionOptions): Promise<DataromaScreenerSession> {
  const response = await fetch(`${API_BASE}/dataroma-screener/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options ?? {}),
  });
  return handleResponse<DataromaScreenerSession>(response);
}

export async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE}/settings`);
  return handleResponse<AppSettings>(response);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
  return handleResponse<AppSettings>(response);
}

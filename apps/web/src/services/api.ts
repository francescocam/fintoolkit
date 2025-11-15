import { WizardSession } from '../types/wizard';
import { AppSettings } from '../types/settings';

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

export async function fetchLatestSession(): Promise<WizardSession> {
  const response = await fetch(`${API_BASE}/session/latest`);
  return handleResponse<WizardSession>(response);
}

export async function startNewSession(options?: { useCache?: boolean; minPercent?: number }): Promise<WizardSession> {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options ?? {}),
  });
  return handleResponse<WizardSession>(response);
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

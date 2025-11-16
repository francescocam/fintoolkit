import { promises as fs } from 'fs';
import * as path from 'path';
import { AppSettings } from '../../domain/contracts';

export interface FileSettingsStoreOptions {
  filePath?: string;
}

const defaultSettings: AppSettings = {
  providerKeys: [],
  preferences: {
    defaultProvider: 'eodhd',
    cache: {
      dataromaScrape: true,
      stockUniverse: true,
    },
  },
};

export class FileSettingsStore {
  private readonly filePath: string;

  constructor(options?: FileSettingsStoreOptions) {
    this.filePath = options?.filePath ?? path.join(process.cwd(), '.config', 'settings.json');
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged = {
        ...defaultSettings,
        ...parsed,
        preferences: {
          ...defaultSettings.preferences,
          ...(parsed?.preferences ?? {}),
          cache: normalizeCachePreferences(parsed?.preferences),
        },
      };
      return merged;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return defaultSettings;
      }
      throw error;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await this.ensureDir();
    const payload = JSON.stringify(settings, null, 2);
    await fs.writeFile(this.filePath, payload, 'utf-8');
  }

  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}

function normalizeCachePreferences(preferences?: AppSettings['preferences']) {
  const defaultCache = defaultSettings.preferences.cache;
  const parsedCache = preferences?.cache ?? {};
  const legacy = (preferences as { reuseCacheByDefault?: boolean } | undefined)?.reuseCacheByDefault;

  return {
    ...defaultCache,
    ...parsedCache,
    ...(typeof legacy === 'boolean'
      ? {
          dataromaScrape: legacy,
          stockUniverse: legacy,
        }
      : {}),
  };
}

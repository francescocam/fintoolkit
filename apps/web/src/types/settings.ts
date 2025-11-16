export interface ProviderKey {
  provider: string;
  apiKey: string;
  updatedAt: string;
}

export interface CachePreferences {
  dataromaScrape: boolean;
  stockUniverse: boolean;
  [key: string]: boolean;
}

export interface AppSettings {
  providerKeys: ProviderKey[];
  preferences: {
    defaultProvider: string;
    cache: CachePreferences;
  };
}

export const defaultSettings: AppSettings = {
  providerKeys: [],
  preferences: {
    defaultProvider: 'eodhd',
    cache: {
      dataromaScrape: true,
      stockUniverse: true,
    },
  },
};

export type CachePreferenceKey = keyof CachePreferences;

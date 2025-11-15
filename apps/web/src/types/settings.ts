export interface ProviderKey {
  provider: string;
  apiKey: string;
  updatedAt: string;
}

export interface AppSettings {
  providerKeys: ProviderKey[];
  preferences: {
    defaultProvider: string;
    reuseCacheByDefault: boolean;
  };
}

export const defaultSettings: AppSettings = {
  providerKeys: [],
  preferences: {
    defaultProvider: 'eodhd',
    reuseCacheByDefault: true,
  },
};

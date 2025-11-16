"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSettingsStore = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const defaultSettings = {
    providerKeys: [],
    preferences: {
        defaultProvider: 'eodhd',
        cache: {
            dataromaScrape: true,
            stockUniverse: true,
        },
    },
};
class FileSettingsStore {
    constructor(options) {
        this.filePath = options?.filePath ?? path.join(process.cwd(), '.config', 'settings.json');
    }
    async load() {
        try {
            const raw = await fs_1.promises.readFile(this.filePath, 'utf-8');
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
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return defaultSettings;
            }
            throw error;
        }
    }
    async save(settings) {
        await this.ensureDir();
        const payload = JSON.stringify(settings, null, 2);
        await fs_1.promises.writeFile(this.filePath, payload, 'utf-8');
    }
    async ensureDir() {
        const dir = path.dirname(this.filePath);
        await fs_1.promises.mkdir(dir, { recursive: true });
    }
}
exports.FileSettingsStore = FileSettingsStore;
function normalizeCachePreferences(preferences) {
    const defaultCache = defaultSettings.preferences.cache;
    const parsedCache = preferences?.cache ?? {};
    const legacy = preferences?.reuseCacheByDefault;
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

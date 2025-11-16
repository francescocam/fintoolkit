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
exports.DataromaScreenerFileSessionStore = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
class DataromaScreenerFileSessionStore {
    constructor(options) {
        this.baseDir = options?.baseDir ?? path.join(process.cwd(), '.dataroma-screener-sessions');
    }
    getBaseDir() {
        return this.baseDir;
    }
    async load(id) {
        const filePath = this.filePath(id);
        try {
            const raw = await fs_1.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            return this.hydrateSession(parsed);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }
    async save(session) {
        await this.ensureDir();
        const filePath = this.filePath(session.id);
        const serialized = JSON.stringify(session, null, 2);
        await fs_1.promises.writeFile(filePath, serialized, 'utf-8');
    }
    filePath(id) {
        return path.join(this.baseDir, `${id}.json`);
    }
    async ensureDir() {
        await fs_1.promises.mkdir(this.baseDir, { recursive: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hydrateSession(raw) {
        const session = {
            ...raw,
            createdAt: new Date(raw.createdAt),
            steps: raw.steps ?? [],
        };
        if (raw.dataroma) {
            session.dataroma = {
                ...raw.dataroma,
                cachedPayload: raw.dataroma.cachedPayload
                    ? this.hydratePayload(raw.dataroma.cachedPayload)
                    : undefined,
            };
        }
        if (raw.providerUniverse) {
            const symbols = {};
            for (const [key, payload] of Object.entries(raw.providerUniverse.symbols ?? {})) {
                symbols[key] = this.hydratePayload(payload);
            }
            session.providerUniverse = {
                exchanges: this.hydratePayload(raw.providerUniverse.exchanges),
                symbols: symbols,
            };
        }
        return session;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hydratePayload(payload) {
        return {
            ...payload,
            descriptor: {
                ...payload.descriptor,
                expiresAt: payload.descriptor.expiresAt
                    ? new Date(payload.descriptor.expiresAt)
                    : undefined,
            },
            createdAt: new Date(payload.createdAt),
        };
    }
}
exports.DataromaScreenerFileSessionStore = DataromaScreenerFileSessionStore;

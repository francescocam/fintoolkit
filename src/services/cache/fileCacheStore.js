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
exports.FileCacheStore = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
class FileCacheStore {
    constructor(options) {
        this.baseDir = options?.baseDir ?? path.join(process.cwd(), '.cache');
    }
    async read(descriptor) {
        const filePath = this.filePath(descriptor);
        try {
            const raw = await fs_1.promises.readFile(filePath, 'utf-8');
            const payload = this.hydratePayload(JSON.parse(raw));
            if (payload.descriptor.expiresAt && payload.descriptor.expiresAt.getTime() < Date.now()) {
                await this.safeUnlink(filePath);
                return null;
            }
            return payload;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }
    async write(descriptor, payload) {
        await this.ensureDir(descriptor);
        const record = this.serializePayload(descriptor, payload);
        await fs_1.promises.writeFile(this.filePath(descriptor), JSON.stringify(record), 'utf-8');
        return {
            descriptor,
            payload,
            createdAt: new Date(record.createdAt),
        };
    }
    async clear(descriptor) {
        await this.safeUnlink(this.filePath(descriptor));
    }
    filePath(descriptor) {
        const providerDir = path.join(this.baseDir, this.sanitizeSegment(descriptor.provider));
        const scopeDir = path.join(providerDir, this.sanitizeSegment(descriptor.scope));
        const fileName = `${encodeURIComponent(descriptor.key)}.json`;
        return path.join(scopeDir, fileName);
    }
    async ensureDir(descriptor) {
        await fs_1.promises.mkdir(path.dirname(this.filePath(descriptor)), { recursive: true });
    }
    sanitizeSegment(segment) {
        const normalized = segment.trim();
        return normalized ? normalized.replace(/[^a-z0-9._-]/gi, '_') : 'default';
    }
    serializePayload(descriptor, payload) {
        return {
            descriptor: {
                ...descriptor,
                expiresAt: descriptor.expiresAt ? descriptor.expiresAt.toISOString() : undefined,
            },
            payload,
            createdAt: new Date().toISOString(),
        };
    }
    hydratePayload(serialized) {
        return {
            descriptor: {
                ...serialized.descriptor,
                expiresAt: serialized.descriptor.expiresAt
                    ? new Date(serialized.descriptor.expiresAt)
                    : undefined,
            },
            payload: serialized.payload,
            createdAt: new Date(serialized.createdAt),
        };
    }
    async safeUnlink(filePath) {
        try {
            await fs_1.promises.unlink(filePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}
exports.FileCacheStore = FileCacheStore;

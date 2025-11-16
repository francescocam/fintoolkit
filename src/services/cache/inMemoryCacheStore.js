"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryCacheStore = void 0;
class InMemoryCacheStore {
    constructor() {
        this.store = new Map();
    }
    async read(descriptor) {
        const key = this.cacheKey(descriptor);
        const cached = this.store.get(key);
        if (!cached) {
            return null;
        }
        const expired = cached.descriptor.expiresAt && cached.descriptor.expiresAt.getTime() < Date.now();
        if (expired) {
            this.store.delete(key);
            return null;
        }
        return cached;
    }
    async write(descriptor, payload) {
        const record = {
            descriptor,
            payload,
            createdAt: new Date(),
        };
        this.store.set(this.cacheKey(descriptor), record);
        return record;
    }
    async clear(descriptor) {
        this.store.delete(this.cacheKey(descriptor));
    }
    cacheKey(descriptor) {
        return `${descriptor.provider}:${descriptor.scope}:${descriptor.key}`;
    }
}
exports.InMemoryCacheStore = InMemoryCacheStore;

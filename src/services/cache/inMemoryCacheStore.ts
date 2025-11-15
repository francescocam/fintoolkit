import { CacheDescriptor, CacheStore, CachedPayload } from '../../domain/contracts';

export class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, CachedPayload<unknown>>();

  async read<T>(descriptor: CacheDescriptor): Promise<CachedPayload<T> | null> {
    const key = this.cacheKey(descriptor);
    const cached = this.store.get(key);
    if (!cached) {
      return null;
    }

    const expired =
      cached.descriptor.expiresAt && cached.descriptor.expiresAt.getTime() < Date.now();
    if (expired) {
      this.store.delete(key);
      return null;
    }

    return cached as CachedPayload<T>;
  }

  async write<T>(descriptor: CacheDescriptor, payload: T): Promise<CachedPayload<T>> {
    const record: CachedPayload<T> = {
      descriptor,
      payload,
      createdAt: new Date(),
    };

    this.store.set(this.cacheKey(descriptor), record);
    return record;
  }

  async clear(descriptor: CacheDescriptor): Promise<void> {
    this.store.delete(this.cacheKey(descriptor));
  }

  private cacheKey(descriptor: CacheDescriptor): string {
    return `${descriptor.provider}:${descriptor.scope}:${descriptor.key}`;
  }
}

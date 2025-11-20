import { promises as fs } from 'fs';
import * as path from 'path';
import { CacheDescriptor, CacheStore, CachedPayload, ProviderId } from '../../domain/contracts';

export interface FileCacheStoreOptions {
  baseDir?: string;
}

export class FileCacheStore implements CacheStore {
  private readonly baseDir: string;

  constructor(options?: FileCacheStoreOptions) {
    this.baseDir = options?.baseDir ?? path.join(process.cwd(), '.cache');
  }

  async read<T>(descriptor: CacheDescriptor): Promise<CachedPayload<T> | null> {
    const filePath = this.filePath(descriptor);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const payload = this.hydratePayload<T>(JSON.parse(raw));
      if (payload.descriptor.expiresAt && payload.descriptor.expiresAt.getTime() < Date.now()) {
        await this.safeUnlink(filePath);
        return null;
      }
      return payload;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async write<T>(descriptor: CacheDescriptor, payload: T): Promise<CachedPayload<T>> {
    await this.ensureDir(descriptor);
    const record = this.serializePayload(descriptor, payload);
    await fs.writeFile(this.filePath(descriptor), JSON.stringify(record), 'utf-8');
    return {
      descriptor,
      payload,
      createdAt: new Date(record.createdAt),
    };
  }

  async clear(descriptor: CacheDescriptor): Promise<void> {
    await this.safeUnlink(this.filePath(descriptor));
  }

  private filePath(descriptor: CacheDescriptor): string {
    const providerDir = path.join(this.baseDir, this.sanitizeSegment(descriptor.provider));
    const scopeDir = path.join(providerDir, this.sanitizeSegment(descriptor.scope));
    const fileName = `${encodeURIComponent(descriptor.key)}.json`;
    return path.join(scopeDir, fileName);
  }

  private async ensureDir(descriptor: CacheDescriptor): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath(descriptor)), { recursive: true });
  }

  private sanitizeSegment(segment: string): string {
    const normalized = segment.trim();
    return normalized ? normalized.replace(/[^a-z0-9._-]/gi, '_') : 'default';
  }

  private serializePayload<T>(descriptor: CacheDescriptor, payload: T): {
    descriptor: { scope: CacheDescriptor['scope']; provider: ProviderId; key: string; expiresAt?: string };
    payload: T;
    createdAt: string;
  } {
    return {
      descriptor: {
        ...descriptor,
        expiresAt: descriptor.expiresAt ? descriptor.expiresAt.toISOString() : undefined,
      },
      payload,
      createdAt: new Date().toISOString(),
    };
  }

  private hydratePayload<T>(serialized: {
    descriptor: CacheDescriptor & { expiresAt?: string };
    payload: T;
    createdAt: string;
  }): CachedPayload<T> {
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

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

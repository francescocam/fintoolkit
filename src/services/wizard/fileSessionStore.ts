import { promises as fs } from 'fs';
import * as path from 'path';
import {
  CachedPayload,
  WizardSession,
  WizardSessionStore,
} from '../../domain/contracts';

export interface FileSystemSessionStoreOptions {
  baseDir?: string;
}

export class FileSystemSessionStore implements WizardSessionStore {
  private readonly baseDir: string;

  constructor(options?: FileSystemSessionStoreOptions) {
    this.baseDir = options?.baseDir ?? path.join(process.cwd(), '.wizard-sessions');
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  async load(id: string): Promise<WizardSession | null> {
    const filePath = this.filePath(id);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return this.hydrateSession(parsed);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(session: WizardSession): Promise<void> {
    await this.ensureDir();
    const filePath = this.filePath(session.id);
    const serialized = JSON.stringify(session, null, 2);
    await fs.writeFile(filePath, serialized, 'utf-8');
  }

  private filePath(id: string): string {
    return path.join(this.baseDir, `${id}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hydrateSession(raw: any): WizardSession {
    const session: WizardSession = {
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
      const symbols: Record<string, CachedPayload<unknown>> = {};
      for (const [key, payload] of Object.entries(raw.providerUniverse.symbols ?? {})) {
        symbols[key] = this.hydratePayload(payload);
      }

      session.providerUniverse = {
        exchanges: this.hydratePayload(raw.providerUniverse.exchanges),
        symbols: symbols as Record<string, CachedPayload<any>>,
      };
    }

    return session;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hydratePayload<T>(payload: any): CachedPayload<T> {
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

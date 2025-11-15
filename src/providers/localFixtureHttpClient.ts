import { promises as fs } from 'fs';
import * as path from 'path';
import { HttpClient, QueryParams } from './httpClient';

export interface FixtureHttpClientOptions {
  fixtures: Record<string, string>;
  defaultFixture?: string;
  rootDir?: string;
}

export class LocalFixtureHttpClient implements HttpClient {
  private readonly fixtures: Map<string, string>;
  private readonly defaultFixture?: string;
  private readonly rootDir: string;

  constructor(options: FixtureHttpClientOptions) {
    this.fixtures = new Map(Object.entries(options.fixtures ?? {}));
    this.defaultFixture = options.defaultFixture;
    this.rootDir = options.rootDir ?? process.cwd();
  }

  async getJson<T>(url: string, params?: QueryParams): Promise<T> {
    const fileContents = await this.readFixture(url, params);
    return JSON.parse(fileContents) as T;
  }

  async getText(url: string, params?: QueryParams): Promise<string> {
    return this.readFixture(url, params);
  }

  private async readFixture(url: string, params?: QueryParams): Promise<string> {
    const key = this.buildKey(url, params);
    const filePath = this.fixtures.get(key) ?? this.fixtures.get(url) ?? this.defaultFixture;
    if (!filePath) {
      throw new Error(`No fixture registered for ${key}`);
    }

    const resolved = path.isAbsolute(filePath) ? filePath : path.join(this.rootDir, filePath);
    return fs.readFile(resolved, 'utf-8');
  }

  private buildKey(url: string, params?: QueryParams): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const search = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    return `${url}?${search}`;
  }
}

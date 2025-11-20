import {
  CacheDescriptor,
  CacheStore,
  CachedPayload,
  DataromaEntry,
  DataromaScraper,
  ProviderId,
  ScrapeOptions,
  ScrapeResult,
} from '../../domain/contracts';
import { HttpClient, QueryParams } from '../../providers/httpClient';

const DATAROMA_PROVIDER_ID: ProviderId = 'dataroma';
const DEFAULT_URL = 'https://www.dataroma.com/m/g/portfolio.php';

export interface DataromaScraperConfig {
  client: HttpClient;
  cache?: CacheStore;
  baseUrl?: string;
}

export class DataromaScraperService implements DataromaScraper {
  private readonly baseUrl: string;

  constructor(private readonly config: DataromaScraperConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_URL;
  }

  async scrapeGrandPortfolio(opts: ScrapeOptions): Promise<ScrapeResult> {
    const normalized: ScrapeOptions = {
      ...opts,
      maxEntries: this.normalizeMaxEntries(opts.maxEntries),
    };
    const descriptor = this.createDescriptor(normalized);

    if (normalized.useCache) {
      const cached = await this.config.cache?.read<DataromaEntry[]>(descriptor);
      if (cached) {
        const entries = this.deduplicateEntries(cached.payload);
        const normalizedPayload =
          entries === cached.payload ? cached : { ...cached, payload: entries };
        return {
          entries,
          source: 'cache',
          cachedPayload: normalizedPayload,
        };
      }
    }

    const rawEntries = await this.fetchAllPages(normalized);
    const entries = this.deduplicateEntries(rawEntries);
    const cachedPayload = entries.length ? await this.persist(descriptor, entries) : undefined;

    return {
      entries,
      source: 'live',
      cachedPayload,
    };
  }

  private createDescriptor(opts: ScrapeOptions): CacheDescriptor {
    const cacheKey = opts.cacheToken ?? this.buildCacheKey(opts);
    return {
      scope: 'scrape',
      provider: DATAROMA_PROVIDER_ID,
      key: cacheKey,
    };
  }

  private buildCacheKey(opts: ScrapeOptions): string {
    const min = opts.minPercent ?? 0;
    const max = opts.maxEntries ?? 'all';
    return `grand-portfolio:v2:${min}:max-${max}`;
  }

  private buildQuery(opts: ScrapeOptions, page?: number): QueryParams | undefined {
    const params: QueryParams = {};
    if (opts.minPercent !== undefined && opts.minPercent > 0) {
      params.pct = opts.minPercent;
    }
    if (page && page > 1) {
      params.L = page;
    }
    return Object.keys(params).length ? params : undefined;
  }

  private async persist(
    descriptor: CacheDescriptor,
    payload: DataromaEntry[],
  ): Promise<CachedPayload<DataromaEntry[]>> {
    if (this.config.cache) {
      return this.config.cache.write(descriptor, payload);
    }

    return {
      descriptor,
      payload,
      createdAt: new Date(),
    };
  }

  private parsePage(html: string): { entries: DataromaEntry[]; totalPages: number } {
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
      throw new Error('Unable to locate table body in Dataroma response.');
    }

    const tbody = tbodyMatch[1];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    const entries: DataromaEntry[] = [];

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tbody)) !== null) {
      const rowHtml = rowMatch[1];
      const symbol = this.extractCellText(rowHtml, 'sym');
      const stock = this.extractCellText(rowHtml, 'stock');

      if (!symbol || !stock) {
        continue;
      }

      entries.push({
        symbol: this.cleanSymbol(symbol),
        stock,
      });
    }

    const totalPages = this.extractTotalPages(html);

    return { entries, totalPages };
  }

  private extractTotalPages(html: string): number {
    const footerMatch = html.match(/<div\s+id="pages">([\s\S]*?)<\/div>/i);
    if (!footerMatch) {
      return 1;
    }

    const linkRegex = /portfolio\.php\?[^"]*L=(\d+)/gi;
    let maxPage = 1;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(footerMatch[1])) !== null) {
      const pageNumber = Number(match[1]);
      if (Number.isFinite(pageNumber)) {
        maxPage = Math.max(maxPage, pageNumber);
      }
    }

    return maxPage;
  }

  private async fetchAllPages(opts: ScrapeOptions): Promise<DataromaEntry[]> {
    const firstHtml = await this.getTextWithDelay(this.baseUrl, this.buildQuery(opts));
    const { entries: firstEntries, totalPages } = this.parsePage(firstHtml);
    const allEntries = [...firstEntries];

    if (opts.maxEntries && allEntries.length >= opts.maxEntries) {
      return allEntries.slice(0, opts.maxEntries);
    }

    for (let page = 2; page <= totalPages; page++) {
      const html = await this.getTextWithDelay(this.baseUrl, this.buildQuery(opts, page));
      const { entries } = this.parsePage(html);
      allEntries.push(...entries);

      if (opts.maxEntries && allEntries.length >= opts.maxEntries) {
        return allEntries.slice(0, opts.maxEntries);
      }
    }

    return allEntries;
  }

  private deduplicateEntries<T extends DataromaEntry>(entries: T[]): T[] {
    const seen = new Set<string>();
    let hasDuplicates = false;
    const deduped: T[] = [];

    for (const entry of entries) {
      const key = this.buildEntryKey(entry);
      if (seen.has(key)) {
        hasDuplicates = true;
        continue;
      }
      seen.add(key);
      deduped.push(entry);
    }

    return hasDuplicates ? deduped : entries;
  }

  private buildEntryKey(entry: DataromaEntry): string {
    return `${entry.symbol.toUpperCase()}::${entry.stock.toUpperCase()}`;
  }

  private extractCellText(rowHtml: string, className: string): string | undefined {
    const cellRegex = new RegExp(`<td\\s+class="${className}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
    const cellMatch = rowHtml.match(cellRegex);
    if (!cellMatch) {
      return undefined;
    }

    return this.decodeHtml(this.stripTags(cellMatch[1])).trim();
  }

  private stripTags(value: string): string {
    return value.replace(/<[^>]+>/g, ' ');
  }

  private async getTextWithDelay(url: string, params?: QueryParams): Promise<string> {
    await this.humanDelay();
    return this.config.client.getText(url, params);
  }

  private async humanDelay(): Promise<void> {
    const delay = Math.random() < 0.5 ? 100 : 200;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private normalizeMaxEntries(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    if (value <= 0) {
      return undefined;
    }
    return Math.floor(value);
  }

  private cleanSymbol(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }
}

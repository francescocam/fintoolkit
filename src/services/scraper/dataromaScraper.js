"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataromaScraperService = void 0;
const DATAROMA_PROVIDER_ID = 'dataroma';
const DEFAULT_URL = 'https://www.dataroma.com/m/g/portfolio.php';
const DATAROMA_ORIGIN = 'https://www.dataroma.com';
const EXCHANGE_CONCURRENCY = 5;
class DataromaScraperService {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl ?? DEFAULT_URL;
    }
    async scrapeGrandPortfolio(opts) {
        const normalized = {
            ...opts,
            maxEntries: this.normalizeMaxEntries(opts.maxEntries),
        };
        const descriptor = this.createDescriptor(normalized);
        if (normalized.useCache) {
            const cached = await this.config.cache?.read(descriptor);
            if (cached) {
                const entries = this.deduplicateEntries(cached.payload);
                const normalizedPayload = entries === cached.payload ? cached : { ...cached, payload: entries };
                return {
                    entries,
                    source: 'cache',
                    cachedPayload: normalizedPayload,
                };
            }
        }
        const rawEntries = await this.fetchAllPages(normalized);
        const dedupedEntries = this.deduplicateEntries(rawEntries);
        const entries = await this.enrichExchanges(dedupedEntries);
        const cachedPayload = entries.length ? await this.persist(descriptor, entries) : undefined;
        return {
            entries,
            source: 'live',
            cachedPayload,
        };
    }
    createDescriptor(opts) {
        const cacheKey = opts.cacheToken ?? this.buildCacheKey(opts);
        return {
            scope: 'scrape',
            provider: DATAROMA_PROVIDER_ID,
            key: cacheKey,
        };
    }
    buildCacheKey(opts) {
        const min = opts.minPercent ?? 0;
        const max = opts.maxEntries ?? 'all';
        return `grand-portfolio:v2:${min}:max-${max}`;
    }
    buildQuery(opts, page) {
        const params = {};
        if (opts.minPercent !== undefined && opts.minPercent > 0) {
            params.pct = opts.minPercent;
        }
        if (page && page > 1) {
            params.L = page;
        }
        return Object.keys(params).length ? params : undefined;
    }
    async persist(descriptor, payload) {
        if (this.config.cache) {
            return this.config.cache.write(descriptor, payload);
        }
        return {
            descriptor,
            payload,
            createdAt: new Date(),
        };
    }
    parsePage(html) {
        const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
        if (!tbodyMatch) {
            throw new Error('Unable to locate table body in Dataroma response.');
        }
        const tbody = tbodyMatch[1];
        const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
        const entries = [];
        let rowMatch;
        while ((rowMatch = rowRegex.exec(tbody)) !== null) {
            const rowHtml = rowMatch[1];
            const symbol = this.extractCellText(rowHtml, 'sym');
            const stock = this.extractCellText(rowHtml, 'stock');
            const detailPath = this.extractDetailPath(rowHtml);
            if (!symbol || !stock) {
                continue;
            }
            entries.push({
                symbol: this.cleanSymbol(symbol),
                stock,
                exchange: undefined,
                detailPath,
            });
        }
        const totalPages = this.extractTotalPages(html);
        return { entries, totalPages };
    }
    extractTotalPages(html) {
        const footerMatch = html.match(/<div\s+id="pages">([\s\S]*?)<\/div>/i);
        if (!footerMatch) {
            return 1;
        }
        const linkRegex = /portfolio\.php\?[^"]*L=(\d+)/gi;
        let maxPage = 1;
        let match;
        while ((match = linkRegex.exec(footerMatch[1])) !== null) {
            const pageNumber = Number(match[1]);
            if (Number.isFinite(pageNumber)) {
                maxPage = Math.max(maxPage, pageNumber);
            }
        }
        return maxPage;
    }
    async fetchAllPages(opts) {
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
    async enrichExchanges(entries) {
        return this.mapWithConcurrency(entries, EXCHANGE_CONCURRENCY, async (entry) => {
            const { detailPath, ...rest } = entry;
            let next = rest;
            try {
                const exchange = await this.fetchExchange(entry);
                if (exchange) {
                    next = { ...rest, exchange };
                }
            }
            catch {
                // Ignore individual failures; keep what we have
            }
            return next;
        });
    }
    async fetchExchange(entry) {
        if (!entry.detailPath) {
            return undefined;
        }
        const detailUrl = this.resolveUrl(entry.detailPath);
        const detailHtml = await this.getTextWithDelay(detailUrl);
        const tradingViewUrl = this.extractTradingViewUrl(detailHtml);
        if (!tradingViewUrl) {
            return undefined;
        }
        const tradingViewHtml = await this.getTextWithDelay(tradingViewUrl);
        return this.extractExchange(tradingViewHtml);
    }
    deduplicateEntries(entries) {
        const seen = new Set();
        let hasDuplicates = false;
        const deduped = [];
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
    buildEntryKey(entry) {
        return `${entry.symbol.toUpperCase()}::${entry.stock.toUpperCase()}`;
    }
    extractCellText(rowHtml, className) {
        const cellRegex = new RegExp(`<td\\s+class="${className}"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
        const cellMatch = rowHtml.match(cellRegex);
        if (!cellMatch) {
            return undefined;
        }
        return this.decodeHtml(this.stripTags(cellMatch[1])).trim();
    }
    stripTags(value) {
        return value.replace(/<[^>]+>/g, ' ');
    }
    extractDetailPath(rowHtml) {
        const symCellMatch = rowHtml.match(/<td\s+class="sym"[^>]*>([\s\S]*?)<\/td>/i);
        if (!symCellMatch) {
            return undefined;
        }
        const hrefMatch = symCellMatch[1].match(/<a[^>]+href="([^"]+)"/i);
        return hrefMatch ? this.decodeHtml(hrefMatch[1]) : undefined;
    }
    extractTradingViewUrl(html) {
        const linkMatch = html.match(/https?:\/\/www\.tradingview\.com\/symbols\/[^"'\s<>]+/i);
        return linkMatch ? this.decodeHtml(linkMatch[0]) : undefined;
    }
    extractExchange(html) {
        const match = html.match(/<span[^>]*class="[^"]*provider-[^"]*"[^>]*>([^<]+)<\/span>/i);
        return match ? match[1].trim() : undefined;
    }
    resolveUrl(pathname) {
        try {
            return new URL(pathname, DATAROMA_ORIGIN).toString();
        }
        catch {
            return pathname;
        }
    }
    async getTextWithDelay(url, params) {
        await this.humanDelay();
        return this.config.client.getText(url, params);
    }
    async humanDelay() {
        const delay = Math.random() < 0.5 ? 100 : 200;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    normalizeMaxEntries(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return undefined;
        }
        if (value <= 0) {
            return undefined;
        }
        return Math.floor(value);
    }
    async mapWithConcurrency(items, concurrency, fn) {
        if (items.length === 0) {
            return [];
        }
        const limit = Math.max(1, concurrency);
        const results = new Array(items.length);
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < items.length) {
                const current = nextIndex++;
                results[current] = await fn(items[current], current);
            }
        };
        const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
        await Promise.all(workers);
        return results;
    }
    cleanSymbol(value) {
        return value.replace(/\s+/g, '').toUpperCase();
    }
    decodeHtml(value) {
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
exports.DataromaScraperService = DataromaScraperService;

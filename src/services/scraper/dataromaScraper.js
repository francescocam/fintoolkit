"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataromaScraperService = void 0;
const DATAROMA_PROVIDER_ID = 'dataroma';
const DEFAULT_URL = 'https://www.dataroma.com/m/g/portfolio.php';
class DataromaScraperService {
    constructor(config) {
        this.config = config;
        this.baseUrl = config.baseUrl ?? DEFAULT_URL;
    }
    async scrapeGrandPortfolio(opts) {
        const descriptor = this.createDescriptor(opts);
        if (opts.useCache) {
            const cached = await this.config.cache?.read(descriptor);
            if (cached) {
                return {
                    entries: cached.payload,
                    source: 'cache',
                    cachedPayload: cached,
                };
            }
        }
        const entries = await this.fetchAllPages(opts);
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
        return `grand-portfolio:${min}`;
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
        const firstHtml = await this.config.client.getText(this.baseUrl, this.buildQuery(opts));
        const { entries: firstEntries, totalPages } = this.parsePage(firstHtml);
        const allEntries = [...firstEntries];
        for (let page = 2; page <= totalPages; page++) {
            const html = await this.config.client.getText(this.baseUrl, this.buildQuery(opts, page));
            const { entries } = this.parsePage(html);
            allEntries.push(...entries);
        }
        return allEntries;
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

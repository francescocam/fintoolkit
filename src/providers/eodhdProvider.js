"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EodhdProvider = void 0;
class EodhdProvider {
    constructor(config) {
        this.config = config;
        this.id = 'eodhd';
        this.baseUrl = config.baseUrl ?? 'https://eodhd.com/api';
    }
    async getExchanges(options) {
        const descriptor = this.createDescriptor('exchange-list', 'all', this.config.exchangeTtlMs);
        const cached = await this.readCache(descriptor, options);
        if (cached) {
            return cached;
        }
        const payload = await this.config.client.getJson(`${this.baseUrl}/exchanges-list`, this.authParams());
        const normalizedExchanges = payload.map((record) => this.normalizeExchange(record));
        return this.persist(descriptor, normalizedExchanges);
    }
    async getSymbols(exchangeCode, options) {
        const normalizedCode = exchangeCode.trim().toUpperCase();
        const cacheKey = options?.commonStock ? `${normalizedCode}_common` : normalizedCode;
        const descriptor = this.createDescriptor('exchange-symbols', cacheKey, this.config.symbolTtlMs);
        const cached = await this.readCache(descriptor, options);
        if (cached) {
            return cached;
        }
        const queryParams = this.authParams();
        if (options?.commonStock) {
            queryParams.type = 'common_stock';
        }
        const payload = await this.config.client.getJson(`${this.baseUrl}/exchange-symbol-list/${normalizedCode}`, queryParams);
        const normalizedSymbols = payload.map((record) => this.normalizeSymbol(record));
        return this.persist(descriptor, normalizedSymbols);
    }
    async getFundamentals(stockCode, exchangeCode, options) {
        const symbol = stockCode.trim().toUpperCase();
        const exchange = exchangeCode.trim().toUpperCase();
        const response = await this.config.client.getJson(`${this.baseUrl}/fundamentals/${symbol}.${exchange}`, this.authParams());
        return this.mapFundamentals(symbol, exchange, response);
    }
    authParams() {
        return {
            api_token: this.config.apiToken,
            fmt: 'json',
        };
    }
    createDescriptor(scope, key, ttl) {
        return {
            scope,
            provider: this.id,
            key,
            expiresAt: ttl ? new Date(Date.now() + ttl) : undefined,
        };
    }
    async readCache(descriptor, options) {
        if (!this.config.cache || options?.useCache === false) {
            return null;
        }
        const cached = await this.config.cache.read(descriptor);
        if (!cached) {
            return null;
        }
        if (cached.descriptor.expiresAt && cached.descriptor.expiresAt.getTime() < Date.now()) {
            await this.config.cache.clear(descriptor);
            return null;
        }
        return cached;
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
    mapFundamentals(stockCode, exchangeCode, response) {
        const general = response.General ?? {};
        const highlights = response.Highlights ?? {};
        const cashFlowYearly = response.Financials?.Cash_Flow?.yearly;
        const incomeYearly = response.Financials?.Income_Statement?.yearly;
        const latestCashFlow = this.pickLatest(cashFlowYearly);
        const latestIncome = this.pickLatest(incomeYearly);
        const freeCashFlow = this.toNumber(latestCashFlow?.FreeCashFlow);
        const revenue = this.toNumber(latestIncome?.totalRevenue) ??
            this.toNumber(latestIncome?.revenue);
        const freeCashFlowMargin = freeCashFlow !== undefined && revenue ? freeCashFlow / revenue : undefined;
        return {
            stockCode,
            exchangeCode,
            name: general.Name ?? general.Code ?? stockCode,
            trailingPE: this.toNumber(highlights.PERatioTTM),
            forwardPE: this.toNumber(highlights.ForwardPE),
            forwardDividendYield: this.toNumber(highlights.ForwardAnnualDividendYield) ?? this.toNumber(highlights.DividendYield),
            freeCashFlowMargin,
            asOf: new Date(),
            raw: response,
        };
    }
    pickLatest(collection) {
        if (!collection) {
            return undefined;
        }
        const latestKey = Object.keys(collection)
            .sort((a, b) => Number(b) - Number(a))
            .at(0);
        if (!latestKey) {
            return undefined;
        }
        return collection[latestKey];
    }
    toNumber(value) {
        if (value === null || value === undefined) {
            return undefined;
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    normalizeExchange(record) {
        return {
            code: record.Code,
            name: record.Name,
            operatingMic: record.OperatingMIC ?? '',
            country: record.Country ?? '',
            currency: record.Currency ?? '',
        };
    }
    normalizeSymbol(record) {
        return {
            code: record.Code,
            name: record.Name,
            exchange: record.Exchange,
            country: record.Country ?? '',
            currency: record.Currency ?? '',
            isin: record.Isin ?? null,
            type: record.Type,
        };
    }
}
exports.EodhdProvider = EodhdProvider;

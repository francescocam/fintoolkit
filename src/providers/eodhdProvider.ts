import {
  CacheDescriptor,
  CacheStore,
  CachedPayload,
  ExchangeSummary,
  FundamentalsProvider,
  FundamentalsSnapshot,
  ProviderId,
  SymbolRecord,
} from '../domain/contracts';
import { HttpClient, QueryParams } from './httpClient';

export interface EodhdProviderConfig {
  apiToken: string;
  client: HttpClient;
  cache?: CacheStore;
  baseUrl?: string;
  exchangeTtlMs?: number;
  symbolTtlMs?: number;
}

interface EodhdFundamentalsResponse {
  General?: {
    Code?: string;
    Name?: string;
    Exchange?: string;
  };
  Highlights?: {
    PERatioTTM?: number | string;
    ForwardPE?: number | string;
    ForwardAnnualDividendYield?: number | string;
    DividendYield?: number | string;
  };
  Financials?: {
    Cash_Flow?: {
      yearly?: Record<string, { FreeCashFlow?: number | string }>;
    };
    Income_Statement?: {
      yearly?: Record<string, { totalRevenue?: number | string; revenue?: number | string }>;
    };
  };
  [key: string]: unknown;
}

export class EodhdProvider implements FundamentalsProvider {
  readonly id: ProviderId = 'eodhd';
  private readonly baseUrl: string;

  constructor(private readonly config: EodhdProviderConfig) {
    this.baseUrl = config.baseUrl ?? 'https://eodhd.com/api';
  }

  async getExchanges(): Promise<CachedPayload<ExchangeSummary[]>> {
    const descriptor = this.createDescriptor('exchange-list', 'all', this.config.exchangeTtlMs);
    const cached = await this.readCache<ExchangeSummary[]>(descriptor);
    if (cached) {
      return cached;
    }

    const payload = await this.config.client.getJson<ExchangeSummary[]>(
      `${this.baseUrl}/exchanges-list`,
      this.authParams(),
    );

    return this.persist(descriptor, payload);
  }

  async getSymbols(exchangeCode: string): Promise<CachedPayload<SymbolRecord[]>> {
    const normalized = exchangeCode.trim().toUpperCase();
    const descriptor = this.createDescriptor('exchange-symbols', normalized, this.config.symbolTtlMs);
    const cached = await this.readCache<SymbolRecord[]>(descriptor);
    if (cached) {
      return cached;
    }

    const payload = await this.config.client.getJson<SymbolRecord[]>(
      `${this.baseUrl}/exchange-symbol-list/${normalized}`,
      {
        ...this.authParams(),
        type: 'common_stock',
      },
    );

    return this.persist(descriptor, payload);
  }

  async getFundamentals(stockCode: string, exchangeCode: string): Promise<FundamentalsSnapshot> {
    const symbol = stockCode.trim().toUpperCase();
    const exchange = exchangeCode.trim().toUpperCase();
    const response = await this.config.client.getJson<EodhdFundamentalsResponse>(
      `${this.baseUrl}/fundamentals/${symbol}.${exchange}`,
      this.authParams(),
    );

    return this.mapFundamentals(symbol, exchange, response);
  }

  private authParams(): QueryParams {
    return {
      api_token: this.config.apiToken,
      fmt: 'json',
    };
  }

  private createDescriptor(scope: CacheDescriptor['scope'], key: string, ttl?: number): CacheDescriptor {
    return {
      scope,
      provider: this.id,
      key,
      expiresAt: ttl ? new Date(Date.now() + ttl) : undefined,
    };
  }

  private async readCache<T>(descriptor: CacheDescriptor): Promise<CachedPayload<T> | null> {
    if (!this.config.cache) {
      return null;
    }

    const cached = await this.config.cache.read<T>(descriptor);
    if (!cached) {
      return null;
    }

    if (cached.descriptor.expiresAt && cached.descriptor.expiresAt.getTime() < Date.now()) {
      await this.config.cache.clear(descriptor);
      return null;
    }

    return cached;
  }

  private async persist<T>(descriptor: CacheDescriptor, payload: T): Promise<CachedPayload<T>> {
    if (this.config.cache) {
      return this.config.cache.write(descriptor, payload);
    }

    return {
      descriptor,
      payload,
      createdAt: new Date(),
    };
  }

  private mapFundamentals(
    stockCode: string,
    exchangeCode: string,
    response: EodhdFundamentalsResponse,
  ): FundamentalsSnapshot {
    const general = response.General ?? {};
    const highlights = response.Highlights ?? {};

    const cashFlowYearly = response.Financials?.Cash_Flow?.yearly;
    const incomeYearly = response.Financials?.Income_Statement?.yearly;

    const latestCashFlow = this.pickLatest(cashFlowYearly);
    const latestIncome = this.pickLatest(incomeYearly);

    const freeCashFlow = this.toNumber(latestCashFlow?.FreeCashFlow);
    const revenue =
      this.toNumber(latestIncome?.totalRevenue) ??
      this.toNumber(latestIncome?.revenue);

    const freeCashFlowMargin =
      freeCashFlow !== undefined && revenue ? freeCashFlow / revenue : undefined;

    return {
      stockCode,
      exchangeCode,
      name: general.Name ?? general.Code ?? stockCode,
      trailingPE: this.toNumber(highlights.PERatioTTM),
      forwardPE: this.toNumber(highlights.ForwardPE),
      forwardDividendYield:
        this.toNumber(highlights.ForwardAnnualDividendYield) ?? this.toNumber(highlights.DividendYield),
      freeCashFlowMargin,
      asOf: new Date(),
      raw: response,
    };
  }

  private pickLatest<T>(collection?: Record<string, T>): T | undefined {
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

  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface ResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface RequestInitLike {
  headers?: Record<string, string>;
  method?: string;
}

export type FetchLike = (url: string, init?: RequestInitLike) => Promise<ResponseLike>;

export interface HttpClient {
  getJson<T>(url: string, params?: QueryParams): Promise<T>;
  getText(url: string, params?: QueryParams): Promise<string>;
}

export class FetchHttpClient implements HttpClient {
  constructor(private readonly fetchImpl: FetchLike) {}

  async getJson<T>(url: string, params?: QueryParams): Promise<T> {
    const requestUrl = this.decorateQuery(url, params);
    const response = await this.fetchImpl(requestUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status} ${response.statusText}) for ${requestUrl}`);
    }

    return (await response.json()) as T;
  }

  async getText(url: string, params?: QueryParams): Promise<string> {
    const requestUrl = this.decorateQuery(url, params);
    const response = await this.fetchImpl(requestUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status} ${response.statusText}) for ${requestUrl}`);
    }

    return await response.text();
  }

  private decorateQuery(url: string, params?: QueryParams): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const search = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    return `${url}?${search}`;
  }
}

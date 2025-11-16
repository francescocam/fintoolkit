"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchHttpClient = void 0;
class FetchHttpClient {
    constructor(fetchImpl) {
        this.fetchImpl = fetchImpl;
    }
    async getJson(url, params) {
        const requestUrl = this.decorateQuery(url, params);
        const response = await this.fetchImpl(requestUrl, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Request failed (${response.status} ${response.statusText}) for ${requestUrl}`);
        }
        return (await response.json());
    }
    async getText(url, params) {
        const requestUrl = this.decorateQuery(url, params);
        const response = await this.fetchImpl(requestUrl, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Request failed (${response.status} ${response.statusText}) for ${requestUrl}`);
        }
        return await response.text();
    }
    decorateQuery(url, params) {
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
exports.FetchHttpClient = FetchHttpClient;

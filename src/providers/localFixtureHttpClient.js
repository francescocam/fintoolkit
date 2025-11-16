"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalFixtureHttpClient = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
class LocalFixtureHttpClient {
    constructor(options) {
        this.fixtures = new Map(Object.entries(options.fixtures ?? {}));
        this.defaultFixture = options.defaultFixture;
        this.rootDir = options.rootDir ?? process.cwd();
    }
    async getJson(url, params) {
        const fileContents = await this.readFixture(url, params);
        return JSON.parse(fileContents);
    }
    async getText(url, params) {
        return this.readFixture(url, params);
    }
    async readFixture(url, params) {
        const key = this.buildKey(url, params);
        const filePath = this.fixtures.get(key) ?? this.fixtures.get(url) ?? this.defaultFixture;
        if (!filePath) {
            throw new Error(`No fixture registered for ${key}`);
        }
        const resolved = path.isAbsolute(filePath) ? filePath : path.join(this.rootDir, filePath);
        return fs_1.promises.readFile(resolved, 'utf-8');
    }
    buildKey(url, params) {
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
exports.LocalFixtureHttpClient = LocalFixtureHttpClient;

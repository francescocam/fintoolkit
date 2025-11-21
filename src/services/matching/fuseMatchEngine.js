"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuseMatchEngine = void 0;
const fuse_js_1 = __importDefault(require("fuse.js"));
class FuseMatchEngine {
    async generateCandidates(dataromaList, providerSymbols) {
        const fuse = new fuse_js_1.default(providerSymbols, {
            keys: ['name', 'code'], // Search in 'name' and 'code' fields of SymbolRecord
            includeScore: true,
            threshold: 0.4, // Adjust this threshold to control how strict the matching is
        });
        const candidates = dataromaList.map(dataromaEntry => {
            const searchResult = fuse.search(dataromaEntry.stock); // Search using the stock name
            if (searchResult.length > 0) {
                const bestMatch = searchResult[0];
                return {
                    dataromaSymbol: dataromaEntry.symbol,
                    dataromaName: dataromaEntry.stock,
                    providerSymbol: bestMatch.item,
                    confidence: 1 - (bestMatch.score || 0), // Fuse.js score is 0 for perfect match, 1 for mismatch. Invert it.
                    reasons: [`Matched by name/code with confidence: ${(1 - (bestMatch.score || 0)).toFixed(2)}`],
                };
            }
            return {
                dataromaSymbol: dataromaEntry.symbol,
                dataromaName: dataromaEntry.stock,
                providerSymbol: undefined,
                confidence: 0,
                reasons: ['No match found'],
            };
        });
        return candidates;
    }
    confirmMatch(candidate, symbol) {
        if (symbol) {
            return {
                ...candidate,
                providerSymbol: symbol,
                confidence: 1, // Explicitly confirmed, so confidence is 1
                reasons: ['Manually confirmed'],
            };
        }
        else {
            return {
                ...candidate,
                providerSymbol: undefined,
                notAvailable: true,
                confidence: 1, // Explicitly marked as not available
                reasons: ['Manually marked as not available'],
            };
        }
    }
}
exports.FuseMatchEngine = FuseMatchEngine;

import {
  DataromaEntry,
  MatchCandidate,
  MatchEngine,
  SymbolRecord,
} from '../../domain/contracts';

export class BasicMatchEngine implements MatchEngine {
  async generateCandidates(
    dataromaList: DataromaEntry[],
    providerSymbols: SymbolRecord[],
  ): Promise<MatchCandidate[]> {
    const symbolIndex = this.buildSymbolIndex(providerSymbols);

    return dataromaList.map((entry) => {
      const normalizedSymbol = this.normalize(entry.symbol);
      const exactSymbol = symbolIndex.get(normalizedSymbol);
      const nameMatch = this.findNameMatch(entry.stock, providerSymbols);

      let providerSymbol = exactSymbol ?? nameMatch?.record;
      const reasons: string[] = [];
      let confidence = 0;

      if (exactSymbol) {
        confidence += 0.7;
        reasons.push('Symbol match');
      }

      if (providerSymbol) {
        const similarity = this.computeNameSimilarity(entry.stock, providerSymbol.name);
        if (similarity > 0) {
          confidence += 0.3 * similarity;
          reasons.push(`Name similarity ${(similarity * 100).toFixed(0)}%`);
        }
      }

      confidence = Math.min(1, confidence);

      return {
        dataromaSymbol: entry.symbol,
        dataromaName: entry.stock,
        providerSymbol,
        confidence,
        reasons,
      };
    });
  }

  confirmMatch(candidate: MatchCandidate, symbol?: SymbolRecord): MatchCandidate {
    if (symbol) {
      return {
        ...candidate,
        providerSymbol: symbol,
        confidence: 1,
        reasons: [...candidate.reasons, 'User confirmed match'],
      };
    }

    return {
      ...candidate,
      providerSymbol: undefined,
      confidence: 0,
      reasons: [...candidate.reasons, 'User marked as unavailable'],
    };
  }

  private buildSymbolIndex(symbols: SymbolRecord[]): Map<string, SymbolRecord> {
    return new Map(symbols.map((record) => [this.normalize(record.code), record]));
  }

  private normalize(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  private findNameMatch(
    dataromaName: string,
    providerSymbols: SymbolRecord[],
  ): { record: SymbolRecord; score: number } | undefined {
    let best: { record: SymbolRecord; score: number } | undefined;

    for (const record of providerSymbols) {
      const score = this.computeNameSimilarity(dataromaName, record.name);
      if (!best || score > best.score) {
        best = { record, score };
      }
    }

    if (best && best.score > 0) {
      return best;
    }

    return undefined;
  }

  private computeNameSimilarity(a: string, b: string): number {
    const tokensA = this.tokenize(a);
    const tokensB = this.tokenize(b);
    if (tokensA.size === 0 || tokensB.size === 0) {
      return 0;
    }

    const intersection = new Set([...tokensA].filter((token) => tokensB.has(token)));
    const union = new Set([...tokensA, ...tokensB]);
    return intersection.size / union.size;
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean),
    );
  }
}

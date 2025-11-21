/// <reference types="node" />
import { parentPort, workerData } from 'worker_threads';
import { FuseMatchEngine } from './fuseMatchEngine';
import { DataromaEntry, SymbolRecord } from '../../domain/contracts';

if (!parentPort) {
  throw new Error('This file should be run as a worker thread.');
}

const { unmatchedDataromaEntries, providerSymbols } = workerData as {
  unmatchedDataromaEntries: DataromaEntry[];
  providerSymbols: SymbolRecord[];
};

const matchEngine = new FuseMatchEngine();

matchEngine.generateCandidates(unmatchedDataromaEntries, providerSymbols).then(matches => {
  parentPort?.postMessage(matches);
});

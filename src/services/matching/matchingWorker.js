"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="node" />
const worker_threads_1 = require("worker_threads");
const advancedMatchEngine_1 = require("./advancedMatchEngine");
if (!worker_threads_1.parentPort) {
    throw new Error('This file should be run as a worker thread.');
}
const { unmatchedDataromaEntries, providerSymbols } = worker_threads_1.workerData;
const matchEngine = new advancedMatchEngine_1.AdvancedMatchEngine();
matchEngine.generateCandidates(unmatchedDataromaEntries, providerSymbols).then(matches => {
    worker_threads_1.parentPort?.postMessage(matches);
});

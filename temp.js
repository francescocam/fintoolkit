"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var worker_threads_1 = require("worker_threads");
var path = require("path");
var worker = new worker_threads_1.Worker('some/path');
console.log(worker, path.resolve('a', 'b'));

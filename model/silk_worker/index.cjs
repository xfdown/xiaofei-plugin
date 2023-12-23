"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDuration = exports.decode = exports.encode = void 0;
const worker_threads_1 = require("worker_threads");
const silk_wasm_1 = require("silk-wasm");
if (!worker_threads_1.isMainThread && worker_threads_1.parentPort) {
    worker_threads_1.parentPort.once('message', (val) => {
        const data = val.data;
        const port = val.port;
        switch (data.type) {
            case "encode":
                (0, silk_wasm_1.encode)(data.input, data.sampleRate).then(ret => {
                    port.postMessage(ret);
                    port.close();
                });
                break;
            case "decode":
                (0, silk_wasm_1.decode)(data.input, data.sampleRate).then(ret => {
                    port.postMessage(ret);
                    port.close();
                });
                break;
            case "getDuration":
                let ret = (0, silk_wasm_1.getDuration)(data.silk, data.frameMs);
                port.postMessage(ret);
                port.close();
                break;
            default:
                port.postMessage({ data: null });
                port.close();
        }
    });
}
function postMessage(data) {
    const worker = new worker_threads_1.Worker(__filename);
    const subChannel = new worker_threads_1.MessageChannel();
    const port = subChannel.port2;
    return new Promise(resolve => {
        port.once('message', (ret) => {
            port.close();
            resolve(ret);
        });
        worker.postMessage({ port: subChannel.port1, data: data }, [subChannel.port1]);
    });
}
function encode(input, sampleRate) {
    return postMessage({ type: 'encode', input, sampleRate });
}
exports.encode = encode;
function decode(input, sampleRate) {
    return postMessage({ type: 'decode', input, sampleRate });
}
exports.decode = decode;
function getDuration(silk, frameMs) {
    return postMessage({ type: 'getDuration', silk, frameMs });
}
exports.getDuration = getDuration;

/// <reference types="node" />
import { decodeResult, encodeResult } from 'silk-wasm';
export declare function encode(input: Buffer | string, sampleRate: number): Promise<encodeResult>;
export declare function decode(input: Buffer | string, sampleRate: number): Promise<decodeResult>;
export declare function getDuration(silk: Uint8Array, frameMs?: number): number;

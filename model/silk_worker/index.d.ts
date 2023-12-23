/// <reference types="node" />
export declare function encode(input: Buffer, sampleRate: number): Promise<any>;
export declare function decode(input: Buffer, sampleRate: number): Promise<any>;
export declare function getDuration(silk: Uint8Array, frameMs?: number): Promise<any>;

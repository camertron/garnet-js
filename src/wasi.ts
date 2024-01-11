import type { WASI } from "wasi";
import { isNode } from "./env";

export const make_wasi = async (...args: any[]): Promise<WASI> => {
    return new (await import_wasi())(...args);
};

let wasiImport: typeof WASI | undefined;

const import_wasi = async (): Promise<typeof WASI> => {
    if (!wasiImport) {
        if (isNode) {
            wasiImport = (await import("wasi")).WASI;
        } else {
            wasiImport = (await import("@bjorn3/browser_wasi_shim")).WASI as unknown as typeof WASI;
        }
    }

    return wasiImport;
}

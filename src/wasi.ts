import type { WASI } from "wasi";
import { is_node } from "./env";

export const make_wasi = async (...args: any[]): Promise<WASI> => {
    return new (await import_wasi())(...args);
};

let wasiImport: typeof WASI | undefined;

const import_wasi = async (): Promise<typeof WASI> => {
    if (!wasiImport) {
        if (is_node) {
            wasiImport = (await import("wasi")).WASI;
        } else {
            wasiImport = (await import("@bjorn3/browser_wasi_shim")).WASI as unknown as typeof WASI;
        }
    }

    return wasiImport;
}

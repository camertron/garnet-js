import { isNode } from "./env";
import { make_wasi } from "./wasi";

const module_paths: string[] = [];

export const add_to_module_path = (path: string): void => {
    module_paths.push(path);
}

type ModuleResolver = (locator: string) => string;
const module_resolvers: ModuleResolver[] = [];

export const register_module_resolver = (resolver: ModuleResolver): void => {
    module_resolvers.push(resolver);
}

export class ModuleNotFound extends Error {
    public orig?: Error;

    constructor(message: string, orig?: Error) {
        super(message);
        this.orig = orig;
    }
};

const load_module_source = async (locator: string): Promise<Buffer> => {
    if (isNode) {
        const fs = await import("fs");
        const path = await import("path");
        let file: string | undefined;

        if (path.isAbsolute(locator)) {
            file = locator;
        } else {
            locator = `${locator}.wasm`

            for (const module_path of module_paths) {
                const cur_path = path.join(module_path, locator);

                if (fs.existsSync(cur_path)) {
                    file = cur_path;
                    break;
                }
            }
        }

        if (!file) {
            throw new ModuleNotFound(`could not find module ${locator}`);
        }

        return new Promise((resolve, reject) => {
            fs.readFile(file!, (err: NodeJS.ErrnoException | null, data: Buffer) => {
                if (err) {
                    reject(new ModuleNotFound(err.message, err));
                }

                resolve(data);
            });
        });
    } else {
        return new Promise((resolve, reject) => {
            let fetch_promise;

            /* @ts-ignore */
            if (URL.canParse(locator)) {
                fetch_promise = fetch(locator);
            } else {
                for (const resolver of module_resolvers) {
                    const resolved = resolver(locator);

                    if (resolved) {
                        fetch_promise = fetch(resolved);
                    }
                }

                fetch_promise ||= fetch(`/assets/${locator}.wasm`);
            }

            fetch_promise.then((value: Response) => {
                resolve(value.arrayBuffer() as Promise<Buffer>);
            }).catch((reason: any) => {
                reject(reason);
            });
        });
    }
};

export const load_module = async (locator: string): Promise<WebAssembly.Instance> => {
    const buffer = await load_module_source(locator);
    const module = await WebAssembly.compile(buffer);
    const wasi = await make_wasi({ version: "preview1" });
    return WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
}

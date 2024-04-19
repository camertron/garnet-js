import { is_node } from "./env";
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
    if (is_node) {
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
    let instance: WebAssembly.Instance;

    const config = {
        wasi_snapshot_preview1: wasi.wasiImport,
        env: {
            /* To get these functions to work, stick these lines in a header file somewhere:
             *
             * #define export __attribute__( ( visibility( "default" ) ) )
             * export int printf(const char *format, ...);
             * export int print_string(const char *str, unsigned int len);
             */
            printf: (...args: number[]) => {
                const data_view = new DataView((instance.exports.memory as WebAssembly.Memory).buffer);
                const mem = new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer);
                let i = 0;
                const str = [];

                while (true) {
                    if (mem[args[0] + i] === 0) {
                        break;
                    } else {
                        str.push(String.fromCharCode(mem[args[0] + i]));
                    }

                    i ++;
                }

                const format_str = str.join("");
                const len = Array.from(format_str.matchAll(/%/g)).length;
                const elems = [];

                for(let i = 0; i < len; i ++) {
                    elems.push(data_view.getUint32(args[1] + i * 4, true));
                }

                console.log(`${format_str.trim()}: [${elems.join(", ")}]`);

                return 0;
            },

            print_string: (address: number, len: number) => {
                const mem = new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer);
                let i = 0;
                const str = [];

                // Special flag that means look for a null byte at the end of the string to
                // know when to stop printing characters
                if (len === -1) {
                    while (true) {
                        if (mem[address + i] === 0) {
                            break;
                        } else {
                            str.push(String.fromCharCode(mem[address + i]));
                        }

                        i ++;
                    }
                } else {
                    for (let i = 0; i < len; i ++) {
                        str.push(String.fromCharCode(mem[address + i]));
                    }
                }

                console.log(str.join(""));

                return 0;
            }
        }
    }

    return WebAssembly.instantiate(module, config).then((inst) => {
        instance = inst;
        // depending on the module, you might have to call start() instead
        wasi.initialize(instance);
        return instance;
    });
}

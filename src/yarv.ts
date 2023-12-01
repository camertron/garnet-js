import { RValue } from "./runtime";
import { ExecutionContext } from "./execution_context";
import { vmfs } from "./vmfs";
import { Compiler } from "./compiler";
import { loadPrism } from "@ruby/prism";
import { Options } from "./options";
import { RubyError } from "./errors";
import { Onigmo, Regexp } from "./runtime/regexp";

// @TODO: figure out how to load wasm modules in the browser
import * as fs from "fs"
import { fileURLToPath } from "node:url";
import { WASI } from "wasi";

export async function init() {
    if (!ExecutionContext.current) {
        ExecutionContext.current = new ExecutionContext();
        Compiler.parse = await loadPrism();

        const onigmo_module = await WebAssembly.compile(fs.readFileSync(fileURLToPath(new URL("/Users/camertron/workspace/interscript/onigmo/onigmo.wasm", import.meta.url))));
        const wasi = new WASI({ version: "preview1" });

        /* @ts-ignore */
        const onigmo = await WebAssembly.instantiate(onigmo_module, wasi.getImportObject());
        wasi.initialize(onigmo);

        Regexp.onigmo = onigmo as unknown as Onigmo;
    }
}

export function evaluate(code: string, path?: string, compiler_options?: Options): RValue {
    if (!ExecutionContext.current) {
        throw new Error("The Ruby VM has not been initialized. Please call YARV.init().");
    }

    const insns = Compiler.compile_string(code, path || "<code>", compiler_options);

    try {
        return ExecutionContext.current.run_top_frame(insns);
    } catch (e) {
        // If we've gotten here, the error was not handled in Ruby or js, so
        // we print the backtrace and re-throw the error. The re-thrown error
        // should be handled by the caller.
        if (e instanceof RubyError) {
            ExecutionContext.print_backtrace(e);
        }

        throw e;
    }
}

export {
    Runtime,
    Class,
    ClassClass,
    Module,
    ModuleClass,
    Object,
    ObjectClass,
    BasicObjectClass,
    String,
    StringClass,
    RegexpClass,
    NilClass,
    Qnil,
    TrueClass,
    FalseClass,
    Qtrue,
    Qfalse,
    IO,
    STDOUT,
    STDERR
} from "./runtime";

export { ExecutionContext, vmfs, Regexp };

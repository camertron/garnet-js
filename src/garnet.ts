import { RValue, init as initRuntime } from "./runtime";
import { ExecutionContext } from "./execution_context";
import { vmfs } from "./vmfs";
import { Compiler, ParseLocal } from "./compiler";
import { CompilerOptions } from "./compiler_options";
import { RubyError, SystemExit } from "./errors";
import { Kernel } from "./runtime/kernel";
import { Object } from "./runtime/object";
import { Proc } from "./runtime/proc";
import { is_node } from "./env";
import * as WASM from "./wasm";
import { parsePrism } from "@ruby/prism/src/parsePrism";
import { Regexp } from "./runtime/regexp";

export async function init() {
    if (!ExecutionContext.current) {
        if (is_node) {
            const path = await import("path");
            const url = await import("url");

            WASM.add_to_module_path(
                path.resolve(path.join(path.dirname(url.fileURLToPath(import.meta.url)), "wasm_modules"))
            )
        }

        await initRuntime();

        ExecutionContext.current = new ExecutionContext();
        const prism_instance = await WASM.load_module("prism");

        Compiler.parse = (source) => {
            const scope: ParseLocal[] = [];

            // @TODO: this will need to be part of IRB or something
            ExecutionContext.current.top_locals.forEach((local) => {
                scope.push({name: local.name});
            });

            return parsePrism(prism_instance.exports, source, { scopes: [scope] });
        }
    }
}

export async function deinit() {
    for (const exit_handler of Kernel.exit_handlers) {
        // self and args are wrong here, but they're wrong for all procs.
        // We need to figure out bindings before this will make sense
        exit_handler.get_data<Proc>().call(ExecutionContext.current, []);
    }

    /* @ts-ignore */
    ExecutionContext.current = null;
}

export async function evaluate(code: string, path?: string, line: number = 1, compiler_options?: CompilerOptions): Promise<RValue> {
    if (!ExecutionContext.current) {
        throw new Error("The Ruby VM has not been initialized. Please call Garnet.init().");
    }

    const insns = Compiler.compile_string(code, path || "<code>", line, compiler_options);

    try {
        return ExecutionContext.current.run_top_frame(insns);
    } catch (e) {
        // If we've gotten here, the error was not handled in Ruby or js, so
        // we print the backtrace and re-throw the error. The re-thrown error
        // should be handled by the caller.
        if (e instanceof RubyError) {
            ExecutionContext.print_backtrace(e);
        } else if (e instanceof RValue) {
            // jesus christ improve this crap
            if (e.get_data<any>() instanceof RubyError) {
                if (e.get_data<RubyError>() instanceof SystemExit) {
                    await deinit();

                    if (is_node) {
                        process.exit(e.get_data<SystemExit>().status);
                    }
                }
            }

            if (Object.send(e, "is_a?", [Object.find_constant("Exception")!]).is_truthy()) {
                console.log(Object.send(e, "full_message").get_data<string>());
            }
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
    ObjectClass,
    BasicObjectClass,
    RegexpClass,
    NilClass,
    Qnil,
    TrueClass,
    FalseClass,
    Qtrue,
    Qfalse,
    STDOUT,
    STDERR,
    IOClass,
    RValue,
    Main
} from "./runtime";

export type { IO } from "./runtime";
export { String } from "./runtime/string";
export { RubyArray } from "./runtime/array";

export { Object } from "./runtime/object";
export { RubyError } from "./errors";

export { Encoding, UnicodeEncoding, register_encoding } from "./runtime/encoding"
export { is_node } from "./env"

export { ExecutionContext, vmfs, Regexp, WASM };

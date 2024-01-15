import { RValue, Runtime, init as initRuntime } from "./runtime";
import { ExecutionContext } from "./execution_context";
import { vmfs } from "./vmfs";
import { Compiler } from "./compiler";
import { Options } from "./options";
import { RubyError, SystemExit } from "./errors";
import { Kernel } from "./runtime/kernel";
import { Object } from "./runtime/object";
import { Proc } from "./runtime/proc";
import { isNode } from "./env";
import * as WASM from "./wasm";
import { parsePrism } from "@ruby/prism/src/parsePrism";
import { Regexp } from "./runtime/regexp";

export async function init() {
    if (!ExecutionContext.current) {
        if (isNode) {
            const path = await import("path");
            const url = await import("url");

            WASM.add_to_module_path(
                path.resolve(path.join(path.dirname(url.fileURLToPath(import.meta.url)), "wasm_modules"))
            )
        }

        await initRuntime();

        ExecutionContext.current = new ExecutionContext();

        const prism_instance = await WASM.load_module("prism");
        Compiler.parse = (source) => parsePrism(prism_instance.exports, source);
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

export async function evaluate(code: string, path?: string, compiler_options?: Options): Promise<RValue> {
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
        } else if (e instanceof RValue) {
            // jesus christ improve this crap
            if (e.get_data<any>() instanceof RubyError) {
                if (e.get_data<RubyError>() instanceof SystemExit) {
                    await deinit();

                    if (isNode) {
                        process.exit(e.get_data<SystemExit>().status);
                    }
                }
            }

            if (Object.send(e, "is_a?", [Runtime.constants["Exception"]]).is_truthy()) {
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
    Array,
    String,
    StringClass,
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
    RValue
} from "./runtime";

export type { IO } from "./runtime";

export { Object } from "./runtime/object";
export { RubyError } from "./errors";

export { ExecutionContext, vmfs, Regexp, WASM };

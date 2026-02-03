import { Qnil, RValue, Runtime, init as initRuntime } from "./runtime";
import { ExecutionContext } from "./execution_context";
import { vmfs } from "./vmfs";
import { Compiler } from "./compiler";
import { CompilerOptions } from "./compiler_options";
import { RubyError, SystemExit } from "./errors";
import { Kernel } from "./runtime/kernel";
import { Object } from "./runtime/object";
import { Proc } from "./runtime/proc";
import { is_node } from "./env";
import * as WASM from "./wasm";
import { parsePrism } from "@ruby/prism/src/parsePrism";
import { Regexp } from "./runtime/regexp";
import { Hash } from "./runtime/hash";
import { Integer } from "./runtime/integer";

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

        ExecutionContext.current = await ExecutionContext.create();
        const prism_instance = await WASM.load_module("prism");

        Compiler.parse = (source) => {
            const locals: string[] = [];

            // @TODO: this will need to be part of IRB or something
            ExecutionContext.current.top_locals.forEach((local) => {
                locals.push(local.name);
            });

            return parsePrism(prism_instance.exports, source, { scopes: [locals] });
        }
    }
}

export async function deinit() {
    for (const exit_handler of Kernel.exit_handlers) {
        // self and args are wrong here, but they're wrong for all procs.
        // We need to figure out bindings before this will make sense
        await exit_handler.get_data<Proc>().call(ExecutionContext.current, []);
    }

    /* @ts-ignore */
    ExecutionContext.current = null;
}

const check_ec = () => {
    if (!ExecutionContext.current) {
        throw new Error("The Ruby VM has not been initialized. Please call Garnet.init().");
    }
}

export async function unsafe_evaluate(code: string, path?: string, absolute_path?: string, line: number = 1, compiler_options?: CompilerOptions): Promise<RValue> {
    check_ec();

    return await ExecutionContext.current.gvl.run(async () => {
        const insns = Compiler.compile_string(code, path || "<code>", absolute_path || "<code>", line, compiler_options);
        return await ExecutionContext.current.run_top_frame(insns);
    });
}

// Like unsafe_evaluate, but catches and prints errors
export async function evaluate(code: string, path?: string, absolute_path?: string, line: number = 1, compiler_options?: CompilerOptions): Promise<RValue> {
    try {
        return await unsafe_evaluate(code, path, absolute_path, line, compiler_options);
    } catch (e) {
        // If we've gotten here, the error was not handled in Ruby or js, so
        // we print the backtrace and re-throw the error. The re-thrown error
        // should be handled by the caller.
        if (e instanceof RubyError) {
            // SystemExit should exit silently, i.e. without a backtrace
            if (e instanceof SystemExit) {
                await deinit();

                if (is_node) {
                    process.exit(e.status);
                }

                return await Integer.get(0);
            }

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

            if ((await Object.send(e, "is_a?", [(await Object.find_constant("Exception"))!])).is_truthy()) {
                await ExecutionContext.print_backtrace_rval(e);
            }
        } else {
            console.error(e);
        }

        return Qnil;
    }
}

export async function send(receiver: RValue, method_name: string, args: RValue[] = [], kwargs?: Hash, block?: RValue): Promise<RValue> {
    check_ec();

    return await ExecutionContext.current.gvl.run(async () => {
        return Object.send(receiver, method_name, args, kwargs, block);
    });
}

export async function invoke_proc(proc: RValue, args: RValue[] = [], kwargs?: Hash, block?: RValue): Promise<RValue> {
    check_ec();

    return ExecutionContext.current.gvl.run(async () => {
        return await proc.get_data<Proc>().call(ExecutionContext.current, args, kwargs, block);
    });
}

export async function require(require_path: string): Promise<boolean> {
    check_ec();

    return await ExecutionContext.current.gvl.run(async () => {
        return Runtime.require(require_path);
    });
}

export async function find_constant(name: string): Promise<RValue | null> {
    check_ec();

    // wrap with gvl because of autoloading
    return await ExecutionContext.current.gvl.run(async () => {
        return Object.find_constant(name);
    });
}

export async function find_constant_under(mod: RValue, name: string): Promise<RValue | null> {
    check_ec();

    // wrap with gvl because of autoloading
    return await ExecutionContext.current.gvl.run(async () => {
        return Object.find_constant_under(mod, name);
    });
}

export {
    Runtime,
    Class,
    ClassClass,
    Module,
    ModuleClass,
    ObjectClass,
    BasicObjectClass,
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

export { Compiler } from "./compiler";
export { InstructionSequence } from "./instruction_sequence";
export { CallDataFlag, CallData, MethodCallData, BlockCallData, } from "./call_data";

export type { IO } from "./runtime";
export { RubyString as String } from "./runtime/string";
export { RubyArray } from "./runtime/array";
export { Hash } from "./runtime/hash"
export { Integer } from "./runtime/integer";
export { Float } from "./runtime/float";
export { Proc } from "./runtime/proc";
export { Argf } from "./runtime/argf";

export { Object } from "./runtime/object";
export { RubyError, LoadError } from "./errors";

export { Encoding, UnicodeEncoding, register_encoding } from "./runtime/encoding"
export { is_node } from "./env"

export { ExecutionContext, vmfs, Regexp, WASM };

import { RValue } from "./runtime";
import { ExecutionContext } from "./execution_context";
import { vmfs } from "./vmfs";
import { Compiler } from "./compiler";
import { loadPrism } from "@ruby/prism";
import { Options } from "./options";

export async function init() {
    if (!ExecutionContext.current) {
        ExecutionContext.current = new ExecutionContext();
        Compiler.parse = await loadPrism();
    }
}

export function evaluate(code: string, compiler_options?: Options): RValue {
    if (!ExecutionContext.current) {
        throw new Error("The Ruby VM has not been initialized. Please call YARV.init().");
    }

    const insns = Compiler.compile_string(code, compiler_options);
    return ExecutionContext.current.run_top_frame(insns);
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

export { ExecutionContext, vmfs };

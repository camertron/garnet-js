import { InstructionSequence, YarvJson } from "./instruction_sequence";
import { Main } from "./main";
import { ExecutionContext } from "./execution_context";

export function evaluate(iseq_json: YarvJson) {
    let insns = InstructionSequence.compile(iseq_json);
    insns.evaluate(Main);
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

export { Main, ExecutionContext }

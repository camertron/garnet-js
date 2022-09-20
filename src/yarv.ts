import { InstructionSequence, YarvJson } from "./instruction_sequence";
import Main from "./main";

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
    Qfalse
} from "./runtime";

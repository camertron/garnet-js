import { InstructionSequence, YarvJson } from "./instruction_sequence";
import Main from "./main";

export function evaluate(iseq_json: YarvJson) {
    let insns = InstructionSequence.compile(Main, iseq_json);
    insns.evaluate();
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
    Qnil
} from "./runtime";

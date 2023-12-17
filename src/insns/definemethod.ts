import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";

export default class DefineMethod extends Instruction {
    public name: string;
    public iseq: InstructionSequence;

    constructor(name: string, iseq: InstructionSequence) {
        super();
        this.name = name;
        this.iseq = iseq;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.define_method(context.frame!.self, this.name, this.iseq);
        return null;
    }

    length(): number {
        return 3;
    }
}

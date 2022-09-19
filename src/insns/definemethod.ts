import ExecutionContext from "../execution_context";
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

    call(context: ExecutionContext) {
        context.define_method(context.current_frame().selfo, this.name, this.iseq);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 0;
    }
}

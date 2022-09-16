import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { ObjectClass, Runtime } from "../runtime";

export default class DefineClass extends Instruction {
    public name: string;
    public iseq: InstructionSequence;
    public flags: number;

    constructor(name: string, iseq: InstructionSequence, flags: number) {
        super();

        this.name = name;
        this.iseq = iseq;
        this.flags = flags;
    }

    call(context: ExecutionContext) {
        const klass = Runtime.define_class_under(context.current_iseq().selfo, this.name, ObjectClass);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 0;
    }
}

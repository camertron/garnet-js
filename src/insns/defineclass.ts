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
        const _super = context.stack.pop();
        const _cbase = context.stack.pop();  // I have no idea what this is
        const klass = Runtime.define_class_under(context.current_frame().selfo, this.name, ObjectClass);
        context.evaluate(klass, this.iseq);
    }

    reads(): number {
        return 2;
    }

    writes(): number {
        return 0;
    }
}

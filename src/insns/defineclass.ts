import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Runtime } from "../runtime";

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
        const superclass = context.stack.pop()!;
        const cbase = context.stack.pop()!;

        switch (this.flags) {
            // VM_DEFINECLASS_TYPE_CLASS
            case 0: {
                const klass = Runtime.define_class_under(cbase, this.name, superclass);
                context.evaluate(klass, this.iseq);
                break;
            }

            // VM_DEFINECLASS_TYPE_SINGLETON_CLASS, @TODO
            case 1: {
                break;
            }

            // VM_DEFINECLASS_TYPE_MODULE
            case 2: {
                const module = Runtime.define_module_under(cbase, this.name);
                context.evaluate(module, this.iseq);
                break;
            }

            // VM_DEFINECLASS_TYPE_MASK, @TODO, what even is this
            case 7: {
                break;
            }
        }
    }

    reads(): number {
        return 2;
    }

    writes(): number {
        return 0;
    }
}

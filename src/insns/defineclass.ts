import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Class, Runtime } from "../runtime";

export enum DefineClassFlags {
    TYPE_CLASS = 0,
    TYPE_SINGLETON_CLASS = 1,
    TYPE_MODULE = 2,
    FLAG_SCOPED = 8,
    FLAG_HAS_SUPERCLASS = 16
}

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

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const superclass = context.pop()!;
        const object = context.pop()!;

        if (this.name == "singletonclass") {
            context.push(await context.run_class_frame(this.iseq, object.get_singleton_class()));
        } else {
            // const constant = object.get_data<Class>().find_constant(this.name, false);
            const constant = object.get_data<Class>().constants[this.name];

            if (constant) {
                context.push(await context.run_class_frame(this.iseq, constant));
            } else if ((this.flags & DefineClassFlags.TYPE_MODULE) > 0) {
                const module = Runtime.define_module_under(object, this.name);
                context.push(await context.run_class_frame(this.iseq, module));
            } else {
                const klass = await Runtime.define_class_under(object, this.name, superclass);
                context.push(await context.run_class_frame(this.iseq, klass))
            }
        }

        return null;
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 4;
    }
}

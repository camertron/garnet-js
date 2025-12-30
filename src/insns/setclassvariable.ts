import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass } from "../runtime";

export default class SetClassVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        let klass = context.frame!.self;
        if (klass.klass !== ClassClass) klass = klass.klass;

        // For singleton classes, class variables are set on the attached object
        // (the class or object that the singleton class belongs to)
        if (klass.get_data<Class>().is_singleton_class && klass.get_data<Class>().attached_object) {
            klass = klass.get_data<Class>().attached_object!;
        }

        await klass.cvar_set(this.name, context.pop()!);
        return null;
    }

    length(): number {
        return 3;
    }

    pops(): number {
        return 1;
    }
}

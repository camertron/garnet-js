import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { IntegerClass, Qfalse, Qtrue } from "../runtime";

export default class OptGt extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);

        // This is supposed to be equivalent to MRI's "fast path" for comparing ints/floats.
        // @TODO: do the same thing for floats
        if (receiver.klass == IntegerClass && args[0].klass == IntegerClass) {
            if (receiver.get_data<number>() > args[0].get_data<number>()) {
                context.stack.push(Qtrue);
            } else {
                context.stack.push(Qfalse);
            }
        } else {
            const result = context.call_method(this.call_data, receiver, args);
            context.stack.push(result);
        }

        return null;
    }

    pops(): number {
        return this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }

    number(): number {
        return this.call_data.argc + 1;
    }
}

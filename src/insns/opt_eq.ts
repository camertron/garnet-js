import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { IntegerClass, Qfalse, Qtrue, StringClass, SymbolClass } from "../runtime";

export default class OptEq extends Instruction {
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
        const receiver_class = receiver.klass;
        const arg0_class = args[0].klass;

        if ((receiver_class == IntegerClass && arg0_class == IntegerClass) ||
            (receiver_class == StringClass && arg0_class == StringClass) ||
            (receiver_class == SymbolClass && arg0_class == SymbolClass)) {
            if (receiver.get_data<number | string>() == args[0].get_data<number | string>()) {
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

import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qfalse, Qtrue } from "../runtime";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object"
import { String } from "../runtime/string"
import { Symbol } from "../runtime/symbol"

export default class OptEq extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        // This is supposed to be equivalent to MRI's "fast path" for comparing ints/floats.
        // @TODO: do the same thing for floats
        const receiver_class = receiver.klass;
        const arg0_class = args[0].klass;

        if ((receiver_class == Integer.klass && arg0_class == Integer.klass) ||
            (receiver_class == String.klass && arg0_class == String.klass) ||
            (receiver_class == Symbol.klass && arg0_class == Symbol.klass)) {
            if (receiver.get_data<number | string>() == args[0].get_data<number | string>()) {
                context.push(Qtrue);
            } else {
                context.push(Qfalse);
            }
        } else {
            const result = Object.send(receiver, this.call_data, args);
            context.push(result);
        }

        return null;
    }

    pops(): number {
        return this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return this.call_data.argc + 1;
    }
}

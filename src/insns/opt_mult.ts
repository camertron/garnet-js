import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object"

export default class OptMult extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        // This is supposed to be equivalent to MRI's "fast path" for multiplying ints/floats.
        // @TODO: do the same thing for floats
        if (receiver.klass == Integer.klass && args[0].klass == Integer.klass) {
            context.push(
                Integer.new(receiver.get_data<number>() * args[0].get_data<number>())
            );
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

import CallData from "../call_data";
import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Integer, IntegerClass } from "../runtime";

export default class OptMult extends Instruction {
    public call_data: CallData;

    constructor(call_data: CallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext) {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);

        // This is supposed to be equivalent to MRI's "fast path" for multiplying ints/floats.
        // @TODO: do the same thing for floats
        if (receiver.klass == IntegerClass && args[0].klass == IntegerClass) {
            context.stack.push(
                Integer.new(receiver.get_data<number>() * args[0].get_data<number>())
            );
        } else {
            const result = context.call_method(this.call_data, receiver, args);
            context.stack.push(result);
        }
    }

    reads(): number {
        return this.call_data.argc + 1;
    }

    writes(): number {
        return 1;
    }
}

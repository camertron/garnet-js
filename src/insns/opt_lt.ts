import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qfalse, Qtrue } from "../runtime";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object"

export default class OptLt extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        // This is supposed to be equivalent to MRI's "fast path" for comparing ints/floats.
        // @TODO: do the same thing for floats
        if (receiver.klass === await Integer.klass() && args[0].klass === await Integer.klass()) {
            if (receiver.get_data<number>() < args[0].get_data<number>()) {
                context.push(Qtrue);
            } else {
                context.push(Qfalse);
            }
        } else {
            const result = await Object.send(receiver, this.call_data, args);
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

import { MethodCallData } from "../call_data";
import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object"

export default class OptPlus extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        // This is supposed to be equivalent to MRI's "fast path" for adding ints/floats.
        // @TODO: do the same thing for floats, strings, and arrays
        if (receiver.klass === await Integer.klass() && args[0].klass === await Integer.klass()) {
            context.push(
                await Integer.new(receiver.get_data<number>() + args[0].get_data<number>())
            );
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

    disasm(fmt: Disassembler): string {
        return fmt.instruction("opt_plus", [
            fmt.calldata(this.call_data)
        ]);
    }
}

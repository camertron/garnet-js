import CallData from "../call_data";
import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { InterpretedCallable } from "../runtime";
import { Proc } from "../runtime/proc";

export default class Send extends Instruction {
    public call_data: CallData;
    public block_iseq?: InstructionSequence;

    constructor(call_data: CallData, block_iseq?: InstructionSequence) {
        super();
        this.call_data = call_data;
        this.block_iseq = block_iseq;
    }

    call(context: ExecutionContext) {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);
        let block = undefined;

        if (this.block_iseq) {
            block = Proc.new(new InterpretedCallable(this.block_iseq));
        }

        const result = context.call_method(this.call_data, receiver, args, block);
        context.stack.push(result);
    }

    reads(): number {
        return this.call_data.argc + 1;
    }

    writes(): number {
        return 1;
    }
}

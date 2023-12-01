import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { InterpretedCallable, Proc } from "../runtime";

export default class Send extends Instruction {
    public call_data: MethodCallData;
    public block_iseq: InstructionSequence | null;

    constructor(call_data: MethodCallData, block_iseq: InstructionSequence | null) {
        super();
        this.call_data = call_data;
        this.block_iseq = block_iseq;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);
        let block = undefined;

        if (this.block_iseq) {
            block = Proc.new(new InterpretedCallable(this.call_data.mid, this.block_iseq));
        } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            block = context.pop();
        }

        const result = context.call_method(this.call_data, receiver, args, block);
        context.stack.push(result);
        return null;
    }

    pops(): number {
        const argb = (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG) ? 1 : 0);
        return argb + this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }

    number(): number {
        return 3;
    }
}

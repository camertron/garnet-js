import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Object } from "../runtime/object"
import { Proc } from "../runtime/proc";

export default class Send extends Instruction {
    public call_data: MethodCallData;
    public block_iseq: InstructionSequence | null;

    constructor(call_data: MethodCallData, block_iseq: InstructionSequence | null) {
        super();
        this.call_data = call_data;
        this.block_iseq = block_iseq;
    }

    call(context: ExecutionContext): ExecutionResult {
        let block = undefined;

        if (this.block_iseq) {
            block = Proc.from_iseq(context, this.block_iseq);
        } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            block = context.pop();
        }

        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        if (this.call_data.mid === "send" && args.length > 0 && args[0].data === "exception") {
            debugger;
        }

        const result = Object.send(receiver, this.call_data, args, block);
        context.push(result);
        return null;
    }

    pops(): number {
        const argb = (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG) ? 1 : 0);
        return argb + this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }
}

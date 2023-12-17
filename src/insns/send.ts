import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { NativeCallable, Proc, RValue } from "../runtime";

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
            const iseq = this.block_iseq;
            const frame = context.frame!;

            block = Proc.new(new NativeCallable((self: RValue, args: RValue[]): RValue => {
                return context.run_block_frame(iseq, frame, args);
            }));
        } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            block = context.pop();
        }

        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);

        const result = context.call_method(this.call_data, receiver, args, block);
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

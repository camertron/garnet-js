import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { Qnil, Qtrue, RubyArray } from "../garnet";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { RValue } from "../runtime";
import { Hash } from "../runtime/hash";
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
            block = context.pop()!;
            if (block !== Qnil) block = Object.send(block, "to_proc");
        }

        let kwargs: Hash | undefined = undefined;
        if (this.call_data.has_flag(CallDataFlag.KW_SPLAT)) {
            kwargs = context.pop()!.get_data<Hash>();
        } else if (this.call_data.has_flag(CallDataFlag.KWARG)) {
            kwargs = new Hash();
            const keyword_values = context.popn(this.call_data.kw_arg!.length);

            for (let i = 0; i < this.call_data.kw_arg!.length; i ++) {
                const keyword = this.call_data.kw_arg![i];
                kwargs.set_by_symbol(keyword, keyword_values[i]);
            }
        }

        const args = context.popn(this.call_data.argc);
        const receiver = context.pop()!;

        const result = Object.send(receiver, this.call_data, args, kwargs, block);
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

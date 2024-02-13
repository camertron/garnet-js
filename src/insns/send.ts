import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Kwargs, RValue } from "../runtime";
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
            block = context.pop();
        }

        let kwargs: Kwargs | undefined = undefined;
        const has_kw_splat = this.call_data.has_flag(CallDataFlag.KW_SPLAT);

        if (this.call_data.has_flag(CallDataFlag.KWARG) || has_kw_splat) {
            kwargs = new Map();

            const keyword_values = context.popn(this.call_data.kw_arg!.length);

            for (let i = 0; i < this.call_data.kw_arg!.length; i ++) {
                const keyword = this.call_data.kw_arg![i];

                if (keyword === "**" && has_kw_splat) {
                    const splatted_hash = keyword_values[i].get_data<Hash>();
                    splatted_hash.each((k: RValue, v: RValue) => {
                        kwargs!.set(k.get_data<string>(), v);
                    });
                } else {
                    kwargs.set(keyword, keyword_values[i]);
                }
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

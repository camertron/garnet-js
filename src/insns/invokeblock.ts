import { BlockCallData, CallDataFlag } from "../call_data";
import { LocalJumpError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Module, Qnil, Qtrue } from "../runtime";
import { Hash } from "../runtime/hash";
import { Proc } from "../runtime/proc";

export default class InvokeBlock extends Instruction {
    public call_data: BlockCallData;

    constructor(call_data: BlockCallData) {
        super();

        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const args = context.popn(this.call_data.argc);
        const frame_yield = context.frame_yield()!;
        const block = frame_yield.block;

        let kwargs: Hash | undefined = undefined;

        if (this.call_data.has_flag(CallDataFlag.KWARG)) {
            kwargs = new Hash();

            const keyword_values = context.popn(this.call_data.kw_arg!.length);

            for (let i = 0; i < this.call_data.kw_arg!.length; i ++) {
                const keyword = this.call_data.kw_arg![i];
                await kwargs.set_by_symbol(keyword, keyword_values[i]);
            }
        }

        if (block && block !== Qnil) {
            const result = await block.get_data<Proc>().call(context, args, kwargs, undefined, this.call_data);
            context.push(result);
        } else {
            throw new LocalJumpError("no block given (yield)");
        }

        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    pops(): number {
        return this.call_data.argc;
    }
}

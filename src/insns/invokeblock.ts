import { BlockCallData, CallDataFlag } from "../call_data";
import { LocalJumpError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Kwargs, Qtrue } from "../runtime";
import { Proc } from "../runtime/proc";

export default class InvokeBlock extends Instruction {
    public call_data: BlockCallData;

    constructor(call_data: BlockCallData) {
        super();

        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const args = context.popn(this.call_data.argc);
        const block = context.frame_yield()!.block;

        let kwargs: Kwargs | undefined = undefined;

        if (this.call_data.has_flag(CallDataFlag.KWARG)) {
            kwargs = new Map();

            const keyword_values = context.popn(this.call_data.kw_arg!.length);

            for (let i = 0; i < this.call_data.kw_arg!.length; i ++) {
                const keyword = this.call_data.kw_arg![i];
                kwargs.set(keyword, keyword_values[i]);
            }
        }

        if (block) {
            const result = block.get_data<Proc>().call(context, args, kwargs, this.call_data);
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

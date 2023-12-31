import { BlockCallData } from "../call_data";
import { LocalJumpError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Callable, Qnil } from "../runtime";
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

        if (block) {
            const result = block.get_data<Proc>().call(context, args, this.call_data);
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

import { BlockCallData } from "../call_data";
import { LocalJumpError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Callable, Qnil } from "../runtime";

export default class InvokeBlock extends Instruction {
    public calldata: BlockCallData;

    constructor(calldata: BlockCallData) {
        super();

        this.calldata = calldata;
    }

    call(context: ExecutionContext): ExecutionResult {
        const args = context.stack.splice(context.stack.length - this.calldata.argc, this.calldata.argc);
        const block = context.frame_yield()!.block;

        if (block) {
            const result = block.get_data<Callable>().call(context, Qnil, args);
            context.stack.push(result);
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
        return this.calldata.argc;
    }
}

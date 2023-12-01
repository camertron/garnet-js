import { MethodCallData, CallDataFlag } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";

export default class InvokeSuper extends Instruction {
    public calldata: MethodCallData;
    public block_iseq: InstructionSequence;

    constructor(calldata: MethodCallData, block_iseq: InstructionSequence) {
        super();

        this.calldata = calldata;
        this.block_iseq = block_iseq;
    }

    call(context: ExecutionContext): ExecutionResult {
        // @TODO: implement behavior
        return null;
    }

    number(): number {
        return 2;
    }

    pops(): number {
        const argb = (this.calldata.has_flag(CallDataFlag.ARGS_BLOCKARG) ? 1 : 0);
        return argb + this.calldata.argc + 1;
    }

    pushes(): number {
        return 1;
    }
}

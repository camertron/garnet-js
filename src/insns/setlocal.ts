import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetLocal extends Instruction {
    public index: number;
    public depth: number;

    constructor(index: number, depth: number) {
        super();

        this.index = index;
        this.depth = depth;
    }

    call(context: ExecutionContext): ExecutionResult {
        const local = context.frame?.frame_at(context, this.depth)?.iseq.local_table.locals[this.index]
        const value = context.pop()!;
        context.local_set(this.index, this.depth, value);
        return null;
    }

    pops(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

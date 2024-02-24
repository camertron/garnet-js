import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class GetBlockParamProxy extends Instruction {
    private index: number;
    private depth: number;

    constructor(index: number, depth: number) {
        super();
        this.index = index;
        this.depth = depth;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.push(context.local_get(this.index, this.depth));
        return null;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 3;
    }
}

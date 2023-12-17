import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class GetLocal extends Instruction {
    public index: number;
    public depth: number;

    constructor(index: number, depth: number) {
        super();

        this.index = index;
        this.depth = depth;
    }

    call(context: ExecutionContext): ExecutionResult {
        const value = context.local_get(this.index, this.depth);
        context.push(value);
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

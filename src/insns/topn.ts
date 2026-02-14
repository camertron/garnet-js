import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

// `topn` pushes a single value onto the stack that is a copy of the value
// within the stack that is the `index`th slot from the top.
export default class TopN extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(context.topn(this.index));
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

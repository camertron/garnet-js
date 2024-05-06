import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

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

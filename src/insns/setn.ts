import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetN extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.setn(this.index, context.peek());
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    pops(): number {
        return 1;
    }
}

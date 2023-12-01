import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class TopN extends Instruction {
    public count: number;

    constructor(count: number) {
        super();

        this.count = count;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.stack.push(context.stack[-this.number - 1]);
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

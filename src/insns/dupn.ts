import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class DupN extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        const values = context.popn(this.size);
        context.stack.push(...values, ...values);
        return null;
    }

    number(): number {
        return 2;
    }

    pushes(): number {
        return this.size;
    }
}

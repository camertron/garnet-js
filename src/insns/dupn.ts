import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class DupN extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const values = context.popn(this.size);
        context.push(...values, ...values);
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return this.size;
    }
}

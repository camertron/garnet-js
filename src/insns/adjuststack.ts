import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class AdjustStack extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.popn(this.size);
        return null;
    }

    number(): number {
        return 2;
    }

    pushes(): number {
        return this.size;
    }
}

import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import SetLocal from "./setlocal";

export default class SetLocalWC1 extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        return new SetLocal(this.index, 1).call(context);
    }

    pops(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

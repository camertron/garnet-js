import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import SetLocal from "./setlocal";

export default class SetLocalWC1 extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    call(context: ExecutionContext): ExecutionResult {
        return new SetLocal(this.index, 1).call(context);
    }

    pops(): number {
        return 1;
    }

    number(): number {
        return 2;
    }
}

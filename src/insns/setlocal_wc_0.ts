import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import SetLocal from "./setlocal";

export default class SetLocalWC0 extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    call(context: ExecutionContext): ExecutionResult {
        return new SetLocal(this.index, 0).call(context);
    }

    pops(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

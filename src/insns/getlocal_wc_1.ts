import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import GetLocal from "./getlocal";

export default class GetLocalWC1 extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    call(context: ExecutionContext): ExecutionResult {
        return new GetLocal(this.index, 1).call(context);
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

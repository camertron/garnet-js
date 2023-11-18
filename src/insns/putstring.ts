import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { RValue } from "../runtime";

export default class PutString extends Instruction {
    public string: RValue;

    constructor(string: RValue) {
        super();

        this.string = string;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.stack.push(this.string);
        return null;
    }

    pops(): number {
        return 0;
    }

    pushes(): number {
        return 1;
    }
}

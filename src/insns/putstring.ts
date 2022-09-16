import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { RValue } from "../runtime";

export default class PutString extends Instruction {
    public string: RValue;

    constructor(string: RValue) {
        super();
        this.string = string;
    }

    call(context: ExecutionContext) {
        context.stack.push(this.string);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
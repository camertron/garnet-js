import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { RValue } from "../runtime";

export default class PutObject extends Instruction {
    public object: RValue;

    constructor(object: RValue) {
        super();
        this.object = object;
    }

    call(context: ExecutionContext) {
        context.stack.push(this.object);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }

    override has_side_effects(): boolean {
        return false;
    }
}

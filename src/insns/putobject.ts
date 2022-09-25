import { ExecutionContext } from "../execution_context";
import Instruction, { ValueType } from "../instruction";

export default class PutObject extends Instruction {
    public object: ValueType;

    constructor(object: ValueType) {
        super();
        this.object = object;
    }

    call(context: ExecutionContext) {
        context.stack.push(Instruction.to_ruby(this.object));
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}

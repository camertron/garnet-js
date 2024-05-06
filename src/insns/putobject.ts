import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction, { ValueType } from "../instruction";

export default class PutObject extends Instruction {
    public object: ValueType;

    constructor(object: ValueType) {
        super();
        this.object = object;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(await Instruction.to_ruby(this.object));
        return null;
    }

    pops(): number {
        return 0;
    }

    pushes(): number {
        return 1;
    }
}

import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction, { ValueType } from "../instruction";

export default class PutObject extends Instruction {
    public object: ValueType;
    public id: number;

    private static next_id: number = 0;

    constructor(object: ValueType) {
        super();
        this.object = object;
        this.id = PutObject.next_id ++;
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

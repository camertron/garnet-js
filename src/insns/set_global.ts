import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const value = context.pop()!;
        context.globals[this.name] = value;
        return null;
    }

    length(): number {
        return 2;
    }

    pops(): number {
        return 1;
    }
}

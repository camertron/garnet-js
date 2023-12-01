import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    call(context: ExecutionContext): ExecutionResult {
        const value = context.stack.pop()!;
        context.globals[this.name] = value;
        return null;
    }

    number(): number {
        return 2;
    }

    pops(): number {
        return 1;
    }
}

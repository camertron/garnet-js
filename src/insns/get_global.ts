import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class GetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.stack.push(context.globals[this.name]);
        return null;
    }

    number(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

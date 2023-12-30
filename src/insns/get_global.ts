import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export default class GetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.push(context.globals[this.name] || Qnil);
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}

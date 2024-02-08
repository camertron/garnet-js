import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { ClassClass } from "../runtime";

export default class GetClassVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    call(context: ExecutionContext): ExecutionResult {
        let klass = context.frame!.self;
        if (klass.klass !== ClassClass) klass = klass.klass;
        context.push(klass.iv_get(this.name));
        return null;
    }

    length(): number {
        return 3;
    }

    pops(): number {
        return 1;
    }
}

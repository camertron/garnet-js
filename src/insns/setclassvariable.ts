import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { ClassClass } from "../runtime";

export default class SetClassVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        let klass = context.frame!.self;
        if (klass.klass !== ClassClass) klass = klass.klass;
        klass.iv_set(this.name, context.pop()!);
        return null;
    }

    length(): number {
        return 3;
    }

    pops(): number {
        return 1;
    }
}

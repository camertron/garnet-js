import { ExecutionContext, ExecutionResult } from "../execution_context";
import { NilClass } from "../runtime";
import Instruction from "../instruction";
import { Label } from "../instruction_sequence";

export class BranchNil extends Instruction {
    public label: Label;

    constructor(label: Label) {
        super();

        this.label = label;
    }

    call(context: ExecutionContext): ExecutionResult {
        const condition = context.pop();

        if (condition && condition.klass == NilClass) {
            return context.jump(this.label);
        }

        return null;
    }

    reads() {
        return 1;
    }

    branch_targets() {
        return [this.label];
    }

    does_falls_through() {
        return true;
    }
}

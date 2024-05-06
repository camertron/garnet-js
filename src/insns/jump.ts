import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Label } from "../instruction_sequence";

export class Jump extends Instruction {
    public label: Label;

    constructor(label: Label) {
        super();

        this.label = label;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        return context.jump(this.label);
    }

    pushes() {
        return 2;
    }

    pops() {
        return 1;
    }

    length() {
        return 1;
    }

    branch_targets() {
        return [this.label];
    }
}

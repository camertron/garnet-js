import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Label } from "../instruction_sequence";

export default class BranchIf extends Instruction {
    public label: Label;

    constructor(label: Label) {
        super();

        this.label = label;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const condition = context.pop()!;

        if (condition && condition.is_truthy()) {
            return context.jump(this.label);
        }

        return null;
    }

    length() {
        return 2;
    }

    branch_targets(): Label[] {
        return [this.label];
    }

    does_fall_through(): boolean {
        return true;
      }

    pops(): number {
        return 1;
    }
}

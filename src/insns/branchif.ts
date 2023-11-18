import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Label } from "../instruction_sequence";

export default class BranchIf extends Instruction {
    public label: Label;

    constructor(label: Label) {
        super();

        this.label = label;
    }

    call(context: ExecutionContext): ExecutionResult {
        const condition = context.stack.pop()!;

        if (condition && condition.is_truthy()) {
            return context.jump(this.label);
        }

        return null;
    }

    does_branch(): boolean {
        return true;
    }

    does_fall_through(): boolean {
        return true;
      }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }
}

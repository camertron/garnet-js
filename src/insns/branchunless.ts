import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Qfalse, Qnil } from "../runtime";

export default class BranchUnless extends Instruction {
    public label: string;

    constructor(label: string) {
        super();

        this.label = label;
    }

    call(context: ExecutionContext) {
        const condition = context.stack.pop()!;

        if (condition == Qnil || condition == Qfalse) {
            const jump_index = context.current_iseq().labels.get(this.label)!;
            context.program_counter = jump_index;
        }
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

import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export default class PutNil extends Instruction {
    call(context: ExecutionContext) {
        context.stack.push(Qnil);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }

    has_side_effects(): boolean {
        return false;
    }
}

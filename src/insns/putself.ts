import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { RValue } from "../runtime";

export default class PutSelf extends Instruction {
    call(context: ExecutionContext) {
        context.stack.push(context.current_frame().selfo);
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

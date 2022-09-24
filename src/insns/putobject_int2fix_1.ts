import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { INT2FIX1 } from "../runtime";

export default class PutObjectInt2Fix1 extends Instruction {
    call(context: ExecutionContext) {
        context.stack.push(INT2FIX1);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }

    override has_side_effects(): boolean {
        return false;
    }
}

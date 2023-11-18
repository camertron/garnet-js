import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { INT2FIX0 } from "../runtime";

export default class PutObjectInt2Fix0 extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        context.stack.push(INT2FIX0);
        return null;
    }

    pops(): number {
        return 0;
    }

    pushes(): number {
        return 1;
    }

    override has_side_effects(): boolean {
        return false;
    }
}

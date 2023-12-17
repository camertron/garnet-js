import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Integer } from "../runtime/integer";

export default class PutObjectInt2Fix1 extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        context.push(Integer.get(1));
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

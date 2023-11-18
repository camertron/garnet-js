import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Pop extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        context.stack.pop();
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 0;
    }
}

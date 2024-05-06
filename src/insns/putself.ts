import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class PutSelf extends Instruction {
    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(context.frame!.self);
        return null;
    }

    pops(): number {
        return 0;
    }

    pushes(): number {
        return 1;
    }

    has_side_effects(): boolean {
        return false;
    }
}

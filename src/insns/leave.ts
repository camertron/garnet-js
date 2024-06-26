import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Leave extends Instruction {
    async call(context: ExecutionContext): Promise<ExecutionResult> {
        return context.leave();
    }

    override does_leave(): boolean {
        return true;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 0;
    }
}

import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export default class PutNil extends Instruction {
    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(Qnil);
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

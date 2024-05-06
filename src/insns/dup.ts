import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Dup extends Instruction {
    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const value = context.pop()!;
        context.push(value);
        context.push(value);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 2;
    }
}

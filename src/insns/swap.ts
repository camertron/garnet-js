import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Swap extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        const first = context.stack.pop()!;
        const second = context.stack.pop()!;
        context.stack.push(first);
        context.stack.push(second);
        return null;
    }

    pops(): number {
        return 2;
    }

    number(): number {
        return 2;
    }
}

import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Swap extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        const first = context.pop()!;
        const second = context.pop()!;
        context.push(first);
        context.push(second);
        return null;
    }

    pops(): number {
        return 2;
    }

    length(): number {
        return 2;
    }
}

import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";

export default class Dup extends Instruction {
    call(context: ExecutionContext) {
        const value = context.stack.pop()!;
        context.stack.push(value);
        context.stack.push(value);
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 2;
    }
}

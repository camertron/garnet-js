import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Array } from "../runtime";

export default class NewArray extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        const elements = context.stack.splice(context.stack.length - this.size, this.size);
        context.stack.push(Array.new(elements));
        return null;
    }

    pops(): number {
        return this.size;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

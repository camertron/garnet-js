import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { RubyArray } from "../runtime/array";

export default class NewArray extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const elements = context.popn(this.size);
        context.push(await RubyArray.new(elements));
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

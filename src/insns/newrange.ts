import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Range } from "../runtime/range";

export default class NewRange extends Instruction {
    public exclude_end: boolean;

    constructor(exclude_end: boolean) {
        super();

        this.exclude_end = exclude_end;
    }

    call(context: ExecutionContext): ExecutionResult {
        const [left, right] = context.popn(2);
        context.push(Range.new(left, right, this.exclude_end));
        return null;
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

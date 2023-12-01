import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { String } from "../runtime";

export default class ConcatStrings extends Instruction {
    public count: number;

    constructor(count: number) {
        super();

        this.count = count;
    }

    call(context: ExecutionContext): ExecutionResult {
        const strings = context.stack.splice(context.stack.length - this.count, this.count);
        const joined = strings.map((str) => str.get_data<string>()).join("");
        context.stack.push(String.new(joined));
        return null;
    }

    pops(): number {
        return this.count;
    }

    pushes(): number {
        return 1;
    }

    number(): number {
        return 2;
    }
}

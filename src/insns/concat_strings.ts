import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { String } from "../runtime/string";

export default class ConcatStrings extends Instruction {
    public count: number;

    constructor(count: number) {
        super();

        this.count = count;
    }

    call(context: ExecutionContext): ExecutionResult {
        const strings = context.popn(this.count);
        const joined = strings.map((str) => str.get_data<string>()).join("");
        context.push(String.new(joined));
        return null;
    }

    pops(): number {
        return this.count;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

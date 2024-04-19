import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Runtime } from "../runtime";
import { Regexp } from "../runtime/regexp";

export default class ToRegexp extends Instruction {
    public flags: number;
    public size: number;

    constructor(flags: number, size: number) {
        super();

        this.flags = flags;
        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        const pattern = context.popn(this.size).map((elem) => Runtime.coerce_to_string(elem).get_data<string>()).join("");
        context.push(Regexp.new(pattern, this.flags));
        return null;
    }

    length(): number {
        return 3;
    }

    pushes(): number {
        return 1;
    }

    pops(): number {
        return this.size;
    }
}

import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Runtime } from "../runtime";
import { Regexp } from "../runtime/regexp";

export default class ToRegexp extends Instruction {
    public options: string;
    public size: number;

    constructor(options: string, size: number) {
        super();

        this.options = options;
        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        const pattern = context.popn(this.size).map((elem) => Runtime.coerce_to_string(elem).get_data<string>()).join("");
        context.push(Regexp.new(pattern, this.options));
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

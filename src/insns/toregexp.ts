import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Regexp } from "../runtime/regexp";

export default class ToRegexp extends Instruction {
    public flags: number;
    public size: number;

    constructor(flags: number, size: number) {
        super();

        this.flags = flags;
        this.size = size;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        // the compiler should ensure that all parts on the stack are already converted to strings
        // via the objtostring and anytostring instructions, so it's safe to assume they are all
        // strings here
        const chunks: string[] = context.popn(this.size).map(element => element.get_data<string>());
        const pattern = chunks.join("");
        context.push(await Regexp.new(pattern, this.flags));
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

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

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const chunks = await Promise.all(
            context.popn(this.size).map(async (elem) => {
                return (await Runtime.coerce_to_string(elem)).get_data<string>()
            })
        );

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

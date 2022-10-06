import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export default class GetInstanceVariable extends Instruction {
    public name: string;
    public cache: number;

    constructor(name: string, cache: number) {
        super();
        this.name = name;
        this.cache = cache;
    }

    call(context: ExecutionContext) {
        context.stack.push(
            context.current_frame().selfo.ivars[this.name] || Qnil
        );
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}

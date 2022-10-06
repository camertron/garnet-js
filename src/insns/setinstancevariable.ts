import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";

export default class SetInstanceVariable extends Instruction {
    public name: string;
    public cache: number;

    constructor(name: string, cache: number) {
        super();
        this.name = name;
        this.cache = cache;
    }

    call(context: ExecutionContext) {
        const value = context.stack.pop()!;
        context.current_frame().selfo.ivars[this.name] = value;
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }
}
